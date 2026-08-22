# Suggestions & Ideas

> Auto-populated by Claude whenever an idea, improvement, vulnerability, or new feature suggestion comes up.

---

## 🟢 Improvements

### Deploy the audit fixes (a1–a8 + session hardening) — email normalization is critical (2026-08-22)
The lowercase-email normalization (`findUserByEmail` in both OTP routes) that prevents duplicate accounts from case-variant logins exists in local commits but is **not pushed/deployed** (branch is ~16 commits ahead of `origin/main`) — prod still auto-creates a fresh account whenever the email is typed differently. Push and deploy to activate.

### Enable MongoDB Atlas backups (2026-08-22)
Incident postmortem: 9 user documents were deleted from `test.users` externally (the app has no delete-user code), orphaning 97 transactions. They were relinked to `sukhjotsingh441@gmail.com` on 2026-08-22 (backup: `.backup-orphan-txs-*.json`, gitignored). Atlas M0 has no automatic snapshots — upgrade to M10 for continuous backup, or schedule periodic `mongodump`s, so future accidental deletions are recoverable. Also consider limiting who has direct write access to the cluster via Atlas UI.

### Migrate legacy transaction dates (stored at UTC midnight)
Existing transactions created before the date fix were stored at `YYYY-MM-DDT00:00:00.000Z` (UTC midnight). They'll still render as the previous day for users west of UTC. A one-off migration script (`node -e` or a script run against MongoDB) that adds 12 hours to every transaction whose `getUTCHours() === 0 && getUTCMinutes() === 0` would normalize them to noon and fix their display date without changing any user's calendar date. (2026-08-04)

---

## 🟡 New Features

### CSV/PDF export
Export transactions or reports as CSV. Relatively straightforward since the data is already aggregated.

### Recurring transactions
Monthly bills/subscriptions that auto-create transactions. More complex — would need a cron job or check-on-login pattern.

### Dark mode
UI is all Tailwind's default slate colors. Adding a dark mode toggle with Tailwind v4's `@dark` variant would give it a modern feel.

---

## ✅ Done (kept for traceability)

### Toast notifications instead of `alert()` — DONE (2026-08-22)
All `alert()`/`window.confirm()` calls removed across the app (profile save, transaction delete, edit errors now use inline banners / confirm-once buttons). A dedicated toast system is unnecessary at current scale.

### Pagination on transactions — DONE (2026-08-22)
Server-side filtered + paginated `/api/transactions` (max 200/page), client Prev/Next controls, debounced search.

### Rate limiting on OTP verify endpoint — DONE (2026-08-22)
MongoDB-backed sliding-window lockout (5 failures / 15 min → uniform 429), shared across instances.

### Error boundaries — DONE (2026-08-22)
Route-segment boundaries at root (`src/app/error.js`) and main app (`src/app/(main)/error.js`) with recoverable "Try again" cards.

### Invalid `indexes` option in Transaction schema — DONE (2026-08-22, commit a8)
Converted to `.index()` calls; compound indexes now actually created.

### Loading skeleton for transactions page — DONE (2026-08-22)
Animated skeleton matching the card layout.

### Fix broken `/welcome` onboarding bounce — DONE (2026-08-22)
Proxy updated; verified anon→/login, authed→200.

### Add month-end bounds to dashboard/budget-progress aggregations — DONE (2026-08-22)
Clients send local `end`; both aggregations use `$gte/$lt`.
