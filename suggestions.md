# Suggestions & Ideas

> Auto-populated by Claude whenever an idea, improvement, vulnerability, or new feature suggestion comes up.

---

## 🟢 Improvements

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
