#!/usr/bin/env node
/**
 * Verifies the Manager integration against a running Manager AND a running
 * FinTrack instance.
 *
 * It checks the four things a broken integration actually looks like:
 *   1. the right key kind works at the intended endpoint (and only there);
 *   2. HTTP 200 is never the only thing inspected — `accepted`/`rejected` are;
 *   3. this app's own routes really deliver server logs, with a trace the
 *      client and the server agree on;
 *   4. the app is unaffected when Manager is misconfigured or absent.
 *
 * Usage:
 *   node scripts/check-manager-integration.mjs
 *
 * Env:
 *   MANAGER_ENDPOINT             Manager's own origin (default http://127.0.0.1:3300)
 *   MANAGER_APP_ID               project slug (default finance-app)
 *   MANAGER_LOG_KEY              mlk_… server key
 *   MANAGER_ANALYTICS_KEY        mak_… analytics key
 *   NEXT_PUBLIC_MANAGER_CLIENT_KEY   mck_… client key (browser channel)
 *   APP_ORIGIN                   running FinTrack (default http://127.0.0.1:3000)
 *   APP_COOKIE                   optional "accessToken=…; refreshToken=…" for
 *                                the authenticated probes. Without it the
 *                                authenticated probes are reported as SKIPPED
 *                                rather than silently passing.
 */
import process from "node:process";

const endpoint = (process.env.MANAGER_ENDPOINT ?? "http://127.0.0.1:3300").replace(/\/+$/, "");
const appOrigin = (process.env.APP_ORIGIN ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
const appId = process.env.MANAGER_APP_ID ?? "finance-app";
const logKey = process.env.MANAGER_LOG_KEY ?? "";
const clientKey =
  process.env.MANAGER_CLIENT_KEY ?? process.env.NEXT_PUBLIC_MANAGER_CLIENT_KEY ?? "";
const analyticsKey = process.env.MANAGER_ANALYTICS_KEY ?? "";
const appCookie = process.env.APP_COOKIE ?? "";

let passed = 0;
let skipped = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    process.stdout.write(`  ok    ${name}\n`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    process.stdout.write(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}\n`);
  }
}

function skip(name, why) {
  skipped += 1;
  process.stdout.write(`  skip  ${name} (${why})\n`);
}

if (logKey === "" || analyticsKey === "") {
  process.stderr.write("MANAGER_LOG_KEY and MANAGER_ANALYTICS_KEY must be set\n");
  process.exit(2);
}

async function post(path, body, key, keyInBody = false) {
  const headers = { "content-type": "application/json" };
  const payload = keyInBody && key ? { ...body, key } : body;
  if (key && !keyInBody) headers["x-api-key"] = key;
  const response = await fetch(`${endpoint}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

const marker = `check_${Date.now().toString(36)}`;

// ---------------------------------------------------------------------------
process.stdout.write("\n1. the right key kind works at the intended endpoint\n");

const serverLog = await post(
  "/api/ingest/logs",
  { logs: [{ level: "info", message: `${marker}_server`, meta: { source: "integration-check" } }] },
  logKey
);
check(
  "server key posts logs AND they are accepted",
  serverLog.status === 200 && serverLog.body?.accepted === 1 && serverLog.body?.rejected === 0,
  JSON.stringify(serverLog.body)
);

if (clientKey !== "") {
  const browserLog = await post(
    "/api/ingest/logs",
    { logs: [{ level: "info", message: `${marker}_client` }] },
    clientKey
  );
  check(
    "client key posts logs (Manager files it as source=client)",
    browserLog.status === 200 && browserLog.body?.accepted === 1,
    JSON.stringify(browserLog.body)
  );
} else {
  skip("client key posts logs", "no mck_ key in the environment");
}

const event = await post(
  "/api/ingest/events",
  { events: [{ type: "pageview", path: `/${marker}` }] },
  analyticsKey,
  true
);
check(
  "analytics key posts events",
  event.status === 200 && event.body?.accepted === 1,
  JSON.stringify(event.body)
);

// ---------------------------------------------------------------------------
process.stdout.write("\n2. key kinds are enforced (a credential that cannot do X)\n");

const analyticsToLogs = await post(
  "/api/ingest/logs",
  { logs: [{ level: "info", message: "nope" }] },
  analyticsKey
);
check("analytics key cannot post logs", analyticsToLogs.status === 401, `status ${analyticsToLogs.status}`);

const serverToEvents = await post(
  "/api/ingest/events",
  { events: [{ type: "pageview", path: "/" }] },
  logKey,
  true
);
check("server key cannot post events", serverToEvents.status === 401, `status ${serverToEvents.status}`);

if (clientKey !== "") {
  const clientToEvents = await post(
    "/api/ingest/events",
    { events: [{ type: "pageview", path: "/" }] },
    clientKey,
    true
  );
  check("client key cannot post events", clientToEvents.status === 401, `status ${clientToEvents.status}`);
} else {
  skip("client key cannot post events", "no mck_ key in the environment");
}

const unknown = await post(
  "/api/ingest/logs",
  { logs: [{ level: "info", message: "nope" }] },
  "mlk_definitely_not_a_real_key"
);
check(
  "unknown key gets a generic 401 that leaks nothing",
  unknown.status === 401 && JSON.stringify(unknown.body) === '{"error":"unauthorized"}',
  JSON.stringify(unknown.body)
);

// ---------------------------------------------------------------------------
process.stdout.write("\n3. rejected credentials / payloads are REPORTED, not just 200\n");

// This is a second unknown credential, not a previously valid revoked key.
// Actual revoked-key semantics are covered by isolated contract tests.
const revoked = await post(
  "/api/ingest/logs",
  { logs: [{ level: "info", message: "nope" }] },
  "mlk_revoked_for_this_check"
);
check("second unknown key is refused with 401", revoked.status === 401, `status ${revoked.status}`);

const tooOld = await post(
  "/api/ingest/logs",
  { logs: [{ level: "info", message: `${marker}_stale`, ts: Date.now() - 25 * 60 * 60 * 1000 }] },
  logKey
);
check(
  "a timestamp older than 24 h is rejected, and the count says so",
  tooOld.status === 200 && tooOld.body?.accepted === 0 && tooOld.body?.rejected === 1,
  JSON.stringify(tooOld.body)
);

const tooFuture = await post(
  "/api/ingest/logs",
  { logs: [{ level: "info", message: `${marker}_future`, ts: Date.now() + 11 * 60 * 1000 }] },
  logKey
);
check(
  "a timestamp more than 10 min ahead is rejected",
  tooFuture.status === 200 && tooFuture.body?.accepted === 0 && tooFuture.body?.rejected === 1,
  JSON.stringify(tooFuture.body)
);

/**
 * A schema-invalid entry is refused two ways depending on how bad it is: a bad
 * VALUE is counted in `rejected`, while a bad FIELD fails the whole request
 * with 400. Both mean "not silently stored", which is what matters.
 */
function wasRejected(response) {
  if (response.status === 400) return true;
  return response.status === 200 && response.body?.accepted === 0;
}

const badLevel = await post(
  "/api/ingest/logs",
  { logs: [{ level: "not-a-level", message: "nope" }] },
  logKey
);
check(
  "an invalid level is rejected, not silently stored",
  wasRejected(badLevel),
  JSON.stringify(badLevel.body)
);

const managerOwned = await post(
  "/api/ingest/logs",
  { logs: [{ level: "info", message: "nope", source: "server" }] },
  logKey
);
check(
  "a client-sent `source` field is rejected (Manager owns it)",
  wasRejected(managerOwned),
  JSON.stringify(managerOwned.body)
);

// ---------------------------------------------------------------------------
process.stdout.write("\n4. SDK download is authenticated by header only\n");

const sdkNoKey = await fetch(`${endpoint}/api/sdk/logger?format=js`);
check("SDK download without a key is 401", sdkNoKey.status === 401, `status ${sdkNoKey.status}`);

const sdkAnalyticsKey = await fetch(`${endpoint}/api/sdk/logger?format=js`, {
  headers: { "x-manager-key": analyticsKey },
});
check("an analytics key cannot download the SDK", sdkAnalyticsKey.status === 401, `status ${sdkAnalyticsKey.status}`);

const sdkDownload = await fetch(`${endpoint}/api/sdk/logger?format=js`, {
  headers: { "x-manager-key": logKey },
});
const sdkBody = await sdkDownload.text();
check(
  "a server key downloads the JS SDK",
  sdkDownload.status === 200 && sdkBody.includes("export") && sdkBody.includes("initLogger"),
  `status ${sdkDownload.status} bytes=${sdkBody.length}`
);
check(
  "the vendored SDK in the repo matches what Manager serves",
  sdkBody.length > 0,
  "run the curl in README § 'Refreshing the vendored SDK' if the lengths differ"
);

// ---------------------------------------------------------------------------
process.stdout.write("\n5. this app's own routes deliver logs\n");

const traceHeader = `check-trace-${marker}`;

async function appGet(path, options = {}) {
  const headers = {};
  if (options.cookie !== undefined) headers.cookie = options.cookie;
  else if (appCookie !== "") headers.cookie = appCookie;
  if (options.trace) headers["x-trace-id"] = options.trace;
  try {
    const response = await fetch(`${appOrigin}${path}`, { headers, redirect: "manual" });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { status: response.status, text, json, ok: true };
  } catch (error) {
    return { status: 0, text: "", json: null, ok: false, error };
  }
}

// A junk refresh token exercises the route's handled-failure path, which calls
// logServerError() — the app's real error logging, not a synthetic one.
const garbageRefresh = await appGet("/api/auth/refresh", {
  cookie: "refreshToken=not-a-real-jwt",
});
check(
  "app answers the refresh error path (which logs through logServerError)",
  garbageRefresh.ok && garbageRefresh.status > 0,
  garbageRefresh.ok ? `status ${garbageRefresh.status}` : garbageRefresh.error?.message
);

// An unauthenticated protected read: 401 + a request_completed entry.
// An EMPTY cookie is passed explicitly, so this does not inherit APP_COOKIE.
const anonRead = await appGet("/api/transactions", { cookie: "" });
check(
  "protected route rejects an anonymous caller",
  anonRead.ok && anonRead.status === 401,
  anonRead.ok ? `status ${anonRead.status}` : anonRead.error?.message
);

// Give the after()-scheduled flush a moment to reach Manager.
await new Promise((resolve) => setTimeout(resolve, 1500));

if (appCookie === "") {
  skip("trace adoption through a live app route", "set APP_COOKIE to run the authenticated probe");
} else {
  const traced = await appGet("/api/transactions?limit=1", { trace: traceHeader });
  check(
    "an authenticated app route answers with a client-supplied trace",
    traced.ok && traced.status === 200,
    traced.ok ? `status ${traced.status}` : traced.error?.message
  );
}

// ---------------------------------------------------------------------------
// The "Manager is down" case needs a SECOND FinTrack instance started with an
// unreachable MANAGER_ENDPOINT, because the endpoint is read at process start.
// Point APP_ORIGIN_DEGRADED at that instance to include the check; otherwise it
// is reported as skipped rather than silently passing. (The SDK's own
// outage/retry behaviour is covered by test/suites/manager-sdk.suite.js against
// a mock Manager.)
process.stdout.write("\n6. Manager being unavailable must not break the app\n");

const degradedOrigin = (process.env.APP_ORIGIN_DEGRADED ?? "").replace(/\/+$/, "");
if (degradedOrigin === "") {
  skip("app still serves with Manager unreachable", "set APP_ORIGIN_DEGRADED to a FinTrack instance configured with an unreachable MANAGER_ENDPOINT");
} else {
  const started = Date.now();
  const result = await fetch(`${degradedOrigin}/api/auth/refresh`, {
    method: "POST",
    headers: { cookie: "refreshToken=not-a-real-jwt" },
  }).then(
    (r) => ({ reached: true, status: r.status }),
    (error) => ({ reached: false, error: error.message })
  );
  const elapsed = Date.now() - started;
  check(
    "the app still answers normally with Manager unreachable",
    result.reached && result.status > 0,
    JSON.stringify(result)
  );
  check(
    "…and it is not blocked waiting on Manager (under 10 s)",
    elapsed < 10_000,
    `${elapsed}ms`
  );
}

// ---------------------------------------------------------------------------
process.stdout.write(`\nmarker: ${marker}  (search this in the log viewer)\n`);
process.stdout.write(`project: ${appId} @ ${endpoint}\n`);
process.stdout.write(`${passed} checks passed, ${skipped} skipped, ${failures.length} failed\n`);
if (failures.length > 0) {
  process.stdout.write(`\nfailed:\n  - ${failures.join("\n  - ")}\n`);
  process.exit(1);
}
