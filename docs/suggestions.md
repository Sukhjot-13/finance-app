# Suggestions & Ideas

> Auto-populated by Claude whenever an idea, improvement, vulnerability, or new feature suggestion comes up.

---

## 🟢 Improvements

### Fix broken `/welcome` onboarding bounce (2026-08-22)
Full re-audit (see `docs/audit.md` H1): the proxy redirects any logged-in request from `/welcome` → `/dashboard`, so brand-new users (who have cookies right after OTP verify) never see the account-name screen. Verified live: 307 redirect. Remove `/welcome` from the proxy bounce list or prompt inline on first dashboard visit.

### Add month-end bounds to dashboard/budget-progress aggregations (2026-08-22)
Audit H2: `$gte: startOfMonth` has no `$lt` end bound, so future-dated transactions inflate "This Month" stats and budget bars until their date arrives. Client already sends `start`; send `end` too.

### Deploy the audit fixes (a1–a8) — email normalization is critical (2026-08-22)
The lowercase-email normalization (`findUserByEmail` in both OTP routes) that prevents duplicate accounts from case-variant logins exists in local commits a1–a8 but is **not pushed/deployed** — prod still auto-creates a fresh account whenever the email is typed differently. Push and deploy to activate.

### Enable MongoDB Atlas backups (2026-08-22)
Incident postmortem: 9 user documents were deleted from `test.users` externally (the app has no delete-user code), orphaning 97 transactions. They were relinked to `sukhjotsingh441@gmail.com` on 2026-08-22 (backup: `.backup-orphan-txs-*.json`, gitignored). Atlas M0 has no automatic snapshots — upgrade to M10 for continuous backup, or schedule periodic `mongodump`s, so future accidental deletions are recoverable. Also consider limiting who has direct write access to the cluster via Atlas UI.

### Invalid `indexes` option in Transaction schema (2026-08-05)
`src/models/transaction.model.js` passes `indexes: [...]` inside the schema options object — that is not a valid Mongoose option, so the two compound indexes (`{userId, date}`, `{userId, type, date}`) are **never created**. Should be converted to `TransactionSchema.index(...)` calls (the pattern used in `budget.model.js` and `category.model.js`). Single-field `index: true` on `userId` works fine. Worth fixing for query performance as data grows.
✅ **Done** (2026-08-22, commit a8) — converted to `.index()` calls.

### Toast notifications instead of `alert()`
Several places use `alert()` and `window.confirm()` (profile save, transaction delete, edit errors). A small toast component would feel much more polished.

### Loading skeleton for transactions page
Dashboard has a nice skeleton but transactions page just shows "Loading transactions..." text. Easy consistency fix.
✅ **Done** — transactions page now has an animated skeleton matching the card layout.

---

## 🟡 New Features

### Pagination on transactions
Transactions page loads everything into one table. If data grows to hundreds of transactions it'll get slow. Adding server-side pagination with page controls would keep it snappy.

### CSV/PDF export
Export transactions or reports as CSV. Relatively straightforward since the data is already aggregated.

### Recurring transactions
Monthly bills/subscriptions that auto-create transactions. More complex — would need a cron job or check-on-login pattern.

### Dark mode
UI is all Tailwind's default slate colors. Adding a dark mode toggle with Tailwind v4's `@dark` variant would give it a modern feel.

---

## 🔴 Vulnerabilities

### Rate limiting on OTP verify endpoint
The `/send` endpoint has in-memory rate limiting but `/verify` doesn't. A user could brute-force OTPs.

### Error boundaries
Wrapping page-level components with React error boundaries so a crash doesn't white-screen the app.

### Logout confirmation as a modal
Profile dropdown logout fires immediately with no confirmation. A small "Are you sure?" dialog would prevent accidental logouts.

### Migrate legacy transaction dates (stored at UTC midnight)
Existing transactions created before the date fix were stored at `YYYY-MM-DDT00:00:00.000Z` (UTC midnight). They'll still render as the previous day for users west of UTC. A one-off migration script (`node -e` or a script run against MongoDB) that adds 12 hours to every transaction whose `getUTCHours() === 0 && getUTCMinutes() === 0` would normalize them to noon and fix their display date without changing any user's calendar date. (2026-08-04)
