#!/usr/bin/env node
// One-off migration: legacy transactions stored at UTC midnight
// (YYYY-MM-DDT00:00:00.000Z) render as the previous day west of UTC.
// Shifts them +12 hours (noon UTC) so the calendar date is stable worldwide.
//
// Usage:
//   MONGODB_URI="..." node scripts/migrate-legacy-dates.mjs        # dry run
//   MONGODB_URI="..." node scripts/migrate-legacy-dates.mjs --apply # write
//
// Matches exactly what docs/suggestions.md describes: getUTCHours() === 0 &&
// getUTCMinutes() === 0. Genuine midnight transactions are indistinguishable
// and move too — accepted (midnight-to-the-minute spending is noise).
//
// The filter lives in the QUERY (not in a JS pass over a full `.find({})`
// load) and writes go out as batched bulkWrite calls, so this is bounded in
// both memory and round trips on a real cluster.
import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");
const BATCH_SIZE = 500;
const SHIFT_MS = 12 * 60 * 60 * 1000;

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
  mongoose.models._MigrationTransaction ||
  mongoose.model("_MigrationTransaction", transactionSchema);

// Midnight-in-UTC, expressed as a range query so MongoDB can use the
// {userId, date} index instead of the driver pulling every document.
const START_OF_DAY = new Date("1970-01-01T00:00:00.000Z");
const LEGACY = {
  date: { $gte: START_OF_DAY, $lt: new Date("2100-01-01T00:00:00.000Z") },
};

const isUtcMidnight = (date) => {
  const d = new Date(date);
  return (
    !isNaN(d.getTime()) &&
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
};

await mongoose.connect(uri);
try {
  const total = await Transaction.countDocuments(LEGACY);
  console.log(`Scanning ${total} dated transactions for UTC-midnight rows.`);

  let scanned = 0;
  let legacy = 0;
  let modified = 0;
  let batch = [];

  const flush = async (ops) => {
    if (ops.length === 0) return;
    const res = await Transaction.bulkWrite(ops, { ordered: false });
    modified += res.modifiedCount || 0;
    batch = [];
  };

  const cursor = Transaction.find(LEGACY)
    .select("_id date")
    .lean()
    .cursor();

  for await (const tx of cursor) {
    scanned += 1;
    if (!isUtcMidnight(tx.date)) continue;
    legacy += 1;
    if (legacy <= 10) {
      console.log(`  sample: ${tx._id} ${new Date(tx.date).toISOString()}`);
    }
    if (!APPLY) continue;
    batch.push({
      updateOne: {
        filter: { _id: tx._id },
        update: { $set: { date: new Date(new Date(tx.date).getTime() + SHIFT_MS) } },
      },
    });
    if (batch.length >= BATCH_SIZE) {
      await flush(batch);
      console.log(`  ...${scanned}/${total} scanned`);
    }
  }
  await flush(batch);

  console.log(`Scanned ${scanned}; ${legacy} at UTC midnight.`);
  if (legacy > 10) console.log(`  ...and ${legacy - 10} more`);
  if (!APPLY) {
    console.log("Dry run — re-run with --apply to write.");
  } else {
    console.log(`Shifted ${modified}/${legacy} transactions +12h.`);
  }
} finally {
  await mongoose.disconnect();
}
