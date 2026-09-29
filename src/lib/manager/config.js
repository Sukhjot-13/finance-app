/**
 * Manager configuration — the ONLY module both halves of the integration share.
 *
 * It deliberately imports nothing (no `next/server`, no node builtins, no SDK)
 * so it is safe to pull into a `"use client"` module. `server.js` adds the
 * logger lifecycle; `ManagerProvider.jsx` adds the browser half.
 *
 * Everything is optional. With no Manager variables set, `enabled` is false in
 * both configs and the whole integration degrades to no-ops, so local dev, CI
 * and previews behave exactly as they did before.
 */

function clean(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Server configuration.
 *
 * `MANAGER_ENDPOINT` is Manager's OWN origin — not this app's port and not an
 * ingest path. `MANAGER_LOG_KEY` must be the project's `mlk_` server key and is
 * server-only: it must never appear in a `NEXT_PUBLIC_` variable, in HTML, in
 * the client bundle or in an error response.
 *
 * Read through literal `process.env.NAME` member expressions on purpose (see
 * `managerClientConfig` for why a helper would break the browser half).
 */
export const managerConfig = {
  endpoint: clean(process.env.MANAGER_ENDPOINT),
  appId: clean(process.env.MANAGER_APP_ID),
  apiKey: clean(process.env.MANAGER_LOG_KEY),
  analyticsKey: clean(process.env.MANAGER_ANALYTICS_KEY),
  enabled: Boolean(
    clean(process.env.MANAGER_ENDPOINT) &&
      clean(process.env.MANAGER_APP_ID) &&
      clean(process.env.MANAGER_LOG_KEY)
  ),
};

/**
 * Everything the BROWSER can see, written out as STATIC
 * `process.env.NEXT_PUBLIC_*` member expressions.
 *
 * Next.js inlines only statically written member expressions into the client
 * bundle. Two traps, both verified against a production build of this repo:
 *   1. `process.env` in browser code is an empty object, so a plain
 *      `process.env.MANAGER_*` read inside a `"use client"` module always
 *      resolves to undefined;
 *   2. a DYNAMIC read (`process.env[name]`, i.e. any `env(name)` helper) is not
 *      inlined either — it compiles to a runtime index into that same empty
 *      object, and is just as dead.
 *
 * `apiKey` is the project's CLIENT key (`mck_…`), never the `mlk_` server key:
 * Manager derives each entry's `source` from the key kind, and shipping the
 * server key to a browser would leak it.
 */
export const managerClientConfig = {
  endpoint: clean(process.env.NEXT_PUBLIC_MANAGER_ENDPOINT),
  appId: clean(process.env.NEXT_PUBLIC_MANAGER_APP_ID),
  apiKey: clean(process.env.NEXT_PUBLIC_MANAGER_CLIENT_KEY),
  analyticsKey: clean(process.env.NEXT_PUBLIC_MANAGER_ANALYTICS_KEY),
  /** Browser LOGS need all three; analytics deliberately does not. */
  logsEnabled: Boolean(
    clean(process.env.NEXT_PUBLIC_MANAGER_ENDPOINT) &&
      clean(process.env.NEXT_PUBLIC_MANAGER_APP_ID) &&
      clean(process.env.NEXT_PUBLIC_MANAGER_CLIENT_KEY)
  ),
  /** Kept for callers/tests that only care whether anything browser-side is on. */
  get enabled() {
    return this.logsEnabled;
  },
};

/**
 * Tracker `<script>` descriptor for the browser, or null when analytics is not
 * configured. Analytics is INDEPENDENT of browser logging: it needs only the
 * analytics key, so analytics keeps working when the client log key is absent.
 *
 * The key travels in a `data-` attribute, never in the URL — a key in a query
 * string leaks through history, referrers and server access logs.
 */
export function managerTrackerScript() {
  const endpoint = clean(process.env.NEXT_PUBLIC_MANAGER_ENDPOINT)?.replace(/\/+$/, "");
  const appId = clean(process.env.NEXT_PUBLIC_MANAGER_APP_ID);
  const key = clean(process.env.NEXT_PUBLIC_MANAGER_ANALYTICS_KEY);
  if (!endpoint || !appId || !key) return null;
  return { src: `${endpoint}/t.js?v=1`, appId, key };
}
