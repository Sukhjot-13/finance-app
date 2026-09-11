# Suggestions & Ideas

> Auto-populated by Claude whenever an idea, improvement, vulnerability, or new feature suggestion comes up. Completed items are removed once done (full history in git log).

---

## 🟢 Improvements

### Fixed: users logged out too often (2026-08-22)
Three compounding causes found and fixed:
1. **Dead-end at `/` and `/login` after 15 min idle** — `verifyAuth()` on the root page only checked the 15-minute access cookie, and LoginPage's session check used a raw fetch that never attempted a refresh → valid 30-day sessions were bounced into full OTP re-logins. Fixed via `SessionGate` (`src/app/session-gate.js`) + refresh-rescue in LoginPage's `checkSession`.
2. **`sameSite: "strict"` cookies** — cookies are withheld on top-level navigations from other sites, so arriving via an email/Slack/Google link looked logged-out and hit the login page. Changed to `"lax"` (cross-site POSTs still cookieless, CSRF posture unchanged).
3. **60s rotation grace + revoke-all-on-reuse** — too tight for multi-tab races and browsers that apply Set-Cookie late (Safari/ITP); false-positive "theft" detection nuked every session. Grace widened to 5 minutes.

### Deploy the pending commits — email normalization is critical (2026-08-22)
~17 local commits (audit fixes + session hardening + test suite) are **not pushed/deployed** — prod still auto-creates a fresh account whenever the email is typed differently (missing lowercase normalization). Push and deploy to activate.

### Enable MongoDB Atlas backups (2026-08-22)
Incident postmortem: 9 user documents were deleted from `test.users` externally, orphaning 97 transactions (relinked 2026-08-22; backup `.backup-orphan-txs-*.json`, gitignored). Atlas M0 has no automatic snapshots — upgrade to M10 for continuous backup, or schedule periodic `mongodump`s. Also limit who has direct write access to the cluster via the Atlas UI.

### Migrate legacy transaction dates (stored at UTC midnight)
Transactions created before the date fix were stored at `YYYY-MM-DDT00:00:00.000Z` (UTC midnight) and render as the previous day for users west of UTC. One-off migration: add 12 hours to every transaction whose `getUTCHours() === 0 && getUTCMinutes() === 0`. (2026-08-04)

---

## 🟡 New Features

### CSV/PDF export
Export transactions or reports as CSV. Relatively straightforward since the data is already aggregated.

### Recurring transactions
Monthly bills/subscriptions that auto-create transactions. More complex — would need a cron job or check-on-login pattern.

### Dark Fintech UI Overhaul (Completed 2026-09-11)
Replaced the generic light gray/slate template ("AI slop") with an ultra-sleek, modern fintech dark theme inspired by Linear and Copilot Money. Includes deep obsidian surfaces (`bg-zinc-950`), glowing emerald/teal accent hierarchy, glassmorphism, tabular numerals, refined segmented controls, quick date presets in reports, and streamlined modal dialogues. All 195 automated tests preserved green.
