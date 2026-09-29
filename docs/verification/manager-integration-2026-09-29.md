# Manager integration — verification report

**Date:** 2026-09-29
**Repository:** `finance-app`
**Branch:** `feat/manager-integration` (not merged, not pushed)
**Base commit:** `11b9bf1` ("Drop the NEXT_PUBLIC_MANAGER_LOG_KEY alias for the browser key")

---

## 1. Summary

The Finance app already had a Manager integration committed, but it was broken in ways
that a passing unit test could not see. This pass found and fixed **four integration
defects and one unrelated production bug**, then re-verified every channel end to end
against a real Manager, a real browser and a real database.

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | The vendored SDK was a **stale, hand-patched fork** missing six upstream fixes | **high** | fixed |
| 2 | Server logs had **no request-completion flush** — routine entries depended on a timer that serverless freezes | **high** | fixed |
| 3 | Analytics and browser logging **shared one guard**, so analytics never loaded without a client log key; the browser logger was also **re-initialised on every mount** | medium | fixed |
| 4 | Routes had **no trace correlation** and only failures were logged (no successes, early returns, redirects, exports) | medium | fixed |
| 5 | **Only the first manual transaction ever succeeded** — a unique *sparse* index treated explicit `null` as a value | **critical (unrelated to Manager)** | fixed |

Plus two test-infrastructure defects that were hiding the above, and one latent SDK wart
that the app now works around.

---

## 2. Environment used

| Component | What | Isolation |
|---|---|---|
| Manager | `next dev` on `http://127.0.0.1:3300`, run via `npm run dev:local-db` | Manager's own local `mongodb-memory-server` instance (`.data/mongo/db`), **not** Atlas. Manager's code, settings, keys and data were not modified. |
| Finance database | `mongodb://127.0.0.1:27188/fintrack_verify` | A **separate** `mongod` instance, separate data directory, dedicated to this run. Never the real financial database. |
| Finance app | `next build` + `next start` on ports 3400/3401/3410/3411/3412 | Production builds only. |
| Credentials | Manager's own `finance-app` project keys from the local key file | Key **kinds and prefixes only** were ever printed; no key value appears in this report. |
| Browser | Playwright 1.63 Chromium, `chromium_headless_shell` | Local only. |
| Email | `@getbrevo/brevo` temporarily replaced **inside gitignored `node_modules`** with a local stub that records the message instead of sending it, so no email left the machine | Restored afterwards; the stub could never be committed. |

**Nothing was pushed, deployed, or merged. No branch other than the work branch was
touched. No Manager code, settings, keys, kill switches or project data were changed.**

---

## 3. Commands run and actual results

| Command | Result |
|---|---|
| `npm test` | **427 passed / 427** (was 339). Single entry point `test/run-all.test.js`, 4.69s. |
| `npm run lint` | **clean**, no output. |
| `npm run build` (configured) | **Compiled successfully**, 29 routes emitted. |
| `npm run build` (no `MANAGER_*` / `NEXT_PUBLIC_MANAGER_*`) | **Compiled successfully** — the integration is genuinely optional. |
| `node scripts/measure-log-delivery.mjs 200` | 200 entries → **10 ingest requests, 200 delivered, 20.0 entries/request, 0 dropped**, 212 lines/s enqueue. |
| `npm run manager:check` (live Manager + live FinTrack, healthy) | **21 passed, 0 skipped, 0 failed.** |
| `npm run manager:check` (with `APP_ORIGIN_DEGRADED`) | included in the 21: app still served in 13 ms with `MANAGER_ENDPOINT` unreachable. |
| HTTP flow harness (real app, real DB) | **46 passed / 0 failed** (31 after the temporary probe route was removed). |
| Manager row assertion harness (reads Manager's DB) | **29 passed / 0 failed.** |
| Playwright browser harness (real Chromium) | **55 passed / 0 failed**; re-run after cleanup: **54 passed / 0 failed.** |
| Configuration matrix (3 separate builds) | **30 passed / 0 failed.** |
| Server-key leakage scan of the whole `.next` output | **0 occurrences** of the `mlk_` value. `mck_` and `mak_` present in exactly one browser chunk, as intended. |

### 3.1 `npm test` — 427 tests

Baseline before this work was 339. The integration suites are new:

| Suite | Tests | Covers |
|---|---|---|
| `manager-config.suite.js` | 18 | config resolution, blank handling, static-`NEXT_PUBLIC_` enforcement, browser-logger singleton, analytics independence, **module boundary**, SDK freshness |
| `manager-server.suite.js` | 19 | root-logger caching, trace adoption, **concurrent isolation**, outcome classification, uncaught-error log + re-throw, flush on every exit, `AsyncLocalStorage` context, real SDK options |
| `manager-sdk.suite.js` | 22 | batching, 429/503 retry, outage tolerance, caps, timestamps, drop reporting, **native + serialized stacks**, redaction, trace-aware grouping |
| `manager-browser.suite.js` | 14 | **every** request-header form, caller-options immutability, cross-origin safety, console/uncaught/rejection/fetch-failure capture, capture during an in-flight upload |
| `manager-contract.suite.js` | 16 | Manager's strict schema: field whitelist, caps, batch limit, timestamp window, key-kind scoping, generic 401 |
| `api-categories.suite.js` (+3) | +3 | newly covered the **transactional** rename path, which was previously unreachable in tests |

`manager-integration.suite.js` (14 tests) was **removed**: it asserted the old
leading-edge-flush design that this work replaced.

---

## 4. Changes and why

### 4.1 Re-vendored the SDK (finding 1)

`src/lib/manager/logger.js` had drifted from the SDK Manager serves. Re-downloaded
through the `x-manager-key` header:

```bash
curl -fsSL -H "x-manager-key: $MANAGER_LOG_KEY" \
  "$MANAGER_ENDPOINT/api/sdk/logger?format=js" -o src/lib/manager/logger.js
```

The served bytes were verified to equal Manager's own `packages/logger/dist/logger.js`.
Six upstream fixes were being missed, each a real defect here:

| Upstream fix | Effect of the fork |
|---|---|
| `stackOf` accepts any object with a `stack` string | every **already-serialized** error lost its stack |
| stacks redacted + length-capped | stacks shipped unredacted and unbounded |
| stack also lifted from `meta.error` | `log.error("x", { error })` produced no top-level stack |
| fetch interception suppressed only while *invoking* the transport | every unrelated console error and app fetch **during an upload** was silently lost |
| dedupe key includes `traceId` | identical errors on different traces collapsed into one |
| dedupe requires the entry to still be queued | an already-flushed entry could be grouped again |
| `sameOrigin` check + defensive copy of `init` | `x-trace-id` was added to **third-party** requests (forcing CORS preflights) and the **caller's options object was mutated** |

`test/suites/manager-config.suite.js` now asserts these markers are present, so a
hand-patch or a stale copy fails CI.

### 4.2 `withManagerLogs` on every route (findings 2 and 4)

New `src/lib/manager/server.js` provides the wrapper; all **30 verbs across 17 route
files** now export `withManagerLogs(handleVERB)`. Named helpers in the same module
(`sanitizeCsvCell`, `toCsvRow`) are deliberately left unwrapped. Each request now gets:

- a **child** logger from `root.withTrace(traceId)` — `setContext`/`newTrace` on the
  shared root are never used, because those mutate the root and concurrent requests
  overwrite each other's trace;
- one `request_completed` entry with the status actually produced, classified
  `response` / `redirect` / `export` / `threw`;
- `unhandled_route_error` with the stack on a throw, **re-thrown** so the app's
  error-response policy is untouched;
- `after(() => root.flush())` on **every** exit.

A `Node` `AsyncLocalStorage` holds the request logger, so `logServerError` deep in
`lib/recurring.js` or a helper inherits the request's trace with no argument threading.

### 4.3 Browser channel (finding 3)

`ManagerProvider.jsx` now caches the logger on `window.__managerClientLogger` and
injects the tracker under `id="manager-tracker"` into `<head>`, with the two channels
gated **separately**. `src/proxy.js` adds the Manager origin to `script-src` as well as
`connect-src` (browsers without `strict-dynamic` fall back to host allowlists).

React error boundaries now report explicitly: a boundary error never reaches
`window.onerror`, so the SDK cannot see it on its own.

### 4.4 The transaction bug (finding 5)

`recurringRuleId` / `scheduledFor` were `default: null`, and the materialization guard
is a **unique sparse** index. A MongoDB sparse index skips documents where the field is
**absent** — an explicit `null` is a value and *is* indexed. Every hand-created
transaction therefore stored `(null, null)`, and the second one in the whole collection
failed:

```
E11000 duplicate key error collection: fintrack_verify.transactions
  index: recurringRuleId_1_scheduledFor_1 dup key: { recurringRuleId: null, scheduledFor: null }
```

Surfacing to the user as `500 {"message":"Failed to create transaction"}`. The unit
tests never saw it because the model registry is mocked. Fixed by removing
`default: null`; regression-tested in `models.suite.js`, and re-proved against a real
database:

```
5 manual transactions inserted (ids differ): 5
first materialized occurrence: ok
duplicate occurrence rejected: 11000
second occurrence for the same rule: ok
```

Idempotency of the recurring engine is preserved.

### 4.5 Test-infrastructure defects found along the way

- `api-client.suite.js` `afterEach` did `delete global.fetch`, leaving the process with
  **no global fetch at all** for every later suite. Any suite running after it that
  touched the network silently no-opped. Fixed to restore the original.
- The category-rename tests waited on `mongoose.startSession()` against a disconnected
  connection and burned mongoose's full 10 s buffer timeout, three times over. Now
  stubbed to the standalone case, which is both faster (10 s → 2 ms) and deterministic —
  and it made the transactional rename path testable for the first time.

---

## 5. Application flows exercised

Everything below was driven against the running app, not inspected.

**Authentication and session** — login page render; failed OTP send shows a safe
non-technical message (no provider/SDK internals); OTP verification through the app's
real endpoint; both session cookies issued; `HttpOnly` and `SameSite=Lax` confirmed in
the browser; session survives a full reload; anonymous `/dashboard` redirects to
`/login`; anonymous API reads are `401`; wrong OTP gives one uniform message; garbage
refresh token is `401`; refresh rotation issues a new cookie; logout; logout-all.

**Roles / ownership** — synthetic user A creates a transaction; synthetic user B gets
`404` reading **and** writing it, and B's list excludes A's rows. No cross-user leak.

**Money flows** — category list, custom category create, transaction create / read /
update / delete, income and expense types, budget upsert and read, recurring rule
create, and a **real UI round trip** through the dashboard drawer (open → amount,
category, description → save) and the transactions list (search filter → delete →
confirm → removed).

**Reports** — dashboard totals, budget progress, report generation with absolute
instants, CSV export returning `text/csv`, and validation: unparseable date filter →
`400` (never silently unfiltered), missing dates → `400`, invalid instant → `400`,
`"Infinity"` amount → `400`, blank category → `400`, malformed id → `404`.

**Validation, empty and failure states** — anonymous `401`, `400` for every input
rejection, `404` for missing records, `500` for genuine backend failures, plus a
deliberate uncaught exception and a handled failure returning the app's normal
`{"message":"Server error"}`.

---

## 6. Synthetic error and redaction evidence

A temporary authenticated diagnostic route (`src/app/api/zzdiagprobe`, uniquely named
marker per probe) was used to raise exact, bounded signals. **It required a real
session — an anonymous caller got `401` and that was asserted, precisely so the probe
surface could not be an authentication bypass. It was deleted before the final run and
is not in the diff.**

| Probe | App behaviour | Result in Manager |
|---|---|---|
| server `info` / `warn` / `error` | `200` | arrived at the right level, `source=server`, `trace` present |
| deliberate authenticated exception | `500`, body contains no stack/frame/identifier | `unhandled_route_error` with the **full stack**, `level=error`, fingerprinted |
| handled failure | `500 {"message":"Server error"}` | logged, and the response carried no internals |
| thrown redirect | `303` with `location` | `request_completed` classified `outcome=redirect`, `status=303` |
| CSV export | `200 text/csv` | classified `outcome=export` |
| concurrent requests (120 ms / 5 ms) | both `200` | **distinct traces**, no cross-contamination |
| adopted trace | `200` | server trace **equals** the sent `x-trace-id` |
| redaction | `200` | fake password / token / bearer / cookie / card / account **all absent**; non-sensitive `probe-category` **present** |
| logging after failures | `200` | still delivering |

Browser side (real Chromium): explicit log, `console.warn`, `console.error`, uncaught
exception **with stack**, `unhandled_rejection`, an aborted same-origin `fetch` at
`error` level, repeated errors across two flushes, and redaction of fake secrets. Client
rows carried **no** `hostname`/`pid`/`runtimeVersion`.

**No production data was touched.** Only synthetic users
(`synthetic-{a,b,c}@example.invalid`) and probe-marked fixtures existed, in a dedicated
database that was destroyed afterwards.

---

## 7. Trace correlation and analytics evidence

**Trace.** The browser SDK stamps `x-trace-id` on same-origin requests only. The server
adopts it and scopes it to a child logger. Evidence from a single browser run:

```
client info   probe_explicit_info_cleanF   trace=t_33c5c1fe-4009-4c32-afb
client error  probe_browser_error_cleanF   trace=t_33c5c1fe-4009-4c32-afb
client fatal  unhandled_rejection           trace=t_33c5c1fe-4009-4c32-afb
server error  unhandled_route_error         trace=t_33c5c1fe-4009-4c32-afb
server info   request_completed             trace=t_33c5c1fe-4009-4c32-afb
```

Server-side concurrency, from the marker `final1`:

```
concurrent traces: slow=1723b8fe-483a-4168-b8f0-b2d645a35884
                   fast=d9788214-1551-4c24-9d8f-bb365c6ab266
```

**Analytics.** The tracker loaded, initialized once, and delivered pageviews (including
after SPA navigation), click targets, and custom events:

```
{"type":"pageview","name":"finance-app","path":"/transactions",…}
{"type":"click","name":"[/transactions] Confirm (.text-xs.font-semibold)",…}
{"type":"custom","name":"probe_event_cleanF","props":{"probe":true,"surface":"verification"}}
{"type":"custom","name":"probe_spa_event_cleanF","props":{"probe":true}}
```

No financial value, credential or account number appears in any event property. No CSP
violation and no blocked resource appeared in the browser console at any point.

---

## 8. What was real, and what was mocked

**Real end to end** — Manager ingest over HTTP; the Finance production build served by
`next start`; MongoDB (a real `mongod`, real indexes, real transactions); the app's own
API routes; a real Chromium browser with a real cookie jar; analytics delivered from the
real tracker; the analytics/log key-kind rejections against the real Manager.

**Mocked / isolated** — the email provider (a local `node_modules` stub that records
instead of sending; no email left the machine). No bank, payment, AI or messaging
provider was contacted at all. All rate-limit, retry/backoff, outage, payload-cap,
drop-reporting and revoked-credential cases used **local mock HTTP servers**, exactly as
required — production was never flooded.

---

## 9. Cleanup performed

- `src/app/api/zzdiagprobe/` — **deleted**; confirmed `404` afterwards and absent from
  the diff. No authentication bypass was ever left in place.
- The Brevo `node_modules` stub — **restored** from a backup and re-imported to confirm
  the real exports are back.
- No temporary buttons, no test-only code paths, no debug logging in any committed file.
- The isolated MongoDB instance and the synthetic users/fixtures lived only in
  throwaway directories outside the repository and were stopped afterwards.
- `git status` shows only the intended source, test, script and documentation changes.
  No `.env` file, no key material, and no `node_modules` content is staged.

---

## 10. Remaining external blockers and limitations

**None blocked the work.** Two honest limitations:

1. **The login UI's OTP step was verified with a stubbed mailer, not a real inbox.**
   With the real Brevo package in place the send correctly fails and the UI correctly
   stays on step 1 — that failure path is asserted. The post-cleanup run therefore
   completes login through the app's real `/api/auth/otp/verify` endpoint from inside
   the page (real bcrypt, real cookies, real session). No real email was ever sent.
2. **The automated browser presents a normal Chrome User-Agent.** Manager deliberately
   drops analytics events whose UA matches its bot pattern, and headless Chromium ships
   `HeadlessChrome`, which matches. Presenting a normal UA is a harness accommodation,
   not a change to the app or to Manager; it is called out here so the analytics
   evidence is read correctly.

Also worth flagging for whoever deploys: the transaction fix works immediately on an
existing database, but the *cleaner* partial-index form needs a one-time index swap
recorded in `docs/suggestions.md`. And the recommended next step is to re-download
`src/lib/manager/logger.js` after the next Manager upgrade — the file does not update
itself.

---

## 11. Reproducing this

```bash
# Manager, isolated local database
cd ../Manager && npm run dev:local-db          # http://127.0.0.1:3300

# Finance, its own isolated database
npm test && npm run lint && npm run build
#   MANAGER_ENDPOINT, MANAGER_APP_ID, MANAGER_LOG_KEY,
#   MANAGER_CLIENT_KEY, MANAGER_ANALYTICS_KEY, MONGODB_URI
npm run manager:check \
  APP_ORIGIN=http://127.0.0.1:3000 \
  APP_ORIGIN_DEGRADED=http://127.0.0.1:3001 \
  APP_COOKIE="accessToken=…; refreshToken=…"
node scripts/measure-log-delivery.mjs 200
```

Bounded, uniquely named synthetic probes and the browser harness were **not** committed;
they required a temporary route and a stubbed mail provider, both of which were removed.
Every assertion they made is now covered permanently by the five `manager-*` suites in
`test/suites/`.
