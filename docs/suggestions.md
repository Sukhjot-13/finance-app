# Suggestions & Ideas

> Auto-populated by Claude whenever an idea, improvement, vulnerability, or new feature suggestion comes up. Completed items are removed once done (full history in git log).

---

## 🟢 Improvements

### Enable MongoDB Atlas backups (2026-08-22)

Incident postmortem: 9 user documents were deleted from `test.users` externally, orphaning 97 transactions (relinked 2026-08-22; backup `.backup-orphan-txs-*.json`, gitignored). **Recurrence 2026-09-21:** user `sukhjotsingh441@gmail.com` doc (`6a891e96…`) deleted externally again; OTP login created fresh doc (`6ab14ee0…`) today, orphaning 25 transactions — relinked `6a891e96…` → `6ab14ee0…`, backup `.backup-orphan-txs-2026-09-21T15-41-04.json`. Same root cause (direct Atlas write access / no snapshots). Atlas M0 has no automatic snapshots — upgrade to M10 for continuous backup, or schedule periodic `mongodump`s. Also limit who has direct write access to the cluster via the Atlas UI.

### Migrate legacy transaction dates (implemented 2026-09-26)

One-off script `scripts/migrate-legacy-dates.mjs` (dry-run by default, `--apply` to write): shifts every `getUTCHours() === 0 && getUTCMinutes() === 0` transaction +12h. Run with `MONGODB_URI` set when ready.

---

## 🟡 New Features

### CSV/PDF export

CSV export implemented 2026-09-26 (`GET /api/reports/export` with start/end/type filters, formula-injection guard, 10k cap). PDF variant still open. Data already aggregated, same route pattern applies.

### Recurring transactions (implemented 2026-09-26)

Monthly/weekly rules (`Recurring` model + `/api/recurring` CRUD) auto-materialize on login (check-on-login, 12-run catch-up cap) — no cron needed. UI for managing rules is the remaining gap if wanted.

### Dark Fintech UI Overhaul (Completed 2026-09-11)

Replaced the generic light gray/slate template ("AI slop") with an ultra-sleek, modern fintech dark theme inspired by Linear and Copilot Money. Includes deep obsidian surfaces (`bg-zinc-950`), glowing emerald/teal accent hierarchy, glassmorphism, tabular numerals, refined segmented controls, quick date presets in reports, and streamlined modal dialogues. All 195 automated tests preserved green.

### iOS Native App Container via Capacitor (Completed 2026-09-11)

Packaged FinTrack as a native iOS app using Capacitor 8 with Swift Package Manager and Xcode 26. Configured to load the production Vercel deployment (`https://fintrack.vistaenvision.com`) with local testing override support (`CAPACITOR_SERVER_URL`), dark theme status bar, full-bleed viewport (`viewportFit: cover`), and Dynamic Island / notch safe-area handling (`pt-safe`/`pb-safe`).
