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
import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is required.");
  process.exit(1);
}

const transactionSchema = new mongoose.Schema({}, { strict: false, collection: "transactions" });
const Transaction = mongoose.models._MigrationTransaction ||
  mongoose.model("_MigrationTransaction", transactionSchema);

await mongoose.connect(uri);
try {
  const candidates = await Transaction.find({}).select("_id date").lean();
  const legacy = candidates.filter((tx) => {
    const d = tx.date ? new Date(tx.date) : null;
    return d && !isNaN(d.getTime()) && d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
  });

  console.log(`Scanned ${candidates.length} transactions; ${legacy.length} at UTC midnight.`);
  for (const tx of legacy.slice(0, 10)) {
    console.log(`  sample: ${tx._id} ${new Date(tx.date).toISOString()}`);
  }
  if (legacy.length > 10) console.log(`  ...and ${legacy.length - 10} more`);

  if (!APPLY) {
    console.log("Dry run — re-run with --apply to write.");
  } else {
    let modified = 0;
    for (const tx of legacy) {
      const shifted = new Date(new Date(tx.date).getTime() + 12 * 60 * 60 * 1000);
      const res = await Transaction.updateOne({ _id: tx._id }, { $set: { date: shifted } });
      modified += res.modifiedCount || 0;
    }
    console.log(`Shifted ${modified}/${legacy.length} transactions +12h.`);
  }
} finally {
  await mongoose.disconnect();
}
