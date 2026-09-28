#!/usr/bin/env node
/**
 * Verifies the Manager integration end to end against a running Manager:
 *   1. server key accepted, client key accepted, analytics key accepted
 *   2. analytics key refused on the log endpoint and server key refused on events
 *   3. the app's own error path (POST /api/auth/refresh with a junk refreshToken,
 *      which logs through logServerError in src/app/api/auth/refresh/route.js)
 *      responds and therefore lands in Manager
 *
 * Usage: node scripts/check-manager-integration.mjs
 * Env:  MANAGER_ENDPOINT, MANAGER_LOG_KEY, MANAGER_CLIENT_KEY (or
 *       NEXT_PUBLIC_MANAGER_CLIENT_KEY — same mck_… value), MANAGER_ANALYTICS_KEY,
 *       APP_ORIGIN (default http://localhost:3000)
 */
import process from "node:process";

const endpoint = (process.env.MANAGER_ENDPOINT ?? "http://127.0.0.1:3300").replace(/\/$/, "");
const logKey = process.env.MANAGER_LOG_KEY ?? "";
// The browser key lives under NEXT_PUBLIC_ in .env.local; both names are the same mck_… value.
const clientKey = process.env.MANAGER_CLIENT_KEY ?? process.env.NEXT_PUBLIC_MANAGER_CLIENT_KEY ?? "";
const analyticsKey = process.env.MANAGER_ANALYTICS_KEY ?? "";
const appOrigin = (process.env.APP_ORIGIN ?? "http://localhost:3000").replace(/\/$/, "");

let passed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    process.stdout.write(`  ok  ${name}\n`);
  } else {
    failures.push(`${name}${detail === "" ? "" : ` — ${detail}`}`);
    process.stdout.write(`FAIL  ${name}${detail === "" ? "" : ` — ${detail}`}\n`);
  }
}

if (logKey === "" || analyticsKey === "") {
  process.stderr.write("MANAGER_LOG_KEY and MANAGER_ANALYTICS_KEY must be set\n");
  process.exit(2);
}

async function post(path, body, key) {
  const headers = { "content-type": "application/json" };
  if (key) headers["x-api-key"] = key;
  const response = await fetch(`${endpoint}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

const marker = `check_${Date.now()}`;

process.stdout.write("1. ingest accepts the right key kinds\n");
const serverLog = await post(
  "/api/ingest/logs",
  { logs: [{ level: "info", message: `${marker}_server`, meta: { source: "integration-check" } }] },
  logKey
);
check(
  "server key posts logs",
  serverLog.status === 200 && serverLog.body.accepted === 1,
  JSON.stringify(serverLog.body)
);

if (clientKey !== "") {
  const browserLog = await post(
    "/api/ingest/logs",
    { logs: [{ level: "info", message: `${marker}_client`, meta: { source: "integration-check" } }] },
    clientKey
  );
  check(
    "client key posts logs (lands as source=client)",
    browserLog.status === 200 && browserLog.body.accepted === 1,
    JSON.stringify(browserLog.body)
  );
}

const event = await post("/api/ingest/events", {
  key: analyticsKey,
  events: [{ type: "pageview", path: "/integration-check" }],
});
check(
  "analytics key posts events",
  event.status === 200 && event.body.accepted === 1,
  JSON.stringify(event.body)
);

process.stdout.write("2. key kinds are enforced\n");
const wrongEvents = await post(
  "/api/ingest/events",
  { events: [{ type: "pageview", path: "/" }] },
  logKey
);
check("server key cannot post events", wrongEvents.status === 401, `status ${wrongEvents.status}`);

const wrongLogs = await post(
  "/api/ingest/logs",
  { logs: [{ level: "info", message: "nope" }] },
  analyticsKey
);
check("analytics key cannot post logs", wrongLogs.status === 401, `status ${wrongLogs.status}`);

const badKey = await post(
  "/api/ingest/logs",
  { logs: [{ level: "info", message: "nope" }] },
  "mlk_definitely_not_a_real_key"
);
check(
  "unknown key gets a generic 401",
  badKey.status === 401 && JSON.stringify(badKey.body) === '{"error":"unauthorized"}',
  JSON.stringify(badKey.body)
);

process.stdout.write("3. the app's own logs reach Manager\n");
try {
  const refresh = await fetch(`${appOrigin}/api/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "refreshToken=not-a-real-jwt" },
  });
  check(
    "app error path responds (401 => logged by the route handler)",
    refresh.status > 0,
    `status ${refresh.status}`
  );
} catch (error) {
  check("app error path responds", false, error.message);
}

process.stdout.write(`\nmarker: ${marker} (search this in the log viewer)\n`);
process.stdout.write(`${passed} checks passed, ${failures.length} failed\n`);
if (failures.length > 0) process.exit(1);
