# To-Do — Finance App

Session handoff list. Ordered by urgency. Last updated **2026-09-28**.

## Data migrations — run once, in this order (blocking for money correctness)

- [ ] `MONGODB_URI="..." node scripts/migrate-amount-minor.mjs` (dry run)
- [ ] `MONGODB_URI="..." node scripts/migrate-amount-minor.mjs --apply`
      Backfills integer `amountMinor` on every transaction and rounds `amount`
      to 2dp. Idempotent (only touches rows where `amountMinor` is missing).
      Reports already fall back to `round(amount * 100)`, so this is
      correctness-hardening rather than a blocker, but run it.
- [ ] `MONGODB_URI="..." node scripts/migrate-legacy-dates.mjs --apply`
      Shifts UTC-midnight transactions +12h so calendar dates are stable
      worldwide. Run **after** the amount-minor migration (or before — they
      touch disjoint fields).
- [ ] Deploy, then re-run both migrations to confirm idempotency (second run
      must report 0 pending).

## Verify in production after deploy

- [ ] Confirm the new unique sparse index exists:
      `db.transactions.getIndexes()` should include
      `{ recurringRuleId: 1, scheduledFor: 1 }` with `unique: true, sparse: true`.
- [ ] Confirm no transaction has a non-finite or non-positive `amount`
      (`db.transactions.find({ amount: { $not: { $gt: 0 } } })` should be empty).
- [ ] Confirm the proxy still lets authenticated users through
      (`REFRESH_TOKEN_SECRET` must be present in the **build** environment —
      the proxy fails closed without it).

## Ops

- [ ] Atlas backups (see `docs/suggestions.md` — M0 has no snapshots and the
      cluster has already lost user documents twice).

## Product (deliberately deferred)

- [ ] PDF export variant (CSV is done and now reachable from the Reports page).
- [ ] Per-transaction currency conversion / FX (today `currency` is recorded
      per transaction and reports assume a single currency per user).
