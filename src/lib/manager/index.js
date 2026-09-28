/**
 * Manager integration — centralized logging + analytics.
 *
 * Everything here is optional: with no MANAGER_* env vars configured the app keeps
 * working and this module becomes a set of no-ops, so local development, CI and
 * previews are never broken by (or dependent on) the observability service.
 *
 * Configure (Vercel or .env.local):
 *   MANAGER_ENDPOINT      https://manager.example.com
 *   MANAGER_APP_ID        finance-app
 *   MANAGER_LOG_KEY       mlk_…   (server)  or  mck_… (browser)
 *   MANAGER_ANALYTICS_KEY mak_… (tracker)
 *   MANAGER_LOG_SOURCE    server | client   (optional, inferred when omitted)
 *
 * And, for the browser half (see clientEnv below):
 *   NEXT_PUBLIC_MANAGER_ENDPOINT      https://manager.example.com
 *   NEXT_PUBLIC_MANAGER_APP_ID        finance-app
 *   NEXT_PUBLIC_MANAGER_CLIENT_KEY    mck_…
 *   NEXT_PUBLIC_MANAGER_ANALYTICS_KEY mak_…
 *
 * This app has no logger of its own, so this module is the single entry point:
 * API route handlers call logServerEvent()/logServerError() directly, next to the
 * console.error they already emitted.
 *
 * See README.md § "Manager integration" for the full contract.
 */
import { initLogger } from "./logger";

const SOURCE = process.env.MANAGER_LOG_SOURCE === "client" ? "client" : "server";

function env(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function clean(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * The values the BROWSER can see.
 *
 * Next.js only inlines *statically written* `process.env.NEXT_PUBLIC_FOO` member
 * expressions into the client bundle. Two traps, both verified against a production
 * build of this repo:
 *  1. `process.env` in browser code is an empty object, so a plain `process.env.MANAGER_*`
 *     lookup inside a 'use client' module always resolves to undefined;
 *  2. a *dynamic* lookup (`process.env[name]`, i.e. the `env()` helper above) is not
 *     inlined either — it compiles to a runtime index into that same empty object.
 * So every client value below is written out statically, and the browser log key is the
 * project's client key (`mck_…`): Manager derives each entry's source from the key kind.
 */
const CLIENT_ENDPOINT = clean(process.env.NEXT_PUBLIC_MANAGER_ENDPOINT);
const CLIENT_APP_ID = clean(process.env.NEXT_PUBLIC_MANAGER_APP_ID);
const CLIENT_LOG_KEY = clean(
  process.env.NEXT_PUBLIC_MANAGER_CLIENT_KEY ?? process.env.NEXT_PUBLIC_MANAGER_LOG_KEY
);
const CLIENT_ANALYTICS_KEY = clean(process.env.NEXT_PUBLIC_MANAGER_ANALYTICS_KEY);

/** Everything ManagerProvider needs. Separate from `managerConfig` by design. */
export const managerClientConfig = {
  endpoint: CLIENT_ENDPOINT,
  appId: CLIENT_APP_ID,
  apiKey: CLIENT_LOG_KEY,
  analyticsKey: CLIENT_ANALYTICS_KEY,
  enabled: Boolean(CLIENT_ENDPOINT && CLIENT_APP_ID && CLIENT_LOG_KEY),
};

export const managerConfig = {
  endpoint: env("MANAGER_ENDPOINT"),
  appId: env("MANAGER_APP_ID"),
  apiKey: env("MANAGER_LOG_KEY"),
  analyticsKey: env("MANAGER_ANALYTICS_KEY"),
  source: SOURCE,
  enabled: Boolean(env("MANAGER_ENDPOINT") && env("MANAGER_APP_ID") && env("MANAGER_LOG_KEY")),
};

const noop = () => {};

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
  setContext: noop,
  withTrace: () => NOOP_LOGGER,
  newTrace: () => "",
};

const GLOBAL_KEY = "__managerServerLogger";
const scope = globalThis;

/**
 * The logger is created lazily, on first use, and cached on globalThis.
 *
 * Two reasons it is not created during app boot:
 *  - server frameworks compile route handlers and startup hooks into separate module
 *    graphs, so an instance created at boot can be a different object than the one a
 *    request sees;
 *  - a Next.js server (and Vercel functions in particular) can freeze timers once a
 *    response is sent, so a logger that only relies on its background flush timer can
 *    lose entries created outside a request.
 * Creating it on demand inside the request and flushing on every write avoids both.
 */
function cachedLogger() {
  return scope[GLOBAL_KEY] ?? null;
}

/**
 * Creates the server logger on first use and caches it on globalThis so every module
 * instance in the process shares one queue. Safe to call repeatedly.
 * Never throws: an observability outage must not take the app down.
 */
export function startManagerLogger() {
  if (!managerConfig.enabled) {
    return cachedLogger() ?? NOOP_LOGGER;
  }
  const existing = cachedLogger();
  if (existing !== null) {
    return existing;
  }
  try {
    const logger = initLogger({
      endpoint: managerConfig.endpoint,
      appId: managerConfig.appId,
      apiKey: managerConfig.apiKey,
      environment: process.env.NODE_ENV === "production" ? "production" : "development",
      release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || "dev",
      captureConsole: null,
      captureGlobalErrors: false,
      captureFetch: false,
      redactKeys: [
        "password",
        "token",
        "secret",
        "authorization",
        "cookie",
        "apikey",
        "api_key",
        "cvv",
      ],
      sampleRate: process.env.NODE_ENV === "production" ? { debug: 0.1, trace: 0 } : {},
    });
    scope[GLOBAL_KEY] = logger;
    logger.info("manager_logger_started", { source: "server" });
    return logger;
  } catch (err) {
    console.warn("[manager] logger failed to start:", err?.message ?? err);
    return NOOP_LOGGER;
  }
}

/** The server logger, created on first use and cached on globalThis. Never null. */
export function getManagerLogger() {
  return cachedLogger() ?? startManagerLogger();
}

/**
 * Emits a server log and flushes immediately.
 *
 * The SDK batches on a 5s timer, but serverless runtimes (Vercel functions) may freeze
 * timers once the response is sent, which silently drops the batch. Flushing after each
 * entry keeps delivery guaranteed; the SDK still batches internally, so bursts collapse.
 * Fire-and-forget: never await, never throw.
 */
export function managerLog(level, message, meta = {}) {
  if (!managerConfig.enabled) return;
  try {
    const log = getManagerLogger();
    const fn = typeof log[level] === "function" ? log[level] : log.info;
    fn.call(log, message, meta);
    const flushed = log.flush();
    if (flushed && typeof flushed.catch === "function") {
      flushed.catch(() => {});
    }
  } catch {
    /* observability must never throw */
  }
}

/** Records an API route outcome. Call from route handlers and server actions. */
export function logServerEvent(message, meta = {}) {
  managerLog("info", message, meta);
}

/** Records a failure. `error` may be an Error or a plain object. */
export function logServerError(message, error, meta = {}) {
  managerLog("error", message, {
    ...meta,
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : error,
  });
}

/**
 * Tracker <script> for the browser, or null when analytics is not configured.
 * Reads the client block: this is only ever called from `ManagerProvider`.
 */
export function managerTrackerScript() {
  const endpoint = CLIENT_ENDPOINT;
  const appId = CLIENT_APP_ID;
  const analyticsKey = CLIENT_ANALYTICS_KEY;
  if (!endpoint || !appId || !analyticsKey) return null;
  return {
    src: `${endpoint}/t.js?v=1`,
    appId,
    key: analyticsKey,
  };
}
