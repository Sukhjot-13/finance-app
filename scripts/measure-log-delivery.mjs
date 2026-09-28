#!/usr/bin/env node
/**
 * Measures log-delivery overhead for a realistic burst.
 *
 * Fires N log lines at the integration facade the way a request handler would, counts the
 * HTTP requests that actually reach the ingest endpoint, and reports latency.
 *
 * Usage: node scripts/measure-log-delivery.mjs [count]
 * Env:  MANAGER_ENDPOINT, MANAGER_LOG_KEY, MANAGER_APP_ID
 */
import process from "node:process";

const count = Number(process.argv[2] ?? 200);
const endpoint = (process.env.MANAGER_ENDPOINT ?? "http://127.0.0.1:3300").replace(/\/$/, "");
const apiKey = process.env.MANAGER_LOG_KEY ?? "";
const appId = process.env.MANAGER_APP_ID ?? "finance-app";

if (apiKey === "") {
  process.stderr.write("MANAGER_LOG_KEY is required\n");
  process.exit(2);
}

const ingestPath = `${endpoint}/api/ingest/logs`;

let requests = 0;
let entries = 0;
const timings = [];

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : String(input?.url ?? input);
  if (url.includes(ingestPath)) {
    requests += 1;
    if (typeof init?.body === "string") {
      try {
        const parsed = JSON.parse(init.body);
        entries += Array.isArray(parsed.logs) ? parsed.logs.length : 0;
      } catch {
        /* ignore */
      }
    }
    const started = performance.now();
    const response = await originalFetch(input, init);
    timings.push(performance.now() - started);
    return response;
  }
  return originalFetch(input, init);
};

const { startManagerLogger, managerLog, getManagerDroppedCount } = await import(
  process.env.MANAGER_MODULE ?? "../src/lib/manager/index.js"
);

startManagerLogger();

// Fire in paced chunks so the SDK's self rate-limiter is not the thing under test.
const perChunk = Number(process.env.MEASURE_CHUNK ?? 20);
const gapMs = Number(process.env.MEASURE_GAP_MS ?? 100);

const started = performance.now();
for (let index = 0; index < count; index += 1) {
  const level = index % 10 === 0 ? "error" : "info";
  managerLog(level, `burst_probe_${index}`, { index, filler: "x".repeat(120) });
  if ((index + 1) % perChunk === 0 && index + 1 < count) {
    await new Promise((resolve) => setTimeout(resolve, gapMs));
  }
}
const enqueueMs = performance.now() - started;

await new Promise((resolve) => setTimeout(resolve, 2500));

const total = timings.reduce((sum, value) => sum + value, 0);
process.stdout.write(`project           : ${appId}\n`);
process.stdout.write(`entries fired      : ${count}\n`);
process.stdout.write(
  `enqueue time       : ${enqueueMs.toFixed(1)}ms (logging must not block the request)\n`
);
process.stdout.write(`ingest requests    : ${requests}\n`);
process.stdout.write(`entries delivered  : ${entries}\n`);
process.stdout.write(`entries/request    : ${requests === 0 ? 0 : (entries / requests).toFixed(1)}\n`);
process.stdout.write(`http time total    : ${total.toFixed(1)}ms\n`);
process.stdout.write(`requests/1k lines  : ${((requests / count) * 1000).toFixed(1)}\n`);
process.stdout.write(`sdk dropped       : ${getManagerDroppedCount()}\n`);
process.stdout.write(`fired per second  : ${(count / (enqueueMs / 1000)).toFixed(0)}\n`);
