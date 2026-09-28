# FinTrack — Audit Status

> **Latest audit: 2026-09-28 (security + correctness + UI pass).**
>
> All findings from that pass are FIXED and covered by tests
> (`npm test` → 325/325 via `test/run-all.test.js`), lint-clean and
> build-clean. Remaining backlog is tracked in `docs/suggestions.md` and
> `docs/to-do.md`. Full fix history lives in git log; details in
> `docs/architecture.md`.

---

## Standing verification

- `npm run lint` — 0 problems
- `npm test` — 325/325 (`test/run-all.test.js`)
- `npm run build` — succeeds with no env vars configured
- `TZ=America/Los_Angeles npm test` — 325/325 · `TZ=Asia/Kolkata npm test` — 325/325 · `TZ=Pacific/Kiritimati npm test` — 325/325
  (the recurring date engine is UTC-only and its suite is TZ-parameterized, so the whole suite is timezone-independent)
- Production smoke matrix (anon/authed × `/`, `/login`, `/welcome`, `/dashboard`, `/api/*`) verified in cycle 1
- CSP nonce present on all page HTML tags in production output

## 2026-09-28 audit — security + correctness + UI (all fixed)

| # | Area | Fix |
|---|------|-----|
| 1 | Recurring double-materialization | Atomic `findOneAndUpdate` claim guarded on the exact `nextRunAt` + unique sparse `(recurringRuleId, scheduledFor)` index; E11000 treated as "already materialized" |
| 2 | `"Infinity"` amount poisoning every aggregate | `Number.isFinite` (+1e12 cap) on every numeric route; finiteness enforced again at the model layer |
| 3 | Swallowed logout failures | `res.ok` is now checked; server returns `200 { revoked, code }` instead of a contradictory `500`; partial-revoke warning is surfaced on `/login` |
| 4 | Default-allow proxy + `/api` prefix bypass | Session JWT is verified with `jwtVerify(..., { algorithms: ["HS256"] })`, failing closed; public paths match exactly or on a segment boundary |
| 5 | Prototype pollution via category names | `Object.create(null)` accumulators, `Object.hasOwn` lookups, reserved names rejected in `POST`/`PUT /api/categories` |
| 6 | CSV injection via bare CR | CR/LF collapsed to spaces before both the formula guard and the quoting decision |
| 7 | Spoofable `x-real-ip` rate-limit bucket | `x-real-ip` preference deleted; `request.ip` then the LAST `x-forwarded-for` entry |
| 8 | Recurring only ran at login; dead API surfaces | Materialization also runs from `GET /api/reports/dashboard` (throttled to 60s per user); UIs added for recurring rules and CSV export |
| 9 | Money stored as floats | `amountMinor` integer minor units + per-transaction `currency`; every report sum is integer arithmetic; `scripts/migrate-amount-minor.mjs` backfills |
| 10 | Literal `null` JSON body → 500 | 400 guard after `req.json()` on user, transactions/[id], recurring/[id], reports/generate (and categories) |
| 11 | Recurring TZ drift | `advanceRuleDate` uses `setUTCDate`/`setUTCMonth`; suite is TZ-parameterized and green under LA/Kolkata/Kiritimati |
| 12 | OTP leaked into logs | Brevo/verify/Mongo failures log `error.message` + a request id only, never the raw object |
| 13 | UI a11y + silent refresh failure | Label/input pairing in `EditTransactionModal`, the filter bar and the category form; `MobileDrawer` wired to `useDialogA11y`; failed post-save refetch raises a banner |
| 14 | Docs contradicted the code | Counts refreshed, stale CSP comment removed, findings filed in `docs/suggestions.md`, both migrations batched |

## 2026-09-26 audit — build without env vars (fixed same day)

`npm run build` on a machine with no env vars configured crashed during page
collection: `src/lib/auth.js` threw "Missing JWT secret environment variables"
at import time, and `src/lib/mongodb.js` threw on missing `MONGODB_URI` at
import time. Fixed by reading secrets/URI lazily (per call, inside
`getAccessSecret()` / `getRefreshSecret()` / `dbConnect()`); the same clear
errors are still thrown when an auth/DB operation actually runs without env.

## Known-intentional behaviors (not defects)

- Login page uses raw `fetch()` (not `api()`) so a failed refresh can't loop on `/login`.
- Mongoose validation message on transaction create is client-visible by design.
- Legacy plaintext refresh tokens keep working until natural expiry, then convert to hashes.
- Users who skipped onboarding before the `onboarded` flag existed see `/welcome` exactly once more.
- The proxy verifies the refresh-cookie SIGNATURE only; DB-backed revocation stays in `verifySession()` on every API route (defence in depth, no duplicated store read on the page path).
- The recurring materialization throttle is best-effort: losing the race just runs an extra pass, and the pass is idempotent.
- Money is assumed to be 2-decimal for every supported currency (USD and INR). `amount` is kept for backward compatibility with pre-migration rows; reports read `amountMinor` and fall back to a rounded conversion of `amount`.

## Open backlog (tracked elsewhere)

Feature requests and ops tasks live in `docs/suggestions.md`; the session
handoff list lives in `docs/to-do.md` (Atlas backups, the two one-off data
migrations).
