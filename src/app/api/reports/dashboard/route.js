// FILE: finance-app/src/app/api/reports/dashboard/route.js
import dbConnect from "@/lib/mongodb";
import Transaction from "@/models/transaction.model";
import { verifySession } from "@/lib/auth";
import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { AMOUNT_MINOR_EXPR, fromMinorUnits } from "@/lib/money";

/** Minimum gap between recurring materialization passes, per user. */
const RECURRING_THROTTLE_MS = 60 * 1000;

export async function GET(req) {
  // Full session check so server-side revocation applies here too
  const { user, status } = await verifySession();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: status || 401 });
  }

  try {
    await dbConnect();
    const userId = new mongoose.Types.ObjectId(user._id);

    // Prefer the client's local month start/end (absolute instants) so the
    // window matches what the user sees regardless of server timezone.
    // The END bound matters: without it, future-dated transactions would
    // count toward "this month" until their date arrives.
    const { searchParams } = new URL(req.url);
    const parseInstant = (value) => {
      if (!value) return null;
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed;
    };
    const startRaw = searchParams.get("start");
    const endRaw = searchParams.get("end");
    const startParam = startRaw ? parseInstant(startRaw) : null;
    const endParam = endRaw ? parseInstant(endRaw) : null;
    // Present-but-unparseable bounds are a client bug: 400 instead of
    // silently falling back to a window the user didn't ask for.
    if ((startRaw && !startParam) || (endRaw && !endParam)) {
      return NextResponse.json(
        { message: "Invalid date range. Use ISO date strings." },
        { status: 400 }
      );
    }
    const startOfMonth =
      startParam ||
      new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endOfMonth =
      endParam ||
      new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 1);

    // Materialize due recurring rules on normal app use, not just at login.
    // Throttled per user (default 60s) via the RateLimit collection, and the
    // work is fire-and-forget relative to the response so the dashboard is
    // never slowed by it.
    await maybeMaterializeRecurring(user._id);

    // Aggregations. All $sum run over INTEGER minor units; the single
    // conversion to major units happens at the response boundary.
    const balancePromise = Transaction.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: "$type",
          totalMinor: { $sum: AMOUNT_MINOR_EXPR },
        },
      },
    ]);

    const monthlyPromise = Transaction.aggregate([
      { $match: { userId, date: { $gte: startOfMonth, $lt: endOfMonth } } },
      {
        $group: {
          _id: "$type",
          totalMinor: { $sum: AMOUNT_MINOR_EXPR },
        },
      },
    ]);

    const expenseBreakdownPromise = Transaction.aggregate([
      {
        $match: {
          userId,
          type: "expense",
          date: { $gte: startOfMonth, $lt: endOfMonth },
        },
      },
      {
        $group: {
          _id: "$category",
          totalMinor: { $sum: AMOUNT_MINOR_EXPR },
        },
      },
      { $project: { category: "$_id", totalMinor: 1, _id: 0 } },
    ]);

    const recentTransactionsPromise = Transaction.find({ userId })
      .sort({ date: -1, createdAt: -1 })
      .limit(5)
      .lean();

    const [balance, monthly, expenseBreakdown, recentTransactions] =
      await Promise.all([
        balancePromise,
        monthlyPromise,
        expenseBreakdownPromise,
        recentTransactionsPromise,
      ]);

    const incomeMinor = balance.find((b) => b._id === "income")?.totalMinor || 0;
    const expensesMinor = balance.find((b) => b._id === "expense")?.totalMinor || 0;
    // Integer subtraction — 0.1 + 0.2 drift can never reach this payload.
    const currentBalance = fromMinorUnits(incomeMinor - expensesMinor);

    const monthlyIncome = fromMinorUnits(
      monthly.find((m) => m._id === "income")?.totalMinor || 0
    );
    const monthlyExpenses = fromMinorUnits(
      monthly.find((m) => m._id === "expense")?.totalMinor || 0
    );

    const expenseBreakdownOut = (expenseBreakdown || []).map((row) => ({
      category: row.category,
      total: fromMinorUnits(row.totalMinor || 0),
    }));

    return NextResponse.json(
      {
        currentBalance,
        monthlyIncome,
        monthlyExpenses,
        expenseBreakdown: expenseBreakdownOut,
        recentTransactions,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Dashboard API Error:", error?.message);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

/**
 * Best-effort, throttled recurring materialization. Reuses the existing
 * RateLimit collection as a per-user cooldown so a user idling on the
 * dashboard doesn't re-scan their rules on every request. Any failure is
 * swallowed: a recurring hiccup must never break the dashboard. Losing the
 * race is harmless — materialization is idempotent (atomic claim + unique
 * index in src/lib/recurring.js), so a double pass inserts nothing extra.
 */
async function maybeMaterializeRecurring(userId) {
  try {
    const { countRecentHits, recordHit } = await import("@/lib/rate-limit");
    const key = `recurring-materialize:${String(userId)}`;
    if ((await countRecentHits(key, RECURRING_THROTTLE_MS)) > 0) return;
    await recordHit(key, RECURRING_THROTTLE_MS);
    const { materializeDueRules } = await import("@/lib/recurring");
    await materializeDueRules(userId);
  } catch {
    // Ignored by design.
  }
}
