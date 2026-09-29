/**
 * SERVER-ONLY half of the Manager integration.
 *
 * Never import this from a `"use client"` module: it reaches for `next/server`
 * and Node's `AsyncLocalStorage`, neither of which exists in a browser bundle.
 * The browser half lives in `ManagerProvider.jsx`; shared config in `config.js`.
 *
 * Responsibilities:
 *   1. ONE cached root logger per process, created lazily.
 *   2. ONE request-local child logger per request, carrying the trace the
 *      browser adopted (or a fresh one).
 *   3. Delivery that survives the response: `after(() => root.flush())` runs on
 *      every exit — success, early return, thrown handler.
 *
 * Why each matters under Next.js:
 *
 *   - The root logger is cached on `globalThis`, not in module scope: Next
 *     compiles route handlers and startup hooks into separate module graphs, so
 *     a module-scoped instance can be a different object per graph and every
 *     "flush" would then flush a queue nobody wrote to.
 *
 *   - The child comes from `root.withTrace(traceId)`, never from
 *     `root.setContext(...)` or `root.newTrace()` on the shared root. Those
 *     MUTATE the root, so two concurrent requests overwrite each other's trace
 *     and correlation silently breaks under load.
 *
 *   - `after()` is the supported way to keep work alive past the response on
 *     serverless. A timer alone is not enough: a frozen timer after the
 *     response is exactly how entries get stranded. Log methods only ENQUEUE —
 *     `await log.error(...)` does NOT flush — so delivery is scheduled
 *     separately.
 *
 *   - `captureProcessErrors` is deliberately off. Next.js owns
 *     `uncaughtException` / `unhandledRejection`, and an extra process listener
 *     there stops delivery instead of adding to it.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { after } from "next/server";

import { initLogger, traceIdFromHeaders } from "./logger.js";
import { managerConfig } from "./config.js";
import { FLUSH_INTERVAL_MS, REDACT_KEYS } from "./server-options.js";

/** Cached root logger, shared by every module graph in the process. */
const GLOBAL_KEY = "__managerServerLogger";

const noop = () => {};

/** Same shape as a real logger so callers never need a null check. */
const NOOP_LOGGER = {
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  child: () => NOOP_LOGGER,
  time: noop,
  timeEnd: () => 0,
  flush: async () => {},
  droppedCount: () => 0,
  setContext: noop,
  withTrace: () => NOOP_LOGGER,
  newTrace: () => "",
  traceId: () => "",
  sessionId: () => "",
};

const disabled = () => !managerConfig.enabled;

function cachedRoot() {
  return globalThis[GLOBAL_KEY] ?? null;
}

/**
 * Per-request context: `{ log, startedAt, outcome }`.
 *
 * A route's child logger lives here so deeper code (`lib/recurring.js`, shared
 * helpers, models) can log with the request's trace WITHOUT every call site
 * threading a logger argument down — and without ever touching the shared root.
 * AsyncLocalStorage is what keeps two concurrent requests isolated; a plain
 * module-level variable could not do that.
 */
const requestStorage = new AsyncLocalStorage();

/** The current request's child logger, or null outside a request. */
export function getRequestLogger() {
  const store = requestStorage.getStore();
  return store?.log ?? null;
}

/**
 * The trace id attached to the CURRENT request, or "" outside one.
 *
 * Deliberately NOT `getRequestLogger()?.traceId()`. In the vendored SDK,
 * `traceId()` reads the logger's shared STATE, so a child created with
 * `withTrace()` emits entries under the right trace but REPORTS the root's —
 * asking it to prove isolation would silently read the wrong value. This app
 * owns the id it created, so it exposes its own copy.
 */
export function getRequestTraceId() {
  const store = requestStorage.getStore();
  return store?.traceId ?? "";
}

/**
 * The process-wide root logger, created on first use.
 *
 * Lazy on purpose: creating it at boot is unreliable under Next.js (separate
 * module graphs, and a boot-time instance is not necessarily the object a later
 * request sees). Never throws — an observability outage must not take the app
 * down.
 */
export function getManagerLogger() {
  if (disabled()) {
    return cachedRoot() ?? NOOP_LOGGER;
  }
  const existing = cachedRoot();
  if (existing !== null) {
    return existing;
  }
  try {
    const logger = initLogger({
      endpoint: managerConfig.endpoint,
      appId: managerConfig.appId,
      apiKey: managerConfig.apiKey,
      environment:
        process.env.NODE_ENV === "production" ? "production" : "development",
      release:
        process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || "dev",
      // null === off: Next.js owns process error handling, and this app routes
      // its own API failures through logServerError() explicitly.
      captureConsole: null,
      captureGlobalErrors: false,
      captureProcessErrors: false,
      captureFetch: false,
      redactKeys: REDACT_KEYS,
      flushIntervalMs: FLUSH_INTERVAL_MS,
    });
    globalThis[GLOBAL_KEY] = logger;
    logger.info("manager_logger_started", { source: "server" });
    return logger;
  } catch (error) {
    console.warn(
      "[manager] logger failed to start:",
      error instanceof Error ? error.message : error
    );
    return NOOP_LOGGER;
  }
}

/** Alias kept so existing imports of `startManagerLogger` keep working. */
export function startManagerLogger() {
  return getManagerLogger();
}

/**
 * The root logger, created on first use — or `null` when the integration is
 * disabled. `withManagerLogs` uses this (rather than the cached value) so a
 * request is what actually triggers creation: a route that logs nothing but
 * still needs its completion entry delivered must not depend on some earlier
 * `logServerError()` call having booted the logger first.
 */
function rootLoggerOrNull() {
  if (disabled()) return null;
  const logger = getManagerLogger();
  return logger === NOOP_LOGGER ? null : logger;
}

/**
 * Adopts the browser's trace off a request, or mints one.
 * "" when the integration is disabled, so `withTrace("")` stays a no-op.
 */
export function traceIdForRequest(request) {
  if (disabled()) return "";
  const incoming = traceIdFromHeaders(request?.headers);
  return incoming !== "" ? incoming : randomUUID();
}

/**
 * Flushes the shared queue after the response has been sent.
 *
 * Safe to call unconditionally: `after()` is only valid inside a request scope,
 * and a failed flush must never surface as an unhandled rejection — so both the
 * `after()` registration and the flush are guarded.
 */
export function scheduleFlush() {
  const root = cachedRoot();
  if (root === null) return;
  try {
    after(async () => {
      try {
        await root.flush();
      } catch {
        /* best effort: delivery failure is never an app failure */
      }
    });
  } catch {
    /* no request scope (script, unit test) — the SDK timer still applies */
  }
}

/**
 * Wraps a route handler so that:
 *   - the request gets a trace-scoped child logger (adopted or fresh),
 *   - an uncaught exception is recorded with its stack and then RE-THROWN, so
 *     the app's existing error-response policy is untouched,
 *   - the queue is flushed once the response completes, on EVERY exit path
 *     (success, early return, throw),
 *   - a single completion entry records the status actually produced, which is
 *     what makes successful responses, redirects, exports and early returns
 *     visible instead of only the failures.
 *
 * Handled failures — a `catch` that returns a response — remain the handler's
 * responsibility: log them there with `logServerError`, otherwise the wrapper
 * has nothing to report beyond the status.
 *
 * @param {(request: Request, context: any, log: object|null) => any} handler
 */
export function withManagerLogs(handler) {
  return async function loggedRouteHandler(request, context) {
    const root = rootLoggerOrNull();
    const traceId = traceIdForRequest(request);

    // `withTrace` returns a CHILD; the root's own trace is never touched, so
    // two in-flight requests can never read each other's correlation id.
    const log =
      root !== null ? (traceId === "" ? root : root.withTrace(traceId)) : null;

    const route = describeRoute(request);
    const store = { log, traceId, startedAt: Date.now(), outcome: null };

    return requestStorage.run(store, async () => {
      try {
        const result = await handler(request, context, log);
        store.outcome = outcomeOf(result);
        return result;
      } catch (error) {
        // A handler that already described its outcome (e.g. a thrown
        // redirect, which Next converts to a 3xx rather than a return value)
        // keeps it; "threw" is only the fallback.
        if (store.outcome === null) store.outcome = { kind: "threw" };
        // Record, then rethrow: the app's error-response policy is unchanged.
        logWith(log, "error", "unhandled_route_error", { error, route });
        throw error;
      } finally {
        logCompletion(store, route);
        scheduleFlush();
      }
    });
  };
}

/**
 * Lets a handler describe an outcome the wrapper cannot infer — a thrown
 * `redirect()`, or a streamed export that never becomes a plain `Response`.
 * Per-request, so it cannot leak across concurrent requests.
 */
export function reportRequestOutcome(kind, extra = {}) {
  const store = requestStorage.getStore();
  if (store === undefined) return;
  store.outcome = { kind, ...extra };
}

/** Classifies what a handler returned, for the completion entry's `outcome`. */
function outcomeOf(result) {
  if (result === null || typeof result !== "object") return null;
  const status = typeof result.status === "number" ? result.status : null;
  const location = safeHeader(result, "location");
  if (location !== null) return { kind: "redirect", status: status ?? 307 };
  const contentType = safeHeader(result, "content-type") ?? "";
  if (contentType.includes("text/csv")) return { kind: "export", status };
  return { kind: "response", status };
}

function safeHeader(response, name) {
  try {
    const value = response?.headers?.get?.(name);
    return typeof value === "string" && value !== "" ? value : null;
  } catch {
    return null;
  }
}

function logCompletion(store, route) {
  const { log, startedAt, outcome } = store;
  if (log === null) return;
  log.info("request_completed", {
    route,
    durationMs: Date.now() - startedAt,
    ...(outcome?.status ? { status: outcome.status } : {}),
    ...(outcome?.kind ? { outcome: outcome.kind } : {}),
  });
}

function describeRoute(request) {
  if (!request) return undefined;
  const method = request.method ?? "GET";
  let path;
  try {
    path = new URL(request.url).pathname;
  } catch {
    path = undefined;
  }
  return path === undefined ? method : `${method} ${path}`;
}

/** Writes one entry through the request logger, else the root. Never throws. */
function logWith(log, level, message, meta) {
  try {
    const target = log ?? cachedRoot();
    if (target === null || target === undefined) return;
    const fn = typeof target[level] === "function" ? target[level] : target.info;
    fn.call(target, message, meta);
  } catch {
    /* observability must never throw into a request */
  }
}

/**
 * Emits a server log on the CURRENT request's logger when there is one, so the
 * entry inherits that request's trace. Outside a request it falls back to root.
 */
export function managerLog(level, message, meta = {}) {
  if (disabled()) return;
  logWith(getRequestLogger(), level, message, meta);
}

/** Records an API outcome. Safe to call from any server code. */
export function logServerEvent(message, meta = {}) {
  managerLog("info", message, meta);
}

/**
 * Records a failure. `error` may be an Error, a serialized `{ stack }` object,
 * or a plain value — pass it under the `error` key so the SDK lifts a real stack
 * to the TOP level of the entry instead of burying it inside `meta`.
 */
export function logServerError(message, error, meta = {}) {
  managerLog("error", message, {
    ...meta,
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error,
  });
}

/** How many entries this process discarded (SDK self-rate-limit / queue cap). */
export function getManagerDroppedCount() {
  const log = cachedRoot();
  return log !== null && typeof log.droppedCount === "function"
    ? log.droppedCount()
    : 0;
}

/**
 * Flushes the shared queue for code OUTSIDE a request (scripts, workers, cron
 * jobs). Call it in the job's `finally` before exit: a job that ends without a
 * flush can lose whatever is still inside the batch window.
 */
export async function flushManagerLogger() {
  const root = cachedRoot();
  if (root === null) return;
  try {
    await root.flush();
  } catch {
    /* best effort */
  }
}
