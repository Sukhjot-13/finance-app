// test/suites/manager-server.suite.js — src/lib/manager/server.js
//
// Covers the server channel: one cached root logger, request-local children,
// trace adoption, concurrent isolation, delivery at request completion, and the
// response coverage the integration is supposed to guarantee.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const SERVER_ENV = {
  MANAGER_ENDPOINT: "http://127.0.0.1:3300",
  MANAGER_APP_ID: "finance-app",
  MANAGER_LOG_KEY: "mlk_server_key",
  MANAGER_ANALYTICS_KEY: "mak_analytics_key",
};

const MANAGER_VARS = Object.keys(SERVER_ENV);

const setEnv = (values) => {
  for (const key of MANAGER_VARS) delete process.env[key];
  for (const [key, value] of Object.entries(values ?? {})) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

const sdkShutdowns = new Set();

const loadServer = async () => {
  vi.resetModules();
  delete globalThis.__managerServerLogger;
  const server = await import("@/lib/manager/server");
  const { shutdownLoggers } = await import("@/lib/manager/logger");
  sdkShutdowns.add(shutdownLoggers);
  return server;
};

/**
 * A stand-in for the SDK logger that records every entry and, crucially, keeps
 * a per-instance trace so tests can prove which logger an entry went through.
 */
function fakeLogger(label = "root") {
  const entries = [];
  const logger = {
    label,
    entries,
    traceValue: `trace_${label}`,
    flush: vi.fn(async () => {}),
    droppedCount: vi.fn(() => 0),
    withTrace: vi.fn(function (traceId) {
      const child = fakeLogger(`${label}:${traceId}`);
      child.traceValue = traceId;
      logger.withTraceCalls.push(traceId);
      return child;
    }),
    withTraceCalls: [],
    setContext: vi.fn(),
    newTrace: vi.fn(() => "root_generated_trace"),
    traceId: vi.fn(() => logger.traceValue),
  };
  for (const level of ["trace", "debug", "info", "warn", "error", "fatal"]) {
    logger[level] = vi.fn((message, meta) =>
      entries.push({ level, message, meta, via: logger.label, trace: logger.traceValue })
    );
  }
  return logger;
}

const request = (url = "http://localhost:3000/api/transactions", headers = {}) =>
  new Request(url, { headers });

describe("manager server channel", () => {
  beforeEach(() => {
    setEnv({});
    globalThis.__afterCallbacks = [];
  });
  afterEach(() => {
    for (const shutdown of sdkShutdowns) shutdown();
    sdkShutdowns.clear();
    localStorage.removeItem("manager.logger.queue");
    setEnv({});
    delete globalThis.__managerServerLogger;
    globalThis.__afterCallbacks = [];
  });

  it("degrades to no-ops when unconfigured, without touching `after`", async () => {
    const { getManagerLogger, managerLog, logServerError, getManagerDroppedCount } =
      await loadServer();

    expect(() => managerLog("info", "noop")).not.toThrow();
    expect(() => logServerError("noop", new Error("boom"))).not.toThrow();
    const log = getManagerLogger();
    expect(() => log.info("noop")).not.toThrow();
    expect(await log.flush()).toBeUndefined();
    expect(getManagerDroppedCount()).toBe(0);
    expect(globalThis.__managerServerLogger).toBeUndefined();
    expect(globalThis.__afterCallbacks).toHaveLength(0);
  });

  it("creates ONE root logger and shares it across module instances", async () => {
    setEnv(SERVER_ENV);
    const first = await loadServer();
    const root = first.getManagerLogger();
    expect(root).toBeTruthy();
    expect(root.info).toBeTruthy();

    // A second module graph (what Next produces) must reuse the same instance,
    // otherwise a flush would drain a queue nobody wrote to.
    vi.resetModules();
    const second = await import("@/lib/manager/server");
    expect(second.getManagerLogger()).toBe(root);
    expect(globalThis.__managerServerLogger).toBe(root);
  });

  it("creates the logger lazily but does so for a request that logs nothing", async () => {
    setEnv(SERVER_ENV);
    const { withManagerLogs } = await loadServer();
    const root = fakeLogger();
    globalThis.__managerServerLogger = root;

    // A silent handler must still get a completion entry + a flush.
    const GET = withManagerLogs(async () => Response.json({ ok: true }));
    await GET(request(), {});
    expect(root.withTraceCalls).toHaveLength(1);
    expect(globalThis.__afterCallbacks).toHaveLength(1);
  });

  it("adopts the browser's trace and scopes it to a CHILD logger", async () => {
    setEnv(SERVER_ENV);
    const { withManagerLogs, traceIdForRequest } = await loadServer();
    const root = fakeLogger();
    globalThis.__managerServerLogger = root;

    const GET = withManagerLogs(async () => Response.json({}));
    await GET(
      request("http://localhost:3000/api/budgets", { "x-trace-id": "browser-trace-1" }),
      {}
    );

    expect(root.withTraceCalls).toEqual(["browser-trace-1"]);
    // The ROOT's context must never be mutated: two concurrent requests would
    // otherwise overwrite each other's correlation id.
    expect(root.setContext).not.toHaveBeenCalled();
    expect(root.newTrace).not.toHaveBeenCalled();
    expect(root.traceValue).toBe("trace_root");
    expect(traceIdForRequest(request())).not.toBe("");
  });

  it("mints a trace when the request carries none", async () => {
    setEnv(SERVER_ENV);
    const { withManagerLogs } = await loadServer();
    const root = fakeLogger();
    globalThis.__managerServerLogger = root;

    const GET = withManagerLogs(async () => Response.json({}));
    await GET(request(), {});

    expect(root.withTraceCalls).toHaveLength(1);
    expect(root.withTraceCalls[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("keeps concurrent requests on separate traces", async () => {
    setEnv(SERVER_ENV);
    const { withManagerLogs } = await loadServer();
    const root = fakeLogger();
    globalThis.__managerServerLogger = root;

    // Each request logs from a different delay so the two overlap in time —
    // the exact interleaving that breaks a module-level "current request".
    const seen = {};
    const make = (name, delay) =>
      withManagerLogs(async () => {
        await new Promise((r) => setTimeout(r, delay));
        const { logServerEvent } = await import("@/lib/manager/server");
        logServerEvent(`${name}_inner`);
        seen[name] = true;
        return Response.json({});
      });

    await Promise.all([
      make("slow", 40)(
        request("http://localhost:3000/api/reports/dashboard", { "x-trace-id": "trace-slow" }),
        {}
      ),
      make("fast", 5)(
        request("http://localhost:3000/api/reports/dashboard", { "x-trace-id": "trace-fast" }),
        {}
      ),
    ]);

    expect(seen).toEqual({ slow: true, fast: true });
    expect(root.withTraceCalls).toEqual(
      expect.arrayContaining(["trace-slow", "trace-fast"])
    );

    // Every entry logged inside a request must carry THAT request's trace.
    for (const message of entriesOf(root).filter((e) => e.message.endsWith("_inner"))) {
      expect(["trace-slow", "trace-fast"]).toContain(message.trace);
    }
  });

  it("records the status the handler actually produced", async () => {
    setEnv(SERVER_ENV);
    const { withManagerLogs } = await loadServer();
    const root = fakeLogger();
    globalThis.__managerServerLogger = root;

    const GET = withManagerLogs(async () => Response.json({ ok: true }, { status: 201 }));
    await GET(request(), {});

    const completion = entriesOf(root).find((e) => e.message === "request_completed");
    expect(completion.meta).toMatchObject({
      route: "GET /api/transactions",
      status: 201,
      outcome: "response",
    });
    expect(typeof completion.meta.durationMs).toBe("number");
  });

  it("classifies redirects and CSV exports distinctly", async () => {
    setEnv(SERVER_ENV);
    const { withManagerLogs } = await loadServer();
    const root = fakeLogger();
    globalThis.__managerServerLogger = root;

    const redirect = withManagerLogs(
      async () => new Response(null, { status: 307, headers: { location: "/login" } })
    );
    await redirect(request("http://localhost:3000/dashboard"), {});

    const exported = withManagerLogs(
      async () =>
        new Response("a,b\n", {
          status: 200,
          headers: { "content-type": "text/csv; charset=utf-8" },
        })
    );
    await exported(request("http://localhost:3000/api/reports/export"), {});

    const completions = entriesOf(root).filter((e) => e.message === "request_completed");
    expect(completions[0].meta.outcome).toBe("redirect");
    expect(completions[1].meta.outcome).toBe("export");
    expect(completions[1].meta.status).toBe(200);
  });

  it("lets a handler report an outcome it cannot return (thrown redirect)", async () => {
    setEnv(SERVER_ENV);
    const { withManagerLogs, reportRequestOutcome } = await loadServer();
    const root = fakeLogger();
    globalThis.__managerServerLogger = root;

    const GET = withManagerLogs(async () => {
      reportRequestOutcome("redirect", { status: 303 });
      throw Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;303" });
    });
    await expect(GET(request("http://localhost:3000/dashboard"), {})).rejects.toThrow();

    const completion = entriesOf(root).find((e) => e.message === "request_completed");
    expect(completion.meta).toMatchObject({ outcome: "redirect", status: 303 });
    expect(entriesOf(root).some(e => e.message === "unhandled_route_error")).toBe(false);
  });

  it("preserves a reported export outcome for a returned stream response", async () => {
    setEnv(SERVER_ENV);
    const { withManagerLogs, reportRequestOutcome } = await loadServer();
    const root = fakeLogger();
    globalThis.__managerServerLogger = root;
    const GET = withManagerLogs(async () => {
      reportRequestOutcome("export", { status: 200 });
      return new Response("stream", { headers: { "content-type": "application/octet-stream" } });
    });
    await GET(request(), {});
    expect(entriesOf(root).find(e => e.message === "request_completed").meta)
      .toMatchObject({ outcome: "export", status: 200 });
  });

  it("preserves explicit outcomes and a response when completion logging fails", async () => {
    setEnv(SERVER_ENV);
    const { withManagerLogs, reportRequestOutcome } = await loadServer();
    const root = fakeLogger();
    globalThis.__managerServerLogger = root;
    const response = Response.json({ ok: true });
    const GET = withManagerLogs(async (request, context, log) => {
      reportRequestOutcome("export", { status: 200 });
      log.info = () => { throw new Error("synthetic logger failure"); };
      return response;
    });
    await expect(GET(request(), {})).resolves.toBe(response);
    expect(globalThis.__afterCallbacks).toHaveLength(1);
  });

  it("records an uncaught exception with its stack and re-throws unchanged", async () => {
    setEnv(SERVER_ENV);
    const { withManagerLogs } = await loadServer();
    const root = fakeLogger();
    globalThis.__managerServerLogger = root;

    const boom = new Error("integration_probe_uncaught");
    const GET = withManagerLogs(async () => {
      throw boom;
    });

    // Re-thrown so the app's own error-response policy is preserved.
    await expect(GET(request(), {})).rejects.toBe(boom);

    const logged = entriesOf(root).find((e) => e.message === "unhandled_route_error");
    expect(logged.level).toBe("error");
    expect(logged.meta.error.stack).toContain("integration_probe_uncaught");
    expect(logged.meta.route).toBe("GET /api/transactions");
    // …and it carries the request's trace, so client + server share one id.
    expect(logged.trace).toBe(root.withTraceCalls[0]);

    const completion = entriesOf(root).find((e) => e.message === "request_completed");
    expect(completion.meta.outcome).toBe("threw");
  });

  it("flushes on EVERY exit: success, early return, handled failure, throw", async () => {
    setEnv(SERVER_ENV);
    const { withManagerLogs } = await loadServer();
    const root = fakeLogger();
    globalThis.__managerServerLogger = root;

    const early = withManagerLogs(async () => Response.json({}, { status: 400 }));
    const handled = withManagerLogs(async () => {
      try {
        throw new Error("caught");
      } catch (error) {
        const { logServerError } = await import("@/lib/manager/server");
        logServerError("handled_failure", error);
        return Response.json({}, { status: 500 });
      }
    });
    const thrown = withManagerLogs(async () => {
      throw new Error("uncaught");
    });

    await early(request(), {});
    expect(globalThis.__afterCallbacks).toHaveLength(1);
    await handled(request(), {});
    expect(globalThis.__afterCallbacks).toHaveLength(2);
    await thrown(request(), {}).catch(() => {});
    expect(globalThis.__afterCallbacks).toHaveLength(3);

    // The scheduled flush must actually drain the shared queue.
    const flushesBefore = root.flush.mock.calls.length;
    await Promise.all(globalThis.__afterCallbacks.map((cb) => cb()));
    expect(root.flush.mock.calls.length).toBe(flushesBefore + 3);
  });

  it("never lets a failing flush become an unhandled rejection", async () => {
    setEnv(SERVER_ENV);
    const { withManagerLogs } = await loadServer();
    const root = fakeLogger();
    root.flush.mockRejectedValueOnce(new Error("manager unreachable"));
    globalThis.__managerServerLogger = root;

    const GET = withManagerLogs(async () => Response.json({}));
    await GET(request(), {});

    const rejection = globalThis.__afterCallbacks.map((cb) => cb());
    await expect(Promise.all(rejection)).resolves.toBeDefined();
  });

  it("routes logServerError onto the request's child logger", async () => {
    setEnv(SERVER_ENV);
    const { withManagerLogs } = await loadServer();
    const root = fakeLogger();
    globalThis.__managerServerLogger = root;

    const GET = withManagerLogs(async () => {
      const { logServerError, logServerEvent, managerLog } = await import(
        "@/lib/manager/server"
      );
      logServerEvent("business_event", { rows: 3 });
      logServerError("business_failure", new Error("inner"), { route: "x" });
      managerLog("warn", "business_warning");
      return Response.json({});
    });
    await GET(request("http://localhost:3000/api/x", { "x-trace-id": "t-42" }), {});

    const child = root.withTrace.mock.results[0].value;
    expect(child.entries.map((e) => e.message)).toEqual(
      expect.arrayContaining([
        "business_event",
        "business_failure",
        "business_warning",
        "request_completed",
      ])
    );
    // Everything in the request carries that request's trace, never the root's.
    for (const entry of child.entries) expect(entry.trace).toBe("t-42");
    // …and nothing leaked onto the shared root.
    expect(root.entries).toHaveLength(0);
  });

  it("falls back to the root when logging happens outside a request", async () => {
    setEnv(SERVER_ENV);
    const { logServerEvent } = await loadServer();
    const root = fakeLogger();
    globalThis.__managerServerLogger = root;

    logServerEvent("outside_request");
    expect(root.entries.map((e) => e.message)).toContain("outside_request");
  });

  it("falls back to info for an unknown level and never throws", async () => {
    setEnv(SERVER_ENV);
    const { managerLog } = await loadServer();
    const root = fakeLogger();
    globalThis.__managerServerLogger = root;
    managerLog("not_a_level", "x");
    expect(root.entries[0]).toMatchObject({ level: "info", message: "x" });

    // A logger that throws must not propagate into the caller.
    globalThis.__managerServerLogger = {
      info: () => {
        throw new Error("logger exploded");
      },
    };
    expect(() => managerLog("info", "y")).not.toThrow();
  });

  it("reports the SDK drop count and flushes for non-request code", async () => {
    setEnv(SERVER_ENV);
    const { getManagerDroppedCount, flushManagerLogger } = await loadServer();
    expect(getManagerDroppedCount()).toBe(0);

    const root = fakeLogger();
    root.droppedCount.mockReturnValue(42);
    globalThis.__managerServerLogger = root;
    expect(getManagerDroppedCount()).toBe(42);

    await flushManagerLogger();
    expect(root.flush).toHaveBeenCalledTimes(1);
  });

  it("flushManagerLogger is a safe no-op with nothing cached", async () => {
    setEnv({});
    const { flushManagerLogger } = await loadServer();
    await expect(flushManagerLogger()).resolves.toBeUndefined();
  });

  it("configures the SDK with this app's real options", async () => {
    // The redaction list, the batch window and the process-error switch are the
    // three settings that decide whether this integration is correct in
    // production, so assert the values actually handed to initLogger.
    setEnv(SERVER_ENV);
    const initLogger = vi.fn(() => fakeLogger());
    vi.doMock("@/lib/manager/logger", async (importOriginal) => ({
      ...(await importOriginal()),
      initLogger,
    }));
    vi.resetModules();
    delete globalThis.__managerServerLogger;

    const { getManagerLogger } = await import("@/lib/manager/server");
    getManagerLogger();

    expect(initLogger).toHaveBeenCalledTimes(1);
    const options = initLogger.mock.calls[0][0];
    expect(options).toMatchObject({
      endpoint: "http://127.0.0.1:3300",
      appId: "finance-app",
      apiKey: "mlk_server_key",
      // Next.js owns process error handling; extra listeners stop delivery.
      captureProcessErrors: false,
      captureConsole: null,
      captureGlobalErrors: false,
      captureFetch: false,
      flushIntervalMs: 250,
    });
    // Financial identifiers are redacted alongside the usual secrets.
    for (const key of [
      "password",
      "token",
      "authorization",
      "cookie",
      "cvv",
      "cardnumber",
      "accountnumber",
      "iban",
    ]) {
      expect(options.redactKeys).toContain(key);
    }

    vi.doUnmock("@/lib/manager/logger");
    vi.resetModules();
    delete globalThis.__managerServerLogger;
  });

  it("leaves Next's own route exports and named helpers intact", async () => {
    setEnv({});
    const route = await import("@/app/api/reports/export/route");
    expect(typeof route.GET).toBe("function");
    // A module-level helper must NOT have been wrapped.
    expect(route.sanitizeCsvCell("=1+1")).toBe("'=1+1");
    expect(route.toCsvRow(["a", "b"])).toBe("a,b");
  });

  it("keeps every route's verbs exported through the wrapper", async () => {
    setEnv({});
    const routes = [
      ["@/app/api/auth/otp/send/route", ["POST"]],
      ["@/app/api/auth/otp/verify/route", ["POST"]],
      ["@/app/api/auth/refresh/route", ["POST"]],
      ["@/app/api/auth/logout/route", ["POST"]],
      ["@/app/api/auth/logout-all/route", ["POST"]],
      ["@/app/api/user/route", ["GET", "PUT"]],
      ["@/app/api/transactions/route", ["GET", "POST"]],
      ["@/app/api/transactions/[id]/route", ["GET", "PUT", "DELETE"]],
      ["@/app/api/budgets/route", ["GET", "POST", "DELETE"]],
      ["@/app/api/categories/route", ["GET", "POST"]],
      ["@/app/api/categories/[id]/route", ["PUT", "DELETE"]],
      ["@/app/api/recurring/route", ["GET", "POST"]],
      ["@/app/api/recurring/[id]/route", ["PATCH", "DELETE"]],
      ["@/app/api/reports/dashboard/route", ["GET"]],
      ["@/app/api/reports/budget-progress/route", ["GET"]],
      ["@/app/api/reports/generate/route", ["POST"]],
      ["@/app/api/reports/export/route", ["GET"]],
    ];
    for (const [specifier, verbs] of routes) {
      const mod = await import(specifier);
      for (const verb of verbs) {
        expect(typeof mod[verb], `${specifier} ${verb}`).toBe("function");
      }
    }
  });
});

/** Child loggers handed out by `root.withTrace`, in call order. */
function rootEntriesFor(root) {
  return root.withTrace.mock.results.map((r) => r.value);
}

/**
 * Every entry written through the root OR any child it handed out. Completion
 * and error entries deliberately go to the request child so they inherit that
 * request's trace, so assertions read across the whole fan-out.
 */
function entriesOf(root) {
  return [...root.entries, ...rootEntriesFor(root).flatMap((c) => c.entries)];
}
