# Suggestions & Ideas

> Auto-populated by Claude whenever an idea, improvement, vulnerability, or new feature suggestion comes up. Completed items are removed once done (full history in git log).

---

## 🟢 Improvements

### Enable MongoDB Atlas backups (2026-08-22)

Incident postmortem: 9 user documents were deleted from `test.users` externally, orphaning 97 transactions (relinked 2026-08-22; backup `.backup-orphan-txs-*.json`, gitignored). **Recurrence 2026-09-21:** user `sukhjotsingh441@gmail.com` doc (`6a891e96…`) deleted externally again; OTP login created fresh doc (`6ab14ee0…`) today, orphaning 25 transactions — relinked `6a891e96…` → `6ab14ee0…`, backup `.backup-orphan-txs-2026-09-21T15-41-04.json`. Same root cause (direct Atlas write access / no snapshots). Atlas M0 has no automatic snapshots — upgrade to M10 for continuous backup, or schedule periodic `mongodump`s. Also limit who has direct write access to the cluster via the Atlas UI.

### Migrate legacy transaction dates (stored at UTC midnight)

Transactions created before the date fix were stored at `YYYY-MM-DDT00:00:00.000Z` (UTC midnight) and render as the previous day for users west of UTC. One-off migration: add 12 hours to every transaction whose `getUTCHours() === 0 && getUTCMinutes() === 0`. (2026-08-04)

### Full-project audit fixes (2026-09-21 — logged, not yet implemented)

Audit (196 tests green, lint clean, build clean) found no auth-bypass or IDOR, but real items: (1) Profile page initializes form to `""`/`"USD"` not from context — a failed `/api/user` fetch + Save silently overwrites the account name (`profile/page.js:11-38`). (2) Transactions `refetchCurrentPage` never clamps `page`, so shrinking result sets strand users on empty pages that look like data loss (`transactions/page.js:482-486`). (3) Transaction PUT silently drops invalid amount/category/date with 200 instead of 400, and non-string description throws 500 (`transactions/[id]/route.js:68-79`). (4) Budget DELETE ignores its result and matches untrimmed category, reporting success when nothing was deleted (`budgets/route.js:93-120`). (5) Month windowing mixes server-TZ default month with client `start`/`end` instants around month boundaries (`budgets/route.js:16`, `budget-progress/route.js:30-38`). (6) Category rename/delete cascades are non-atomic with incomplete rollback (`categories/[id]/route.js:87-212`).

---

## 🔴 Vulnerabilities

### Auth hardening gaps (2026-09-21 — logged, not yet fixed)

(1) IP rate-limiting trusts client-supplied `x-forwarded-for`/`x-real-ip` with no verification, so per-IP OTP buckets are bypassable (`otp/send/route.js:21-25`, `otp/verify/route.js:24-28`). (2) Rate limiter fails open on DB outage — limits vanish exactly during incidents (`rate-limit.js:19-63`). (3) `verifySession` accepts rotated refresh tokens indefinitely (never checks `rotatedAt`; purge only runs on login/refresh), stretching the intended 5-min grace window (`auth.js:85-133`). (4) Logout returns success even when the DB write failed, so the session can survive a "logout" on shared devices (`logout/route.js:33-40`). (5) No guard against `ACCESS/REFRESH_TOKEN_SECRET` reuse or weak secrets (`auth.js:19-23`).

---

## 🟡 New Features

### CSV/PDF export

Export transactions or reports as CSV. Relatively straightforward since the data is already aggregated.

### Recurring transactions

Monthly bills/subscriptions that auto-create transactions. More complex — would need a cron job or check-on-login pattern.

### Dark Fintech UI Overhaul (Completed 2026-09-11)

Replaced the generic light gray/slate template ("AI slop") with an ultra-sleek, modern fintech dark theme inspired by Linear and Copilot Money. Includes deep obsidian surfaces (`bg-zinc-950`), glowing emerald/teal accent hierarchy, glassmorphism, tabular numerals, refined segmented controls, quick date presets in reports, and streamlined modal dialogues. All 195 automated tests preserved green.

### iOS Native App Container via Capacitor (Completed 2026-09-11)

Packaged FinTrack as a native iOS app using Capacitor 8 with Swift Package Manager and Xcode 26. Configured to load the production Vercel deployment (`https://fintrack.vistaenvision.com`) with local testing override support (`CAPACITOR_SERVER_URL`), dark theme status bar, full-bleed viewport (`viewportFit: cover`), and Dynamic Island / notch safe-area handling (`pt-safe`/`pb-safe`).
