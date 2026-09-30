// test/suites/manager-browser.suite.js — the browser half of the SDK.
//
// Exercises what the SDK does to the page it is embedded in: the wrapped fetch
// must trace every supported request-header form without mutating the caller's
// options or adding cross-origin headers, and console / global / fetch capture
// must keep working while an upload is in flight.
//
// The upload + app fetch mock is installed BEFORE `initLogger` on purpose: the
// SDK captures the ambient `fetch` at init, so replacing the global afterwards
// would silently leave the wrapper calling the old one.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { initLogger, shutdownLoggers } from "@/lib/manager/logger";

const ENDPOINT = "http://127.0.0.1:3300";
const ORIGIN = "http://localhost:3000";

describe("manager browser channel", () => {
  let batches = [];
  let appRequests = [];
  /** Mutable behaviour the tests steer; the SDK always calls this same fn. */
  let appFetch;
  let uploadGate;
  let uploadHanging = false;
  let realFetch;
  let log;

  beforeEach(() => {
    shutdownLoggers();
    localStorage.removeItem("manager.logger.queue");
    window.history.replaceState({}, "", "/dashboard");
    realFetch = globalThis.fetch;
    batches = [];
    appRequests = [];
    uploadHanging = false;

    // Default app behaviour: a healthy same-origin JSON response.
    appFetch = vi.fn(async (input, init) => {
      appRequests.push([input, init]);
      return new Response("{}", { status: 200 });
    });

    globalThis.fetch = vi.fn(async (input, init) => {
      const url = typeof input === "string" ? input : String(input?.url ?? input);
      if (url.startsWith(ENDPOINT)) {
        if (uploadHanging) await uploadGate;
        batches.push(JSON.parse(init?.body ?? "{}"));
        return new Response(JSON.stringify({ accepted: 0, rejected: 0 }), { status: 200 });
      }
      return appFetch(input, init);
    });

    log = initLogger({
      endpoint: ENDPOINT,
      appId: "finance-app",
      apiKey: "mck_client_key",
      environment: "test",
      captureConsole: ["warn", "error"],
      captureGlobalErrors: true,
      captureFetch: true,
      redactKeys: ["password", "token", "authorization"],
      flushIntervalMs: 25,
    });
  });

  afterEach(async () => {
    uploadHanging = false;
    try {
      await log.flush();
    } catch {
      /* an intentionally hanging upload is released below */
    }
    shutdownLoggers();
    localStorage.removeItem("manager.logger.queue");
    log = null;
    globalThis.fetch = realFetch;
  });

  const entries = () => batches.flatMap((b) => b.logs ?? []);
  const messages = () => entries().map((e) => e.message);

  const traceHeaderOf = (call) =>
    new Headers(call[1]?.headers ?? {}).get("x-trace-id");

  it("adds the trace header when the caller passed no init at all", async () => {
    await fetch(`${ORIGIN}/api/budgets`);
    expect(traceHeaderOf(appRequests[0])).toBe(log.traceId());
  });

  it("adds the trace header for a plain object of headers", async () => {
    const init = { method: "POST", headers: { "content-type": "application/json" } };
    await fetch(`${ORIGIN}/api/transactions`, init);
    expect(traceHeaderOf(appRequests[0])).toBe(log.traceId());
    expect(new Headers(appRequests[0][1].headers).get("content-type")).toBe(
      "application/json"
    );
  });

  it("adds the trace header for a TUPLE array of headers", async () => {
    await fetch(`${ORIGIN}/api/transactions`, {
      headers: [["content-type", "application/json"]],
    });
    expect(traceHeaderOf(appRequests[0])).toBe(log.traceId());
  });

  it("adds the trace header for a Headers instance", async () => {
    await fetch(`${ORIGIN}/api/transactions`, {
      headers: new Headers({ "x-custom": "kept" }),
    });
    expect(traceHeaderOf(appRequests[0])).toBe(log.traceId());
    expect(new Headers(appRequests[0][1].headers).get("x-custom")).toBe("kept");
  });

  it("adopts the headers of a Request instance", async () => {
    const request = new Request(`${ORIGIN}/api/categories`, {
      headers: { "x-custom": "from-request" },
    });
    await fetch(request);
    expect(traceHeaderOf(appRequests[0])).toBe(log.traceId());
    expect(new Headers(appRequests[0][1].headers).get("x-custom")).toBe(
      "from-request"
    );
  });

  it("does NOT mutate the caller's own options object", async () => {
    const options = { method: "PUT", headers: { "content-type": "application/json" } };
    const snapshot = JSON.stringify(options);
    await fetch(`${ORIGIN}/api/user`, options);
    expect(JSON.stringify(options)).toBe(snapshot);
  });

  it("does NOT add the trace header to cross-origin requests", async () => {
    // x-trace-id on a third-party call would turn a simple request into a CORS
    // preflight, and would leak the trace to a host that has no use for it.
    await fetch("https://api.example.com/thing");
    expect(traceHeaderOf(appRequests[0])).toBeNull();
  });

  it("leaves a cross-origin call's options untouched and untraced", async () => {
    const init = { method: "GET" };
    await fetch("https://api.example.com/thing", init);
    // No identity guarantee is needed — a defensive copy is fine — but nothing
    // may be added, and in particular no header that would force a preflight.
    expect(appRequests[0][1]).toEqual({ method: "GET" });
    expect(traceHeaderOf(appRequests[0])).toBeNull();
    expect(JSON.stringify(init)).toBe(JSON.stringify({ method: "GET" }));
  });

  it("records the status and duration of a captured same-origin request", async () => {
    await fetch(`${ORIGIN}/api/budgets`);
    await log.flush();
    const http = entries().filter((e) => e.message === "http_request");
    expect(http.length).toBeGreaterThanOrEqual(1);
    expect(http.at(-1).meta).toMatchObject({ transport: "fetch", status: 200, ok: true });
    expect(typeof http.at(-1).meta.durationMs).toBe("number");
  });

  it("records a FAILED fetch without swallowing the rejection", async () => {
    appFetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(fetch(`${ORIGIN}/api/boom`)).rejects.toThrow("Failed to fetch");
    await log.flush();

    const failed = entries().filter(
      (e) => e.message === "http_request" && String(e.meta?.url).includes("/api/boom")
    );
    expect(failed.length).toBeGreaterThanOrEqual(1);
    expect(failed.at(-1).level).toBe("error");
  });

  it("captures a console warning and a console error", async () => {
    console.warn("browser_warn_probe", { password: "hunter2-fake" });
    console.error("browser_error_probe");
    await log.flush();

    const warn = entries().find((e) => e.message.includes("browser_warn_probe"));
    const error = entries().find((e) => e.message.includes("browser_error_probe"));
    expect(warn?.level).toBe("warn");
    expect(error?.level).toBe("error");
    // Redaction happens before upload, not after.
    expect(JSON.stringify(warn)).not.toContain("hunter2-fake");
  });

  it("captures an uncaught error with its stack", async () => {
    const uncaught = new Error("browser_uncaught_probe");
    window.dispatchEvent(
      new ErrorEvent("error", {
        error: uncaught,
        message: "browser_uncaught_probe",
        filename: "https://fintrack.test/x.js",
      })
    );
    await log.flush();

    const entry = entries().find((e) => e.message === "browser_uncaught_probe");
    expect(entry).toBeTruthy();
    expect(entry.level).toBe("fatal");
    expect(entry.stack).toContain("browser_uncaught_probe");
    expect(entry.meta.filename).toBe("https://fintrack.test/x.js");
  });

  it("captures an unhandled promise rejection with its reason", async () => {
    const rejection = new Error("browser_rejection_probe");
    // Real unhandled rejections are what users hit, but jsdom does not
    // reliably surface them to a window listener, so the event is dispatched
    // directly to prove the listener is actually installed and wired.
    // jsdom does not implement PromiseRejectionEvent, so the event is built by
    // hand — the point under test is that the listener is installed and reads
    // `event.reason`.
    const event = new Event("unhandledrejection");
    event.reason = rejection;
    window.dispatchEvent(event);
    await log.flush();

    const entry = entries().find((e) => e.message === "unhandled_rejection");
    expect(entry).toBeTruthy();
    expect(entry.level).toBe("fatal");
    expect(JSON.stringify(entry)).toContain("browser_rejection_probe");
  });

  it("keeps capturing unrelated errors WHILE an upload is in flight", async () => {
    // The transport must suppress interception only while INVOKING its own
    // fetch, not for the whole network round trip — otherwise every real app
    // error that happens during an upload is silently lost.
    let release;
    uploadGate = new Promise((resolve) => {
      release = resolve;
    });
    uploadHanging = true;

    log.info("entry_that_triggers_the_upload");
    const flushing = log.flush();
    // The upload is now in flight and hanging.
    console.error("error_during_upload_probe");
    release();
    uploadHanging = false;
    await flushing;
    await log.flush();

    expect(messages().some((m) => m.includes("error_during_upload_probe"))).toBe(true);
  });

  it("keeps a repeated error visible after a later flush", async () => {
    for (let i = 0; i < 3; i += 1) log.error("repeat_probe", { attempt: i });
    await log.flush();
    for (let i = 3; i < 6; i += 1) log.error("repeat_probe", { attempt: i });
    await log.flush();

    const repeats = entries().filter((e) => e.message === "repeat_probe");
    // The later flush must still be represented …
    expect(repeats.length).toBeGreaterThanOrEqual(2);
    // …and no occurrence may be silently lost: grouping is a bounded count
    // hint on top of the entries, never a replacement for them.
    const total = repeats.reduce((sum, e) => sum + (e.meta?.count ?? 1), 0);
    expect(total).toBe(6);
  });

  it("keeps separate traces distinct under error grouping", async () => {
    const a = log.withTrace("trace-alpha");
    const b = log.withTrace("trace-beta");
    a.error("same_message", { error: new Error("same_message") });
    b.error("same_message", { error: new Error("same_message") });
    await log.flush();

    const same = entries().filter((e) => e.message === "same_message");
    expect(new Set(same.map((e) => e.traceId))).toEqual(
      new Set(["trace-alpha", "trace-beta"])
    );
  });

  it("stamps the request's trace so the server can adopt it", async () => {
    await fetch(`${ORIGIN}/api/reports/dashboard`);
    await log.flush();
    const http = entries().find((e) => e.message === "http_request");
    expect(http.traceId).toBe(log.traceId());
    expect(http.meta.url).toContain("/api/reports/dashboard");
  });
});
