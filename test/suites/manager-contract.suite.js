// test/suites/manager-contract.suite.js — payload conformance with Manager's
// documented ingest contract.
//
// Manager validates entries with a STRICT schema: an unknown top-level field
// does not merely get dropped, it makes the whole entry REJECT. This suite
// re-implements that contract (field whitelist, caps, batch limit, timestamp
// window, key kinds) as a local mock and asserts that what this app's SDK
// actually produces is ACCEPTED, that wrong-kind and unknown credentials are
// refused, and that HTTP 200 is never the only thing checked — `accepted` and
// `rejected` counts are.
//
// Field names and limits mirror Manager's lib/validation.ts.
import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { initLogger, shutdownLoggers } from "@/lib/manager/logger";

const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"];
const EVENT_TYPES = ["pageview", "event", "click", "referrer", "session"];

/** Top-level fields Manager accepts on a log entry. Anything else is rejected. */
const ALLOWED_LOG_FIELDS = new Set([
  "level", "message", "meta", "stack", "ts",
  "sessionId", "pageId", "traceId", "requestId",
  "url", "route", "referrer", "ua", "viewport", "lang", "tz", "connection",
  "appVersion", "environment", "release",
  "hostname", "pid", "runtimeVersion", "rssMb", "uptimeSec", "durationMs",
]);

/** Manager-owned fields a client must never send — they are stamped server-side. */
const MANAGER_OWNED = [
  "source", "ip", "country", "receivedAt", "keyPrefix",
  "projectId", "fingerprint", "count", "_id",
];

const CAPS = {
  message: 1024,
  stack: 8000,
  meta: 8 * 1024,
  route: 200,
  url: 500,
  traceId: 80,
  sessionId: 80,
  pageId: 80,
  environment: 40,
  release: 80,
};

const MAX_BATCH = 100;
const MAX_BODY = 128 * 1024;
const MAX_TS_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_TS_FUTURE_MS = 10 * 60 * 1000;

const KEYS = {
  server: { kind: "log", source: "server", value: "mlk_test_server_key", valid: true },
  client: { kind: "log", source: "client", value: "mck_test_client_key", valid: true },
  analytics: { kind: "event", source: null, value: "mak_test_analytics_key", valid: true },
  revoked: { kind: "log", source: "server", value: "mlk_revoked_key", valid: false },
  unknown: { kind: "log", source: "server", value: "mlk_not_a_real_key_at_all", valid: false },
};

function validateLogEntry(entry) {
  for (const key of Object.keys(entry)) {
    if (!ALLOWED_LOG_FIELDS.has(key)) return `unrecognized field "${key}"`;
  }
  if (!LOG_LEVELS.includes(entry.level)) return "bad level";
  if (typeof entry.message !== "string" || entry.message.length === 0) return "bad message";
  if (entry.message.length > CAPS.message) return "message too long";
  if (entry.stack !== undefined && entry.stack.length > CAPS.stack) return "stack too long";
  if (entry.meta !== undefined && JSON.stringify(entry.meta).length > CAPS.meta) return "meta too big";
  if (entry.ts !== undefined) {
    const ts = typeof entry.ts === "string" ? Date.parse(entry.ts) : entry.ts;
    if (!Number.isFinite(ts)) return "bad ts";
    if (Date.now() - ts > MAX_TS_AGE_MS) return "ts too old";
    if (ts - Date.now() > MAX_TS_FUTURE_MS) return "ts too far ahead";
  }
  for (const [field, cap] of Object.entries(CAPS)) {
    if (typeof entry[field] === "string" && entry[field].length > cap) {
      return `${field} too long`;
    }
  }
  return null;
}

async function startMockManager() {
  const state = { accepted: 0, rejected: 0, reasons: [], rows: [], sent: [] };

  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const reply = (status, body) => {
        res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify(body));
      };

      if (Buffer.byteLength(raw) > MAX_BODY) return reply(413, { error: "payload_too_large" });

      const isEvents = req.url.startsWith("/api/ingest/events");
      let body;
      try {
        body = JSON.parse(raw);
      } catch {
        return reply(400, { error: "invalid_payload" });
      }

      // --- key resolution + kind scoping (generic 401, never a specific one) --
      const rawKey = isEvents ? body?.key : req.headers["x-api-key"];
      // Anything not explicitly valid — unknown OR revoked — is refused with
      // the same generic 401, so a caller cannot tell the two apart.
      const key =
        Object.values(KEYS).find((k) => k.value === rawKey && k.valid === true) ?? null;
      if (key === null) return reply(401, { error: "unauthorized" });
      if (isEvents && key.kind !== "event") return reply(401, { error: "unauthorized" });
      if (!isEvents && key.kind !== "log") return reply(401, { error: "unauthorized" });

      // Exactly what went over the wire, before Manager stamps anything.
      if (Array.isArray(body?.logs)) state.sent.push(...body.logs);
      if (Array.isArray(body?.events)) state.sent.push(...body.events);

      const items = isEvents ? body?.events : body?.logs;
      if (!Array.isArray(items) || items.length === 0) {
        return reply(400, { error: "invalid_payload" });
      }
      if (items.length > MAX_BATCH) {
        return reply(400, { error: "batch_too_large" });
      }

      state.accepted = 0;
      state.rejected = 0;
      state.reasons = [];
      for (const entry of items) {
        if (isEvents) {
          if (!EVENT_TYPES.includes(entry?.type)) {
            state.rejected += 1;
            state.reasons.push("bad type");
            continue;
          }
        } else {
          // Node context is server-key only: a client key may not send it.
          if (key.source === "client") {
            const nodeOnly = ["hostname", "pid", "runtimeVersion", "rssMb", "uptimeSec"].find(
              (f) => entry?.[f] !== undefined
            );
            if (nodeOnly) {
              state.rejected += 1;
              state.reasons.push(`node context "${nodeOnly}" not allowed for a client key`);
              continue;
            }
          }
          const problem = validateLogEntry(entry ?? {});
          if (problem) {
            state.rejected += 1;
            state.reasons.push(problem);
            continue;
          }
        }
        state.accepted += 1;
        // Manager stamps these itself; a client that sent one is a bug.
        state.rows.push({
          ...entry,
          source: key.source,
          receivedAt: Date.now(),
          fingerprint: "server_stamped",
        });
      }

      reply(200, {
        accepted: state.accepted,
        rejected: state.rejected,
        ...(state.rejected > 0 ? { reasons: state.reasons.slice(0, 5) } : {}),
      });
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    state,
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

describe("manager ingest contract", () => {
  let manager;
  let log;

  beforeEach(async () => {
    manager = await startMockManager();
    localStorage.removeItem("manager.logger.queue");
  });

  afterEach(async () => {
    try {
      await log?.flush();
    } catch {
      /* ignore */
    }
    log = null;
    localStorage.removeItem("manager.logger.queue");
    await manager.close();
    await shutdownLoggers();
  });

  const makeLog = (overrides = {}) =>
    initLogger({
      endpoint: manager.url,
      appId: "finance-app",
      apiKey: KEYS.server.value,
      environment: "test",
      release: "test-sha",
      captureConsole: null,
      captureGlobalErrors: false,
      captureProcessErrors: false,
      captureFetch: false,
      flushIntervalMs: 25,
      ...overrides,
    });

  it("has every entry ACCEPTED, not merely HTTP 200", async () => {
    log = makeLog();
    log.info("contract_info", { rows: 4 });
    log.warn("contract_warn");
    log.error("contract_error", { error: new Error("contract boom") });
    await log.flush();

    expect(manager.state.accepted).toBe(3);
    expect(manager.state.rejected).toBe(0);
    expect(manager.state.rows.map((r) => r.message)).toEqual([
      "contract_info",
      "contract_warn",
      "contract_error",
    ]);
  });

  it("never sends a Manager-owned field from a client", async () => {
    log = makeLog();
    // These names inside META are fine — the contract is about top-level
    // fields, which Manager stamps itself and refuses from a client.
    log.info("owned_field_probe", { source: "server", count: 3, projectId: "p1" });
    log.error("owned_field_error", { error: new Error("x") });
    await log.flush();

    for (const sent of manager.state.sent) {
      for (const field of MANAGER_OWNED) {
        expect(Object.keys(sent)).not.toContain(field);
      }
    }
    // …and Manager is the one stamping `source` / `fingerprint` server-side.
    expect(manager.state.rows.every((r) => r.source === "server")).toBe(true);
    expect(manager.state.rows.every((r) => r.fingerprint === "server_stamped")).toBe(true);
  });

  it("sends only whitelisted top-level fields", async () => {
    log = makeLog();
    log.info("whitelist_probe", { nested: { deep: [1, 2, 3] } });
    log.error("whitelist_error", { error: new Error("stacked") });
    await log.flush();

    expect(manager.state.rejected).toBe(0);
    for (const sent of manager.state.sent) {
      for (const key of Object.keys(sent)) {
        expect(ALLOWED_LOG_FIELDS.has(key), `field ${key}`).toBe(true);
      }
    }
  });

  it("derives source=client from the client key", async () => {
    log = makeLog({ apiKey: KEYS.client.value });
    log.info("client_source_probe");
    await log.flush();

    expect(manager.state.accepted).toBe(1);
    expect(manager.state.rejected).toBe(0);
    expect(manager.state.rows[0].source).toBe("client");
  });

  it("refuses a client key that carries server-only node context", async () => {
    // A client logger must never stamp hostname/pid/runtimeVersion: Manager
    // rejects the entry. Simulated by injecting the field the way a
    // misconfigured server logger would.
    log = makeLog({ apiKey: KEYS.client.value });
    const entries = [];
    log.info("node_context_on_client_probe");
    await log.flush();
    entries.push(...manager.state.rows);
    expect(entries).toHaveLength(1);
    expect(entries[0].hostname).toBeUndefined();

    // And the mock really does reject it when present.
    const rejection = await fetch(`${manager.url}/api/ingest/logs`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEYS.client.value },
      body: JSON.stringify({
        logs: [{ level: "info", message: "bad", hostname: "server-host" }],
      }),
    });
    expect(await rejection.json()).toMatchObject({ accepted: 0, rejected: 1 });
  });

  it("refuses an unknown credential with the same generic 401", async () => {
    const response = await fetch(`${manager.url}/api/ingest/logs`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEYS.unknown.value },
      body: JSON.stringify({ logs: [{ level: "info", message: "x" }] }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("refuses a REVOKED credential with the same generic 401", async () => {
    // Modelled with a disposable test credential: a real key in this repo is
    // never revoked, because that would break every other consumer of it.
    const response = await fetch(`${manager.url}/api/ingest/logs`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEYS.revoked.value },
      body: JSON.stringify({ logs: [{ level: "info", message: "x" }] }),
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  it("refuses a wrong-kind credential on the other endpoint", async () => {
    const analyticsOnLogs = await fetch(`${manager.url}/api/ingest/logs`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEYS.analytics.value },
      body: JSON.stringify({ logs: [{ level: "info", message: "x" }] }),
    });
    expect(analyticsOnLogs.status).toBe(401);

    const serverOnEvents = await fetch(`${manager.url}/api/ingest/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: KEYS.server.value, events: [{ type: "pageview" }] }),
    });
    expect(serverOnEvents.status).toBe(401);

    const clientOnEvents = await fetch(`${manager.url}/api/ingest/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: KEYS.client.value, events: [{ type: "pageview" }] }),
    });
    expect(clientOnEvents.status).toBe(401);
  });

  it("accepts analytics events under the analytics key only", async () => {
    const ok = await fetch(`${manager.url}/api/ingest/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: KEYS.analytics.value,
        events: [
          { type: "pageview", path: "/dashboard" },
          { type: "event", name: "report_exported", props: { format: "csv" } },
        ],
      }),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ accepted: 2, rejected: 0 });
  });

  it("rejects a batch over 100 entries", async () => {
    const response = await fetch(`${manager.url}/api/ingest/logs`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEYS.server.value },
      body: JSON.stringify({
        logs: Array.from({ length: 101 }, (_, i) => ({ level: "info", message: `m${i}` })),
      }),
    });
    expect(response.status).toBe(400);
  });

  it("rejects a body over 128 KB", async () => {
    const response = await fetch(`${manager.url}/api/ingest/logs`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEYS.server.value },
      body: JSON.stringify({
        logs: [{ level: "info", message: "x".repeat(200_000) }],
      }),
    });
    expect(response.status).toBe(413);
  });

  it("rejects a timestamp older than 24 h or more than 10 min ahead", async () => {
    const post = async (ts) => {
      const response = await fetch(`${manager.url}/api/ingest/logs`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": KEYS.server.value },
        body: JSON.stringify({ logs: [{ level: "info", message: "ts", ts }] }),
      });
      return response.json();
    };

    expect(await post(Date.now() - 25 * 60 * 60 * 1000)).toMatchObject({ rejected: 1 });
    expect(await post(Date.now() + 11 * 60 * 1000)).toMatchObject({ rejected: 1 });
    expect(await post(Date.now())).toMatchObject({ accepted: 1, rejected: 0 });
    // ISO strings are accepted too.
    expect(await post(new Date().toISOString())).toMatchObject({ accepted: 1, rejected: 0 });
  });

  it("keeps every real app error path inside the accepted limits", async () => {
    // The shape this app actually ships: a route tag, a duration, a real stack.
    log = makeLog({ apiKey: KEYS.server.value });
    const boom = new Error("integration_probe_contract");
    log.info("request_completed", {
      route: "GET /api/transactions",
      durationMs: 12,
      status: 200,
      outcome: "response",
    });
    log.error("unhandled_route_error", { error: boom, route: "GET /api/transactions" });
    log.error("GET transactions error", {
      route: "GET /api/transactions",
      error: { name: "Error", message: "db down", stack: boom.stack },
    });
    await log.flush();

    expect(manager.state.rejected).toBe(0);
    expect(manager.state.accepted).toBe(3);
    const errorRow = manager.state.rows.find((e) => e.message === "unhandled_route_error");
    expect(errorRow.stack).toContain("integration_probe_contract");
    expect(errorRow.meta.route).toBe("GET /api/transactions");
  });

  it("never uploads the analytics key as a log credential", async () => {
    log = makeLog();
    log.info("key_discipline_probe", {
      analyticsKeySeen: Boolean(process.env.MANAGER_ANALYTICS_KEY),
    });
    await log.flush();
    const serialized = JSON.stringify(manager.state.rows);
    expect(serialized).not.toContain("mak_");
    expect(serialized).not.toContain("mck_");
  });

  it("keeps working with logging disabled entirely", async () => {
    // No endpoint configured: nothing is created, nothing throws.
    const { getManagerLogger, logServerError } = await import("@/lib/manager/server");
    const disabledLog = getManagerLogger();
    expect(disabledLog).toBeTruthy();
    expect(() => logServerError("disabled_probe", new Error("x"))).not.toThrow();
    await expect(disabledLog.flush()).resolves.toBeUndefined();
  });
});
