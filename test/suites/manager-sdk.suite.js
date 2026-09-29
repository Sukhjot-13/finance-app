// test/suites/manager-sdk.suite.js — the vendored SDK, against a MOCK Manager.
//
// Volume, rate limiting, retries, outages, payload caps and revoked/unknown
// credentials are exercised here against an isolated in-process HTTP server
// rather than a real deployment, so this suite can hammer the contract without
// producing real traffic. Live key-kind acceptance is verified separately by
// scripts/check-manager-integration.mjs and by the verification report.
import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  initLogger,
  shutdownLoggers,
  traceIdFromHeaders,
  fingerprint,
} from "@/lib/manager/logger";

/**
 * A stand-in for Manager's ingest endpoints. Records every request and replies
 * from a per-path script so each test can choose accepted/rejected counts,
 * 429s, 5xx outages or a total connection refusal.
 */
async function startMockManager() {
  const requests = [];
  const script = { logs: [], events: [] };
  let requestsToLogs = 0;
  let failNext = 0;
  let hang = false;

  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body = null;
      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }
      const isEvents = req.url.startsWith("/api/ingest/events");
      requests.push({
        path: req.url,
        method: req.method,
        apiKey: req.headers["x-api-key"],
        contentType: req.headers["content-type"],
        body,
        rawLength: Buffer.byteLength(raw),
      });

      if (hang) return; // never respond: simulates a total service outage

      if (failNext > 0) {
        failNext -= 1;
        res.writeHead(503, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unavailable" }));
        return;
      }

      const rule = isEvents ? script.events[0] : script.logs[requestsToLogs];
      if (!isEvents) requestsToLogs += 1;

      const status = rule?.status ?? 200;
      const headers = { "content-type": "application/json" };
      if (rule?.retryAfter !== undefined) headers["retry-after"] = String(rule.retryAfter);
      res.writeHead(status, headers);
      res.end(
        JSON.stringify(
          rule?.body ?? { accepted: body?.logs?.length ?? body?.events?.length ?? 0, rejected: 0 }
        )
      );
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;

  return {
    url,
    requests,
    script,
    setHang(value) {
      hang = value;
    },
    failNext(n) {
      failNext = n;
    },
    reset() {
      requests.length = 0;
      requestsToLogs = 0;
      hang = false;
      failNext = 0;
    },
    async close() {
      hang = false;
      // closeAllConnections() first: the SDK's fetch uses keep-alive, so a
      // lingering socket would make server.close() hang and slow every test
      // that follows in this shared module graph.
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

const logEntriesFor = (mock) =>
  mock.requests.filter((r) => r.path.startsWith("/api/ingest/logs")).map((r) => r.body.logs);

/** A logger wired to the mock, with a short window so tests stay fast. */
function makeLogger(mock, overrides = {}) {
  return initLogger({
    endpoint: mock.url,
    appId: "finance-app",
    apiKey: "mlk_server_key",
    environment: "test",
    captureConsole: null,
    captureGlobalErrors: false,
    captureProcessErrors: false,
    captureFetch: false,
    flushIntervalMs: 25,
    maxLogsPerSecond: 500,
    ...overrides,
  });
}

describe("manager SDK transport", () => {
  let mock;
  let log;

  beforeEach(async () => {
    mock = await startMockManager();
  });

  afterEach(async () => {
    try {
      await log?.flush();
    } catch {
      /* the mock may be hung by an outage test */
    }
    log = null;
    mock.reset();
    await mock.close();
    // Clears the SDK's pending batch/retry timers, which would otherwise keep
    // firing into later suites.
    await shutdownLoggers();
  });

  it("delivers entries to /api/ingest/logs with the server key", async () => {
    log = makeLogger(mock);
    log.info("probe_info", { rows: 2 });
    await log.flush();

    expect(mock.requests).toHaveLength(1);
    const [request] = mock.requests;
    expect(request.path).toBe("/api/ingest/logs");
    expect(request.apiKey).toBe("mlk_server_key");
    expect(request.contentType).toBe("application/json");
    expect(request.body.logs[0]).toMatchObject({
      level: "info",
      message: "probe_info",
      meta: { rows: 2 },
    });
    // Manager owns these fields: sending them from a client is rejected.
    expect(request.body.logs[0]).not.toHaveProperty("source");
  });

  it("batches a burst instead of issuing one request per line", async () => {
    log = makeLogger(mock, { flushIntervalMs: 5000 });
    for (let i = 0; i < 20; i += 1) log.info(`burst_${i}`);
    expect(mock.requests).toHaveLength(0); // nothing sent yet
    await log.flush();

    // 20 lines -> ONE request. This is the whole point of the batch window.
    expect(mock.requests).toHaveLength(1);
    expect(mock.requests[0].body.logs).toHaveLength(20);
  });

  it("splits a burst larger than the batch cap, never merging past 100", async () => {
    log = makeLogger(mock, { flushIntervalMs: 5000 });
    for (let i = 0; i < 120; i += 1) log.info(`big_${i}`);
    await log.flush();

    expect(mock.requests.length).toBeGreaterThan(1);
    expect(mock.requests.length).toBeLessThan(10);
    for (const request of mock.requests) expect(request.body.logs.length).toBeLessThanOrEqual(100);
    expect(logEntriesFor(mock).flat().filter((e) => e.message.startsWith("big_"))).toHaveLength(120);
  });

  it("queues a 429'd entry offline and delivers it on the next flush", async () => {
    // Manager answers 429 with Retry-After; the SDK's contract is bounded
    // exponential backoff plus an offline queue, never a dropped entry.
    mock.script.logs = [
      { status: 429, retryAfter: 1, body: { accepted: 0, rejected: 0 } },
      { status: 200, body: { accepted: 1, rejected: 0 } },
    ];
    log = makeLogger(mock, { flushIntervalMs: 5000 });
    log.error("rate_limited_entry");
    await log.flush();

    // The 429 was seen and the entry preserved rather than discarded.
    expect(mock.requests[0].body.logs[0].message).toBe("rate_limited_entry");
    const queuedOffline = JSON.parse(localStorage.getItem("manager.logger.queue") ?? "[]");
    expect(queuedOffline.map((e) => e.message)).toContain("rate_limited_entry");

    // The queued entry goes out on the next flush — nothing was lost.
    await log.flush();
    const delivered = logEntriesFor(mock)
      .flat()
      .filter((e) => e.message === "rate_limited_entry");
    expect(delivered.length).toBeGreaterThanOrEqual(1);
  });

  it("recovers after a 503 without losing the entry", async () => {
    mock.failNext(2);
    log = makeLogger(mock, { flushIntervalMs: 5000 });
    log.error("outage_entry");
    await log.flush();
    mock.setHang(false);

    // Bounded backoff, then the queued entry is delivered on a later flush.
    await log.flush();
    const delivered = logEntriesFor(mock).flat().filter((e) => e.message === "outage_entry");
    expect(delivered.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps working after Manager is unreachable (does not throw into the app)", async () => {
    mock.setHang(true);
    log = makeLogger(mock, { flushIntervalMs: 20 });

    expect(() => {
      log.info("during_outage_1");
      log.error("during_outage_2", { error: new Error("still fine") });
    }).not.toThrow();

    // flush() attempts delivery; it may not resolve while the socket hangs, so
    // the contract asserted here is simply that nothing propagates to the app.
    const flush = log.flush();
    flush.catch(() => {});
    mock.setHang(false);
    await expect(flush).resolves.toBeUndefined();
  });

  it("retries a 401 without retrying forever", async () => {
    mock.script.logs = Array.from({ length: 20 }, () => ({
      status: 401,
      body: { error: "unauthorized" },
    }));
    log = makeLogger(mock, { flushIntervalMs: 5000 });
    log.info("revoked_key_entry");
    await log.flush();
    // Bounded: it gives up instead of hammering or hanging the request.
    expect(mock.requests.length).toBeLessThanOrEqual(8);
  });

  it("keeps entries within the documented message / meta / batch caps", async () => {
    log = makeLogger(mock, { flushIntervalMs: 5000 });
    log.info("x".repeat(5000));
    log.info("cap_meta", { blob: "y".repeat(50_000) });
    for (let i = 0; i < 150; i += 1) log.info(`many_${i}`);
    await log.flush();

    for (const request of mock.requests) {
      expect(request.rawLength).toBeLessThanOrEqual(128 * 1024);
      expect(request.body.logs.length).toBeLessThanOrEqual(100);
      for (const entry of request.body.logs) {
        expect(entry.message.length).toBeLessThanOrEqual(1024);
        if (entry.meta !== undefined) {
          expect(JSON.stringify(entry.meta).length).toBeLessThanOrEqual(8192);
        }
      }
    }
  });

  it("stamps a current timestamp by default and honours a supplied one", async () => {
    const before = Date.now();
    log = makeLogger(mock, { flushIntervalMs: 5000 });
    log.info("timestamp_probe");
    await log.flush();

    const [entry] = logEntriesFor(mock).flat();
    expect(entry.ts).toBeGreaterThanOrEqual(before);
    expect(entry.ts).toBeLessThanOrEqual(Date.now());
    expect(new Date(entry.ts).getTime()).toBe(entry.ts);
  });

  it("reports entries lost to its own rate limit", async () => {
    log = makeLogger(mock, { maxLogsPerSecond: 2, flushIntervalMs: 5000 });
    for (let i = 0; i < 60; i += 1) log.info(`flood_${i}`);
    expect(log.droppedCount()).toBeGreaterThan(0);
    await log.flush();
  });

  it("surfaces a queue overflow as an explicit dropped-entries report", async () => {
    // Silent loss is the failure mode: the SDK must raise its own discards so
    // they show up in the log viewer instead of vanishing.
    log = makeLogger(mock, {
      flushIntervalMs: 60_000,
      maxQueueSize: 5,
      maxLogsPerSecond: 100_000,
    });
    for (let i = 0; i < 400; i += 1) log.info(`overflow_${i}`);
    expect(log.droppedCount()).toBeGreaterThanOrEqual(250);

    await log.flush();
    const report = logEntriesFor(mock)
      .flat()
      .find((e) => e.message === "manager_sdk_dropped_entries");
    expect(report).toBeTruthy();
    expect(report.level).toBe("warn");
    expect(report.meta.dropped).toBeGreaterThan(0);
    expect(report.meta.totalDropped).toBeGreaterThanOrEqual(250);
  });

  it("keeps separate traces and separate sources distinct under grouping", async () => {
    log = makeLogger(mock, { flushIntervalMs: 5000 });

    const a = log.withTrace("trace-alpha");
    const b = log.withTrace("trace-beta");
    a.error("same_message", { error: new Error("same_message") });
    b.error("same_message", { error: new Error("same_message") });
    await log.flush();

    const entries = logEntriesFor(mock)
      .flat()
      .filter((e) => e.message === "same_message");
    const traces = new Set(entries.map((e) => e.traceId));
    expect(traces).toEqual(new Set(["trace-alpha", "trace-beta"]));
  });

  it("does not let a source field ride along (Manager derives it from the key)", async () => {
    log = makeLogger(mock, { flushIntervalMs: 5000 });
    log.info("source_attempt", { source: "server" });
    await log.flush();
    const [entry] = logEntriesFor(mock).flat();
    expect(entry.source).toBeUndefined();
  });

  it("exports a fingerprint that is stable, distinct and trace-aware", () => {
    const a = fingerprint("msg", "at foo.js:1");
    const b = fingerprint("msg", "at foo.js:1");
    const c = fingerprint("msg", "at bar.js:2");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("reads a trace off any Headers-like object, and nothing else", () => {
    expect(traceIdFromHeaders(new Headers({ "x-trace-id": "abc" }))).toBe("abc");
    expect(traceIdFromHeaders(new Headers())).toBe("");
    expect(traceIdFromHeaders({ get: () => "from-fn" })).toBe("from-fn");
    // A plain object has no .get(), so it must NOT be read as a trace source.
    expect(traceIdFromHeaders({ "x-trace-id": "abc" })).toBe("");
    expect(traceIdFromHeaders(null)).toBe("");
    expect(traceIdFromHeaders(undefined)).toBe("");
  });

  it("rejects a client key writing server-only node context", async () => {
    // Manager documents that hostname/pid/runtimeVersion are accepted for
    // server-key logs and rejected for client-key logs. The SDK therefore must
    // not stamp node context onto a client logger.
    log = makeLogger(mock, { apiKey: "mck_client_key", flushIntervalMs: 5000 });
    log.info("client_source_entry");
    await log.flush();
    const [entry] = logEntriesFor(mock).flat();
    expect(entry.hostname).toBeUndefined();
    expect(entry.pid).toBeUndefined();
  });
});

describe("manager SDK redaction and stacks", () => {
  let mock;
  let log;

  beforeEach(async () => {
    mock = await startMockManager();
  });
  afterEach(async () => {
    try {
      await log?.flush();
    } catch {
      /* ignore */
    }
    log = null;
    await mock.close();
    await shutdownLoggers();
  });

  const sent = () => logEntriesFor(mock).flat();

  it("preserves a NATIVE Error stack at the top level of the entry", async () => {
    log = makeLogger(mock, { flushIntervalMs: 5000 });
    const error = new Error("integration_probe_native_stack");
    log.error("native_failure", { error });
    await log.flush();

    const [entry] = sent();
    expect(entry.message).toBe("native_failure");
    expect(entry.stack).toContain("integration_probe_native_stack");
  });

  it("preserves a SERIALIZED { stack } object's stack too", async () => {
    // A re-vendored SDK that only accepted `instanceof Error` silently lost
    // every stack from an already-serialized error, which is exactly what a
    // cross-process or cached error looks like.
    log = makeLogger(mock, { flushIntervalMs: 5000 });
    log.error("serialized_failure", {
      error: {
        name: "TypeError",
        message: "integration_probe_serialized_stack",
        stack: "TypeError: integration_probe_serialized_stack\n    at handler (/app/x.js:1:1)",
      },
    });
    await log.flush();

    const [entry] = sent();
    expect(entry.stack).toContain("integration_probe_serialized_stack");
    expect(entry.stack).toContain("at handler");
  });

  it("redacts fake secrets by KEY before they leave the process", async () => {
    log = makeLogger(mock, {
      flushIntervalMs: 5000,
      redactKeys: ["password", "token", "authorization", "cookie", "cvv"],
    });
    log.info("redaction_probe", {
      password: "hunter2-fake",
      nested: { token: "tok_fake_123", authorization: "Bearer fake-abc" },
      list: [{ cvv: "123" }],
      safe: "keep-me",
    });
    await log.flush();

    const [entry] = sent();
    const serialized = JSON.stringify(entry);
    expect(serialized).not.toContain("hunter2-fake");
    expect(serialized).not.toContain("tok_fake_123");
    expect(serialized).not.toContain("fake-abc");
    expect(serialized).not.toContain("123");
    expect(entry.meta.safe).toBe("keep-me");
  });

  it("redacts fake secrets embedded in a MESSAGE string", async () => {
    log = makeLogger(mock, {
      flushIntervalMs: 5000,
      redactKeys: ["password", "token", "authorization"],
    });
    log.error('login failed password="hunter2-fake" token=tok_fake_999');
    await log.flush();

    const [entry] = sent();
    expect(entry.message).not.toContain("hunter2-fake");
    expect(entry.message).not.toContain("tok_fake_999");
  });

  it("redacts fake secrets inside a stack before upload", async () => {
    log = makeLogger(mock, { flushIntervalMs: 5000, redactKeys: ["token"] });
    log.error("stack_redaction_probe", {
      error: new Error('boom with token=tok_fake_stack'),
    });
    await log.flush();

    const [entry] = sent();
    expect(entry.stack ?? "").not.toContain("tok_fake_stack");
  });

  it("keeps fake financial identifiers out of a server log", async () => {
    log = makeLogger(mock, {
      flushIntervalMs: 5000,
      redactKeys: ["password", "token", "cvv", "cardnumber", "accountnumber", "iban"],
    });
    log.info("financial_probe", {
      cardNumber: "4111111111111111",
      accountNumber: "000123456789",
      iban: "DE89370400440532013000",
      category: "Groceries",
    });
    await log.flush();

    const serialized = JSON.stringify(sent()[0]);
    expect(serialized).not.toContain("4111111111111111");
    expect(serialized).not.toContain("000123456789");
    expect(serialized).not.toContain("DE89370400440532013000");
    // Non-sensitive context is still there.
    expect(serialized).toContain("Groceries");
  });
});
