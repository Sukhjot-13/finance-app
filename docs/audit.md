# FinTrack — Audit Status

> Full re-audit performed 2026-08-22 (line-by-line review of `src/` + live runtime verification). Every finding from that audit has been **fixed, verified, and committed**. Completed items were removed from this file progressively as they landed.
>
> **Open items: none.**

---

## What was fixed in this cycle (for traceability — details in git history)

| Area | Fixes |
|---|---|
| Onboarding | `/welcome` proxy bounce removed — new-user flow works again (verified via 307-matrix tests) |
| Time windows | Month-end bounds on dashboard/budget-progress so future-dated txns can't pollute stats |
| Session UX | Live `UserContext` (`setUser` shared); transient DB errors never force-logout; `api()` retry-once guarantee (deadlock regression-tested) |
| Token security | Refresh tokens stored SHA-256-hashed at rest; rotation on refresh with 60s multi-tab grace window; reuse-after-grace revokes all sessions |
| Categories | Rename cascades to transactions AND budgets (+ real rename UI); delete cleans budgets; 50-char caps everywhere |
| Budgets | Clearing a field deletes on save; visible save/delete errors; currency-aware warnings |
| Auth endpoints | MongoDB-backed sliding-window rate limiting (per-email + per-IP, shared across instances); timing-equalized OTP verify; OTP-send refunds quota + restores pending OTP on email failure; signup race handled |
| Input hygiene | Server-side validation for dates/currency/ObjectIds (404 not 500); `dbConnect` inside try in every route |
| UI polish | Description column, programmatic pie colors, error states instead of misleading empties, Escape/scroll-lock on overlays, dropdown a11y, sidebar resize fix, resend-OTP cooldown, welcome Skip |
| Infra | Strict CSP enforced via per-request nonce through the Next 16 proxy (+ `force-dynamic` so nonces stamp in prod builds — verified on Turbopack & webpack) |
| Quality | Vitest suite (22 tests incl. api() refresh contract); server-side pagination for transactions; unused deps pruned; ESLint fully clean |

## Verification performed

- `npm run lint` — 0 problems · `npm test` — 22/22 · `npm run build` — clean (Turbopack & webpack)
- Production smoke matrix: anon/authed × `/`, `/login`, `/welcome`, `/dashboard`, `/api/*` — all redirects and statuses correct
- CSP nonce present on all page HTML tags in production output (0 bare inline scripts)

## Notes

- Login page intentionally uses raw `fetch()` (not the `api()` wrapper): a failed refresh redirecting to `/login` would loop there.
- The mongoose validation message on transaction create remains client-visible on purpose (input feedback, not internal detail).
- Legacy plaintext refresh-token entries in existing user documents keep working until natural expiry; they convert to hashes automatically on their next refresh.
