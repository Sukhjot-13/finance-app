# FinTrack — Audit Status

> Audit performed 2026-08-21 · Remediation completed same day across commits **a1–a8**.
> Every finding from the original audit (4 high, 7 medium, 9 low) has been fixed and verified with `next build` + ESLint after each commit. This file now tracks only what remains open.

---

## ✅ Fixed (summary by commit)

| Commit | What was fixed |
|--------|----------------|
| `a1` | 🔴 OTP used `Math.random()` → now `crypto.randomInt`. 🔴 No verify rate limit → 5-failure/15-min lockout per email. Uniform failure messages (no account enumeration). Email normalization (lowercase storage + legacy fallback). |
| `a2` | 🟠 Linting fully restored: native flat config for eslint-config-next v16, `"lint": "eslint ."`. |
| `a3` | 🟠 Drawer submit button properly associated with its form (native validation works). 🟠 Encoded category in budget delete URL. 🟠 Report default dates use local-time helpers. Edit PUT sends only editable fields. |
| `a4` | 🔴 All data routes unified on `verifySession()` — logout-all now revokes everywhere. 🟠 Internal error messages no longer returned to clients. `accountName` length/type validated. |
| `a5` | 🔴 Expired refresh tokens are purged on login and refresh (TTL-on-subdocument never worked; array growth bounded). `nanoid` dependency removed (`crypto.randomUUID()`). Refresh distinguishes bad-token vs DB-error (transient errors keep cookies). logout-all reports real failures instead of fake success. Verbose refresh logging trimmed. |
| `a6` | 🟠 Month windows computed in the browser's timezone and sent to dashboard / budget-progress / report endpoints (server falls back to old behavior if absent). |
| `a7` | 🟡 All remaining `alert()`/`window.confirm()` replaced with inline banners/two-step confirms. All clients use the auto-refreshing `api()` wrapper with `res.ok` checks. Category delete reassigns to "Other". Type toggle added to edit modal. Proxy serves static assets to anonymous visitors. Unused `ChartWrapper` deleted. |
| `a8` | Error boundaries for root + main segments. Security headers (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, HSTS). Transaction compound indexes actually created via `.index()`. Dead imports removed. |

---

## 🔴 Remaining open items

### 1. Refresh-token rotation & reuse detection *(deliberately deferred)*
Refresh tokens are long-lived (30d) and reused until expiry. Rotation would invalidate the token after each `/api/auth/refresh`, but simultaneous refreshes from multiple tabs would 401-race each other into forced logouts. Implement together with a short grace window or single-flight coordination across tabs.

### 2. Hash refresh tokens at rest
Tokens are stored as plaintext JWTs in `refreshTokens[]`; a database leak exposes live sessions for up to 30 days. Store SHA-256 hashes instead (touches login, refresh, logout, and `verifySession` consistently).

### 3. Content-Security-Policy
Baseline headers shipped in a8, but a strict CSP needs tuning around Chart.js/Framer Motion inline styles before it can be enforced without breaking the UI.

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
