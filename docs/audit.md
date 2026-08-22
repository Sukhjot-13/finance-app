# FinTrack — Audit Status

> Audit performed 2026-08-21 · All findings (4 high, 7 medium, 9 low) fixed across commits **a1–a8**, verified with `next build` + ESLint after each commit. Details live in git history.
> This file tracks only what remains open.

---

## Open items

### 1. Refresh-token rotation & reuse detection *(deliberately deferred)*
Refresh tokens are long-lived (30d) and reused until expiry. Rotation would invalidate the token after each `/api/auth/refresh`, but simultaneous refreshes from multiple tabs would 401-race each other into forced logouts. Implement together with a short grace window or single-flight coordination across tabs.

### 2. Hash refresh tokens at rest
Tokens are stored as plaintext JWTs in `refreshTokens[]`; a database leak exposes live sessions for up to 30 days. Store SHA-256 hashes instead (touches login, refresh, logout, and `verifySession` consistently).

### 3. Content-Security-Policy
Baseline security headers shipped in a8, but a strict CSP needs tuning around Chart.js/Framer Motion inline styles before it can be enforced without breaking the UI.

### 4. In-memory rate limiting is per-instance
OTP send/verify limits live in module-level Maps: they reset on restart and don't share state across serverless instances. Swap to Redis (or similar) before scaling beyond a single instance.

### 5. Automated tests
No test suite exists. Highest-value first targets: OTP send/verify flow (mock Brevo), ownership scoping on `[id]` routes, month-boundary behavior of reports/budget-progress.

### 6. Server-side pagination UI
`GET /api/transactions` still returns every transaction and filtering happens client-side. Fine at current scale; add pagination when data grows (tracked in suggestions.md).

---

## Notes
- Login page intentionally uses raw `fetch()` (not the `api()` wrapper): on that page a failed refresh redirecting to `/login` would loop.
- The mongoose validation message on transaction create remains client-visible on purpose (input feedback, not internal detail).
