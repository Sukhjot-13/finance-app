# Suggestions & Ideas

> Auto-populated by Claude whenever an idea, improvement, vulnerability, or new feature suggestion comes up. Completed items are removed once done (full history in git log).

---

## 🟢 Improvements

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

### iOS Native App Container via Capacitor (Completed 2026-09-11)

Packaged FinTrack as a native iOS app using Capacitor 8 with Swift Package Manager and Xcode 26. Configured to load the production Vercel deployment (`https://fintrack.vistaenvision.com`) with local testing override support (`CAPACITOR_SERVER_URL`), dark theme status bar, full-bleed viewport (`viewportFit: cover`), and Dynamic Island / notch safe-area handling (`pt-safe`/`pb-safe`).
