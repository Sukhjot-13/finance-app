// FILE: finance-app/src/lib/recurring.js
// Recurring-transaction engine (check-on-login pattern — no cron needed).
//
// Rules materialize into Transaction documents when the user logs in (see the
// OTP verify route). advanceRuleDate is pure and unit-tested; materializeDueRules
// takes injectable models so tests never touch MongoDB.

/** Max catch-up occurrences per rule per login (bounds long absences). */
export const MAX_CATCH_UP_RUNS = 12;

/**
 * Advance a run date by one frequency step. Monthly rules stay on the same
 * day-of-month (dayOfMonth is capped at 28 so every month has it); weekly
 * rules advance exactly 7 days.
 */
export function advanceRuleDate(date, frequency) {
  const next = new Date(date.getTime());
  if (frequency === "weekly") {
    next.setDate(next.getDate() + 7);
  } else {
    next.setMonth(next.getMonth() + 1);
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
    let runAt = new Date(rule.nextRunAt);
    let runs = 0;
    while (runAt <= now && runs < MAX_CATCH_UP_RUNS) {
      await new TransactionModel({
        userId: rule.userId,
        type: rule.type,
        amount: rule.amount,
        category: rule.category,
        description: rule.description || `Recurring: ${rule.category}`,
        date: runAt,
      }).save();
      created += 1;
      runs += 1;
      rule.lastRunAt = runAt;
      runAt = advanceRuleDate(runAt, rule.frequency);
    }
    // Always advance past now so a capped rule doesn't re-fire every login.
    while (runAt <= now) {
      runAt = advanceRuleDate(runAt, rule.frequency);
    }
    await RecurringModel.updateOne(
      { _id: rule._id },
      { $set: { nextRunAt: runAt, lastRunAt: rule.lastRunAt || null } }
    );
  }
  return created;
}
