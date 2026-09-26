# FinTrack — Audit Status

> **Open items: none.**
>
> Both audit cycles (2026-08-22) are fully closed — every finding was fixed,
> covered by tests (`npm test` → 223/223 via `test/run-all.test.js`), and
> committed. Full fix history lives in git log; details in
> `docs/architecture.md` and `docs/suggestions.md`.

---

## Standing verification

- `npm run lint` — 0 problems · `npm run build` — clean · `npm test` — 223/223
- Production smoke matrix (anon/authed × `/`, `/login`, `/welcome`, `/dashboard`, `/api/*`) verified in cycle 1
- CSP nonce present on all page HTML tags in production output

## 2026-09-26 audit — build without env vars (fixed same day)

`npm run build` on a machine with no env vars configured crashed during page
collection: `src/lib/auth.js` threw "Missing JWT secret environment variables"
at import time, and `src/lib/mongodb.js` threw on missing `MONGODB_URI` at
import time. Fixed by reading secrets/URI lazily (per call, inside
`getAccessSecret()` / `getRefreshSecret()` / `dbConnect()`); the same clear
errors are still thrown when an auth/DB operation actually runs without env.
Verified: `npm run lint` clean, `npm run build` green with no env, `npm test`
223/223 (two consecutive green runs; one earlier single-test timing flake near
the 15s testTimeout did not recur).

## Known-intentional behaviors (not defects)

- Login page uses raw `fetch()` (not `api()`) so a failed refresh can't loop on `/login`.
- Mongoose validation message on transaction create is client-visible by design.
- Legacy plaintext refresh tokens keep working until natural expiry, then convert to hashes.
- Users who skipped onboarding before the `onboarded` flag existed see `/welcome` exactly once more.

## Open backlog (tracked elsewhere)

Feature requests and ops tasks live in `docs/suggestions.md`
(deploy pending commits, Atlas backups, legacy date migration, CSV export,
recurring transactions, dark mode).
