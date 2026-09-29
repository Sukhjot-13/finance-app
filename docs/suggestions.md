# Suggestions & Ideas

> Auto-populated whenever an idea, improvement, vulnerability, or new feature suggestion comes up. Completed items are removed once done (full history in git log).

---

## 🔴 Vulnerabilities

### Recurring transactions could be applied twice (2026-09-28)

`materializeDueRules` read due rules with a plain `find`, inserted the
Transactions in a loop, and then unconditionally `$set` `nextRunAt`. Two
concurrent passes (two tabs, a double-tap on Verify) both read the same
`nextRunAt` and both inserted the same occurrence, duplicating rent/salary rows
with no way to tell them apart. **Fixed** with an atomic
`findOneAndUpdate({ _id, nextRunAt })` claim taken BEFORE any insert plus a
unique sparse `(recurringRuleId, scheduledFor)` index; E11000 on insert is
treated as "already materialized". Regression-tested in
`test/suites/recurring.suite.js`.

### `"Infinity"` amount permanently poisoned a user's balance (2026-09-28)

`POST /api/transactions` used `if (!amount || isNaN(amount) || amount <= 0)`,
which ACCEPTS the string `"Infinity"` and `"1e400"` (`isNaN("Infinity") === false`
and the string compares `> 0`). The stored double then satisfied the schema's
`min: 0.01`, and one such row made `currentBalance`, `monthlyIncome/Expenses`,
the balance aggregation and every budget rollup `±Infinity` for that user
**permanently** — aggregates never self-heal. **Fixed** with
`Number.isFinite` plus a `1e12` cap on every numeric route
(`src/lib/money.js#coerceAmount`), and a finiteness validator re-added at the
model layer so no write path can slip a non-finite amount through.

### Prototype pollution via user-supplied category names (2026-09-28)

`POST /api/categories` only enforced length, so a category literally named
`constructor` made `spendingMap[budget.category] || 0` in
`api/reports/budget-progress` resolve to the `Object` constructor (the route
returned `spent: <function>`, `percentage: null`, `remaining: NaN`), and
`acc["__proto__"] = …` in `api/reports/generate` was a silent no-op — that
category's spending **disappeared from a financial report**. **Fixed** with
`Object.create(null)` accumulators, `Object.hasOwn` lookups (so a legitimate
`$0` spend no longer falls through to a prototype lookup), and rejection of
reserved names in `POST`/`PUT /api/categories`.

### Only the FIRST manual transaction ever succeeded (2026-09-29) — **found and fixed**

`Transaction.recurringRuleId` / `scheduledFor` were declared `default: null`, and
the materialization guard is a **unique sparse** index on `{recurringRuleId, scheduledFor}`.
A MongoDB sparse index skips documents where the indexed field is **absent** — an
explicit `null` is a value and *is* indexed. So every hand-created transaction stored
`(null, null)`, and the second one **in the entire collection** failed with
`E11000 duplicate key … recurringRuleId_1_scheduledFor_1`, surfacing to the user as
`500 {"message":"Failed to create transaction"}`.

The unit tests never saw it because the model registry is mocked, so nothing ever hit
a real index; it only appeared when the flow was exercised against a real database.

**Fixed** by removing `default: null` so ordinary rows omit the fields, which works on
already-provisioned databases because it only changes documents written from now on.
Regression-tested in `test/suites/models.suite.js`.

**Follow-up worth doing:** a *partial* index
(`partialFilterExpression: { recurringRuleId: { $type: "objectId" } }`) expresses the
intent directly and is immune to this whole class of bug. It cannot simply be added,
because MongoDB refuses an index whose key pattern already exists with different
options — the stale sparse index must be dropped first, which is a production
migration, not a code change:

```js
db.transactions.dropIndex("recurringRuleId_1_scheduledFor_1");
db.transactions.createIndex(
  { recurringRuleId: 1, scheduledFor: 1 },
  { unique: true, partialFilterExpression: { recurringRuleId: { $type: "objectId" } } }
);
```

The existing `(null, null)` entries stay in the sparse index until that drop runs; they
are harmless but waste index space.

### The vendored Manager SDK was a stale, hand-patched fork (2026-09-29) — **found and fixed**

`src/lib/manager/logger.js` had drifted from the SDK Manager serves, missing six
upstream fixes — every one of which was a real defect in this app:

| Upstream fix | What was broken here |
|---|---|
| `stackOf` accepts any object with a `stack` string | every already-serialized error lost its stack |
| stacks are redacted and length-capped | stacks shipped unredacted and unbounded |
| the stack is also lifted from `meta.error` | `log.error("x", { error })` produced no top-level stack |
| the fetch wrapper only suppresses interception while *invoking* its own transport | every unrelated console error and app fetch during an upload was silently lost |
| the dedupe key includes `traceId` | identical errors on different traces collapsed into one, destroying correlation |
| dedupe also requires the entry to still be queued | a flushed entry could be "grouped" again |

Plus a `sameOrigin` check and a defensive copy of the caller's `init`, so `x-trace-id`
was being added to **third-party** requests (forcing CORS preflights) and the caller's
options object was being mutated.

**Fixed** by re-downloading the SDK through the `x-manager-key` header. The README
documents the refresh command, and `test/suites/manager-config.suite.js` now asserts the
upstream fixes are present so a hand-patch or a stale copy fails in CI.

### Server logs were only ever delivered by luck (2026-09-29) — **found and fixed**

The previous integration had no `after()` flush. Routine levels rode a 250ms SDK timer,
and `error`/`fatal` used a leading-edge flush with a 100ms minimum gap. On a serverless
runtime, where timers are frozen once the response is sent, that means routine
`info` entries — including the per-request completion record — were delivered only when
the process happened to stay warm. Log methods enqueue, so `await log.error()` does not
flush either.

**Fixed**: every route verb is wrapped in `withManagerLogs(...)`, which schedules
`after(() => root.flush())` on **every** exit (success, early return, throw), records
the status the handler actually produced, and adopts the browser's `x-trace-id` on a
request-local child logger. `after()` is the supported mechanism; a timer alone is not.

### The browser logger and analytics shared one guard (2026-09-29) — **found and fixed**

`ManagerProvider` returned early unless browser *logging* was configured, so a
deployment with only a `mak_` analytics key — the common case for a public site — never
loaded the tracker at all. It also created a new `initLogger` instance on every mount
(no `window` cache), so Strict Mode, Fast Refresh or a second provider install would
duplicate every console listener, every global error handler and every upload.

**Fixed**: the two channels are gated separately (`logsEnabled` vs the analytics key),
the logger is cached on `window.__managerClientLogger`, and the tracker tag is
deduplicated by `id`.

---

## 🟢 Improvements

### Manager log delivery: batch instead of one request per line (2026-09-28)

*(Superseded 2026-09-29: the leading-edge flush this describes was replaced by
`after()`-scheduled request-completion flushing. The 250ms batch window is still in
place and still correct.)*

Flushing on every write defeated the SDK's batching (96/200 delivered, 105 dropped,
4.8 entries/request). Routine levels now ride a 250ms `flushIntervalMs` window and
`error`/`fatal` use a leading-edge flush with a 100ms minimum gap: 201/200 delivered,
0 dropped, 18.3 entries/request. Measured with
`node scripts/measure-log-delivery.mjs 200`.

### CSV injection via bare CR in the export (2026-09-28)

`toCsvRow` only quoted on `/[",\n]/` and `sanitizeCsvCell`'s prefix guard only
fired when `\r` was the FIRST character, so a description of `x\r=1+1`
exported unquoted; Excel/LibreOffice split on the CR into a second row whose
first cell `=1+1` **executed**. Fixed by collapsing `[\r\n]+` to spaces before
both the formula guard and the quoting decision. See
`src/app/api/reports/export/route.js`.

### Rate limiter trusted a spoofable `x-real-ip` header (2026-09-28)

The comment asserted the header was set by the hosting edge, but the code read
it straight off the request and PREFERRED it over the correctly-handled last
XFF entry — rotating it per request defeated the 20/hour per-IP send cap and
the 25/15min per-IP verify cap outright. The `x-real-ip` preference is deleted;
bucketing now uses `request.ip` and falls back to the last `x-forwarded-for`
entry. (The app deploys on Vercel, whose documented client-IP header is
`x-forwarded-for`; `x-real-ip` is an nginx convention Vercel does not set.)

### Money was stored as BSON doubles (2026-09-28)

`income - expenses` over unrounded floats produced payloads like
`1234.5600000000002`; `formatCurrency` masked it at display time but the API
payloads, `Math.round(percentage)` and any re-aggregation compounded the drift.
Transactions (and recurring rules / budgets) now carry integer `amountMinor`
plus a per-transaction `currency`; every report `$sum`/`reduce` is integer
arithmetic and the decimal conversion happens exactly once at the response
boundary. Backfill: `scripts/migrate-amount-minor.mjs` (idempotent).
**Assumption: every supported currency (USD, INR) is 2-decimal.**

### Logout failures were silently swallowed (2026-09-28)

`handleLogout` navigated to `/login` unconditionally, and `api()` only rejects
on refresh failure — so the deliberate `500` from `/api/auth/logout` (and
`/api/auth/logout-all`) was discarded and the user saw a logged-out app while
their refresh token was still live on every other device. The client now checks
`res.ok`, the server returns `200 { revoked, code }` instead of a 500 that
contradicts the cookies it just cleared, and a partial revoke raises a warning
on `/login`.

### Proxy was default-allow with a prefix bypass (2026-09-28)

The sole page-level gate checked only for the PRESENCE of a `refreshToken`
cookie, and `publicPaths.some(p => pathname.startsWith(p))` made `/api-docs`,
`/apifoo` and `/login-x` public. The session JWT is now verified with
`jwtVerify(..., { algorithms: ["HS256"] })` (failing closed) and public paths
match exactly or on a segment boundary.

### Recurring materialization only ran at login (2026-09-28)

It ran solely inside OTP verify, so a user with a live 30-day refresh session
never got recurring transactions until they fully re-authenticated, and a rule
created via `POST /api/recurring` whose `firstRunDate()` was already due sat
idle. It now also runs from `GET /api/reports/dashboard`, throttled to once per
60s per user via the existing `RateLimit` collection and reusing the atomic
claim so it stays idempotent.

### Two complete API surfaces had no UI (2026-09-28) — **built, not deferred**

`/api/recurring` (CRUD) and `/api/reports/export` (CSV) were tested and
documented as features but had ZERO `src/` callers, so the 12-run catch-up
engine was unreachable from the product. Decision: **build minimal UIs** rather
than leave dead endpoints documented as features.
`src/components/RecurringManager.js` (list / create / pause / delete) and an
"Export CSV" button were added to the existing Reports page, so no new
navigation entry was needed. Larger/richer recurring scheduling UI is still
open (see New Features).

### Other 2026-09-28 fixes

- Literal `null` JSON bodies returned 500 instead of 400 on
  `PUT /api/user`, `PUT /api/transactions/[id]`, `PATCH /api/recurring/[id]`
  and `POST /api/reports/generate`.
- `advanceRuleDate` mixed UTC and LOCAL setters, so on a server west of UTC the
  run instant resolved to the previous day-of-month — permanently, because the
  drifted value was written back as the new `nextRunAt`. Now UTC-only, with a
  TZ-parameterized test that runs the real module source under
  `America/Los_Angeles`, `Asia/Kolkata`, `Pacific/Kiritimati` and `UTC`.
- `console.error("OTP Send Error:", error)` logged the whole Brevo/Axios error,
  whose `config.data` holds the serialized `SendSmtpEmail` with the live
  6-digit code in both `htmlContent` and `textContent`. Now logs
  `error.message` + a request id; the same treatment was applied to
  `otp/verify` and `lib/mongodb.js` (whose errors can echo the Atlas URI).
- a11y: `EditTransactionModal`, the entire transactions filter bar and the
  add-category form had unpaired `<label>`s; `MobileDrawer` never called
  `useDialogA11y`, so the primary mobile navigation had no dialog semantics,
  focus handling, scroll lock or Escape support.
- `refetchCurrentPage()` ended in `.catch(console.error)`, so a failed refresh
  after a successful save showed no banner and the user kept looking at the
  pre-edit list.
- `scripts/migrate-legacy-dates.mjs` loaded the entire collection into memory
  and issued one `updateOne` per document; it now streams with a cursor and
  writes `bulkWrite` batches of 500.
- `next.config.mjs` still claimed the CSP was "intentionally omitted" and
  pointed at a `docs/audit.md` entry that said "Open items: none".

---

## 🟢 Improvements (pre-existing backlog)

### Enable MongoDB Atlas backups (2026-08-22)

Incident postmortem: 9 user documents were deleted from `test.users` externally, orphaning 97 transactions (relinked 2026-09-22; backup `.backup-orphan-txs-*.json`, gitignored). **Recurrence 2026-09-21:** user `sukhjotsingh441@gmail.com` doc (`6a891e96…`) deleted externally again; OTP login created fresh doc (`6ab14ee0…`) today, orphaning 25 transactions — relinked `6a891e96…` → `6ab14ee0…`, backup `.backup-orphan-txs-2026-09-21T15-41-04.json`. Same root cause (direct Atlas write access / no snapshots). Atlas M0 has no automatic snapshots — upgrade to M10 for continuous backup, or schedule periodic `mongodump`s. Also limit who has direct write access to the cluster via the Atlas UI.

### Migrate legacy transaction dates (implemented 2026-09-26)

One-off script `scripts/migrate-legacy-dates.mjs` (dry-run by default, `--apply` to write): shifts every UTC-midnight transaction +12h. Run with `MONGODB_URI` set when ready.

### Backfill integer minor units (implemented 2026-09-28)

One-off script `scripts/migrate-amount-minor.mjs` (dry-run by default, `--apply` to write). See `docs/to-do.md`.

---

## 🟡 New Features

### CSV/PDF export

CSV export implemented 2026-09-26 (`GET /api/reports/export` with start/end/type filters, formula-injection guard, 10k cap) and given a UI on the Reports page 2026-09-28. PDF variant still open — the data is already aggregated server-side, so the same route pattern applies.

### Recurring transactions (implemented 2026-09-26, UI added 2026-09-28)

Monthly/weekly rules (`Recurring` model + `/api/recurring` CRUD) auto-materialize on login **and** on a throttled dashboard load (12-run catch-up cap) — no cron needed. A minimal management UI (`src/components/RecurringManager.js`, on the Reports page) landed 2026-09-28. Still open if wanted: end-of-month / last-day rules (dayOfMonth is currently capped at 28), editing the schedule in place (currently delete + recreate), and a per-rule history view.

### Dark Fintech UI Overhaul (Completed 2026-09-11)

Replaced the generic light gray/slate template ("AI slop") with an ultra-sleek, modern fintech dark theme inspired by Linear and Copilot Money. Includes deep obsidian surfaces (`bg-zinc-950`), glowing emerald/teal accent hierarchy, glassmorphism, tabular numerals, refined segmented controls, quick date presets in reports, and streamlined modal dialogues. All 195 automated tests preserved green. *(Completed — kept here for history only.)*

### iOS Native App Container via Capacitor (Completed 2026-09-11)

Packaged FinTrack as a native iOS app using Capacitor 8 with Swift Package Manager and Xcode 26. Configured to load the production Vercel deployment (`https://fintrack.vistaenvision.com`) with local testing override support (`CAPACITOR_SERVER_URL`), dark theme status bar, full-bleed viewport (`viewportFit: cover`), and Dynamic Island / notch safe-area handling (`pt-safe`/`pb-safe`). *(Completed — kept here for history only.)*

