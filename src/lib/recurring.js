// FILE: finance-app/src/lib/recurring.js
// Recurring-transaction engine (check-on-use pattern — no cron needed).
//
// Rules materialize into Transaction documents when the user is logged in and
// uses the app (see api/auth/otp/verify and api/reports/dashboard).
// advanceRuleDate is pure and unit-tested; materializeDueRules takes injectable
// models so tests never touch MongoDB.
//
// IDEMPOTENCY: every occurrence is claimed by an ATOMIC conditional update
// (findOneAndUpdate guarded on the exact `nextRunAt` the caller read) BEFORE
// any insert. Two concurrent callers therefore cannot both materialize the
// same occurrence: the second one's guard no longer matches and it skips. The
// unique sparse index on (recurringRuleId, scheduledFor) is the second line of
// defence — a duplicate-key error is treated as "already materialized".
import { toMinorUnits } from "@/lib/money";

/** Max catch-up occurrences per rule per pass (bounds long absences). */
export const MAX_CATCH_UP_RUNS = 12;

/**
 * Advance a run date by one frequency step. Monthly rules stay on the same
 * day-of-month (dayOfMonth is capped at 28 so every month has it); weekly
 * rules advance exactly 7 days.
 *
 * UTC-only, matching firstRunDate(). The previous local `setDate`/`setMonth`
 * resolved to the wrong day-of-month on any server whose timezone is not UTC,
 * and because the advanced value is written back as the new nextRunAt the
 * error became permanent.
 */
export function advanceRuleDate(date, frequency) {
  const next = new Date(date.getTime());
  if (frequency === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
  } else {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}

/** First run date for a new rule, derived from its schedule (UTC). */
export function firstRunDate({ frequency, dayOfMonth, dayOfWeek }, from = new Date()) {
  if (frequency === "weekly") {
    const next = new Date(from.getTime());
    const delta = ((dayOfWeek ?? from.getUTCDay()) - from.getUTCDay() + 7) % 7;
    next.setUTCDate(next.getUTCDate() + delta);
    next.setUTCHours(0, 0, 0, 0);
    return next;
  }
  const next = new Date(from.getTime());
  next.setUTCDate(dayOfMonth ?? from.getUTCDate());
  next.setUTCHours(0, 0, 0, 0);
  // Monthly on day X when today already passed X runs next month — unless X
  // is today, in which case it runs today.
  const todayStart = new Date(from.getTime());
  todayStart.setUTCHours(0, 0, 0, 0);
  if (next.getTime() < todayStart.getTime()) {
    next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}

/**
 * Materialize every due occurrence of the user's active rules into
 * Transactions, advancing each rule's nextRunAt past now.
 *
 * Concurrency-safe: the nextRunAt advance is an atomic claim taken BEFORE
 * inserting, so a second concurrent pass finds its guard stale and inserts
 * nothing. A duplicate-key (E11000) insert rejection is likewise treated as
 * "already materialized" rather than an error.
 *
 * @returns number of transactions created.
 */
export async function materializeDueRules(userId, deps = {}) {
  const { default: Recurring } = await import("@/models/recurring.model").catch(() => ({}));
  const { default: Transaction } = await import("@/models/transaction.model").catch(() => ({}));
  const RecurringModel = deps.Recurring || Recurring;
  const TransactionModel = deps.Transaction || Transaction;
  if (!RecurringModel?.find || !TransactionModel) return 0;

  const now = deps.now || new Date();
  const query = RecurringModel.find({
    userId,
    active: true,
    nextRunAt: { $lte: now },
  });
  // Real Mongoose queries need .lean(); injected test fakes may return the
  // array directly.
  const rules =
    query && typeof query.lean === "function" ? await query.lean() : await query;

  let created = 0;
  for (const rule of rules || []) {
    // Plan the whole run first so the claim can be a SINGLE $set of the
    // final nextRunAt. Nothing is lost if the claim fails: the plan is
    // recomputed from the same inputs on the next pass.
    const runAts = [];
    let cursor = new Date(rule.nextRunAt);
    let planned = 0;
    while (cursor <= now && planned < MAX_CATCH_UP_RUNS) {
      runAts.push(cursor);
      cursor = advanceRuleDate(cursor, rule.frequency);
      planned += 1;
    }
    // Always advance past now so a capped rule doesn't re-fire every pass.
    while (cursor <= now) {
      cursor = advanceRuleDate(cursor, rule.frequency);
    }
    const precomputedNext = cursor;
    if (runAts.length === 0) continue;

    // ATOMIC CLAIM. The filter pins the exact nextRunAt this caller read, so
    // a concurrent pass that already advanced the rule makes this match
    // nothing and we skip the inserts entirely.
    const claimed = await RecurringModel.findOneAndUpdate(
      { _id: rule._id, nextRunAt: rule.nextRunAt },
      { $set: { nextRunAt: precomputedNext } },
      { new: true }
    );
    if (!claimed) continue;

    for (const runAt of runAts) {
      try {
        await new TransactionModel({
          userId: rule.userId,
          type: rule.type,
          amount: rule.amount,
          amountMinor: toMinorUnits(rule.amount),
          currency: rule.currency || "USD",
          category: rule.category,
          description: rule.description || `Recurring: ${rule.category}`,
          date: runAt,
          recurringRuleId: rule._id,
          scheduledFor: runAt,
        }).save();
        created += 1;
      } catch (error) {
        // The unique (recurringRuleId, scheduledFor) index rejected a
        // duplicate: this occurrence is already materialized. Not an error.
        if (error && error.code === 11000) continue;
        throw error;
      }
    }

    await RecurringModel.updateOne(
      { _id: rule._id },
      { $set: { lastRunAt: runAts[runAts.length - 1] } }
    );
  }
  return created;
}
