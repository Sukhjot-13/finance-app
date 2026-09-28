#!/usr/bin/env node
// One-off migration: backfill INTEGER minor units on transactions and round
// the legacy float `amount` to 2 decimal places.
//
// Why: money was stored as BSON doubles with no rounding, so
// `income - expenses` produced values like 1234.5600000000002. Reports now sum
// `amountMinor` (see src/lib/money.js) and convert to a decimal exactly once.
//
// IDEMPOTENT: the filter only selects documents whose `amountMinor` is missing
// or null, so re-running is a no-op. Pass `--apply` to write (dry-run by
// default).
//
// Usage:
//   MONGODB_URI="..." node scripts/migrate-amount-minor.mjs        # dry run
//   MONGODB_URI="..." node scripts/migrate-amount-minor.mjs --apply # write
//
// CURRENCY: every supported currency (USD, INR) uses 2 decimal places, so
// minor units are always amount * 100.
import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");
const BATCH_SIZE = 500;
const MINOR_UNITS = 100;

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is required.");
  process.exit(1);
}

const transactionSchema = new mongoose.Schema(
  {},
  { strict: false, collection: "transactions", versionKey: false }
);
const Transaction =
  mongoose.models._MigrationAmountMinor ||
  mongoose.model("_MigrationAmountMinor", transactionSchema);

// Documents already migrated (or that were never numeric) are excluded here,
// which is what makes the script safe to re-run.
const PENDING = {
  $or: [{ amountMinor: { $exists: false } }, { amountMinor: null }],
};

const minorOf = (amount) => {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * MINOR_UNITS);
};

await mongoose.connect(uri);
try {
  await Transaction.createIndexes();

  const total = await Transaction.countDocuments(PENDING);
  console.log(`${total} transaction(s) need amountMinor backfilled.`);

  let scanned = 0;
  let modified = 0;
  let skipped = 0;
  let batch = [];

  const flush = async (ops) => {
    if (ops.length === 0) return;
    // One round trip per batch of BATCH_SIZE instead of one per document.
    const res = await Transaction.bulkWrite(ops, { ordered: false });
    modified += res.modifiedCount || 0;
  };

  // Cursor + projection: never loads the whole collection into memory.
  const cursor = Transaction.find(PENDING)
    .select("_id amount")
    .lean()
    .cursor();

  for await (const tx of cursor) {
    scanned += 1;
    const amountMinor = minorOf(tx.amount);
    if (amountMinor === null) {
      skipped += 1;
      continue;
    }
    if (!APPLY) {
      if (scanned <= 10) {
        console.log(`  sample: ${tx._id} ${tx.amount} → ${amountMinor} minor`);
      }
      continue;
    }
    batch.push({
      updateOne: {
        filter: { _id: tx._id },
        update: {
          $set: {
            amountMinor,
            // Round the stored float too, so `amount` and `amountMinor` can
            // never disagree.
            amount: amountMinor / MINOR_UNITS,
          },
        },
      },
    });
    if (batch.length >= BATCH_SIZE) {
      await flush(batch);
      batch = [];
      console.log(`  ...${scanned}/${total} scanned`);
    }
  }
  await flush(batch);

  if (!APPLY) {
    console.log(
      `Dry run — scanned ${scanned}, ${skipped} non-numeric skipped. Re-run with --apply to write.`
    );
  } else {
    console.log(
      `Backfilled amountMinor on ${modified}/${scanned} transaction(s); ${skipped} non-numeric skipped.`
    );
  }
} finally {
  await mongoose.disconnect();
}
