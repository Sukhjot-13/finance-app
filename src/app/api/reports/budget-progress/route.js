import dbConnect from "@/lib/mongodb";
import Transaction from "@/models/transaction.model";
import Budget from "@/models/budget.model";
import { verifySession } from "@/lib/auth";
import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { isValidMonthKey, utcMonthKey } from "@/lib/utils";
import { AMOUNT_MINOR_EXPR, fromMinorUnits, toMinorUnits } from "@/lib/money";
import { logServerError, withManagerLogs } from "@/lib/manager/server";

const OVERALL_CATEGORY = "__total__";

async function handleGET(req) {
  const { user, status } = await verifySession();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: status || 401 });
  }

  try {
    await dbConnect();
    const userId = new mongoose.Types.ObjectId(user._id);

    // Prefer the client's local month start/end + month key so budget windows
    // match what the user sees regardless of server timezone. The END bound
    // keeps future-dated transactions out of this month's spending.
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
    // silently mixing an unintended spending window with the budgets.
    if ((startRaw && !startParam) || (endRaw && !endParam)) {
      return NextResponse.json(
        { message: "Invalid date range. Use ISO date strings." },
        { status: 400 }
      );
    }
    const today = new Date();
    const startOfMonth =
      startParam ||
      new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth =
      endParam ||
      new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 1);
    // Budgets must come from the SAME month as the spending window. An
    // explicit month wins (strictly validated); otherwise derive it from the
    // window start so the two can never silently disagree; otherwise UTC now.
    const monthParam = searchParams.get("month") || "";
    let monthKey;
    if (monthParam) {
      if (!isValidMonthKey(monthParam)) {
        return NextResponse.json(
          { message: "Month must be in YYYY-MM format" },
          { status: 400 }
        );
      }
      monthKey = monthParam;
    } else if (startRaw) {
      monthKey = utcMonthKey(startParam);
    } else {
      monthKey = utcMonthKey(today);
    }

    // Get all budgets for this month
    const budgets = await Budget.find({ userId: user._id, month: monthKey }).lean();

    // Get expense totals per category for this month. One-time expenses
    // flagged excludeFromBudget are skipped — they're real spending but the
    // user doesn't want them counted against monthly budgets.
    const spending = await Transaction.aggregate([
      {
        $match: {
          userId,
          type: "expense",
          date: { $gte: startOfMonth, $lt: endOfMonth },
          excludeFromBudget: { $ne: true },
        },
      },
      {
        $group: {
          _id: "$category",
          spentMinor: { $sum: AMOUNT_MINOR_EXPR },
        },
      },
    ]);

    // Object.create(null): a category literally named "constructor" or
    // "__proto__" must not resolve to an inherited Object property.
    const spendingMap = Object.create(null);
    let totalSpentMinor = 0;
    (spending || []).forEach((s) => {
      spendingMap[s._id] = s.spentMinor || 0;
      totalSpentMinor += s.spentMinor || 0;
    });

    // Sum of one-time expenses excluded from the budget this month, so the UI
    // can show what was skipped.
    const excludedResult = await Transaction.aggregate([
      {
        $match: {
          userId,
          type: "expense",
          date: { $gte: startOfMonth, $lt: endOfMonth },
          excludeFromBudget: true,
        },
      },
      {
        $group: {
          _id: null,
          spentMinor: { $sum: AMOUNT_MINOR_EXPR },
        },
      },
    ]);
    const excludedSpent = fromMinorUnits(
      excludedResult.length > 0 ? excludedResult[0].spentMinor || 0 : 0
    );

    // Separate overall budget from per-category budgets
    const overallBudgetEntry = budgets.find((b) => b.category === OVERALL_CATEGORY);
    const categoryBudgets = budgets.filter((b) => b.category !== OVERALL_CATEGORY);

    const totalSpent = fromMinorUnits(totalSpentMinor);

    // Budget caps in minor units too, so spent-vs-budget never compares
    // unrepresentable floats. Legacy budgets without amountMinor fall back
    // to a rounded conversion of `amount`.
    const budgetMinorOf = (budget) =>
      Number.isInteger(budget.amountMinor) ? budget.amountMinor : toMinorUnits(budget.amount);

    const pct = (spentMinor, capMinor) =>
      capMinor > 0 ? Math.min((spentMinor / capMinor) * 100, 100) : 0;

    // Overall budget progress
    let overall = null;
    if (overallBudgetEntry) {
      const capMinor = budgetMinorOf(overallBudgetEntry);
      const spentMinor = totalSpentMinor;
      overall = {
        budget: overallBudgetEntry.amount,
        spent: fromMinorUnits(spentMinor),
        remaining: fromMinorUnits(Math.max(capMinor - spentMinor, 0)),
        percentage: Math.round(pct(spentMinor, capMinor)),
        overBudget: spentMinor > capMinor,
      };
    }

    // Per-category progress. Object.hasOwn (not `||`) so a legitimate $0
    // spend is reported as 0 instead of falling through to a prototype
    // lookup for a category literally named "constructor".
    const progress = categoryBudgets.map((budget) => {
      const capMinor = budgetMinorOf(budget);
      const spentMinor = Object.hasOwn(spendingMap, budget.category)
        ? spendingMap[budget.category]
        : 0;
      return {
        category: budget.category,
        budget: budget.amount,
        spent: fromMinorUnits(spentMinor),
        remaining: fromMinorUnits(Math.max(capMinor - spentMinor, 0)),
        percentage: Math.round(pct(spentMinor, capMinor)),
        overBudget: spentMinor > capMinor,
      };
    });

    return NextResponse.json({ overall, progress, totalSpent, excludedSpent }, { status: 200 });
  } catch (error) {
    console.error("Budget progress API Error:", error?.message);
    logServerError("Budget progress API Error", error, { route: "GET /api/reports/budget-progress" });
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// Every verb below is wrapped so the request gets a trace-scoped child
// logger, a completion entry with the status it actually produced, and a
// flush scheduled with `after()` once the response completes.
export const GET = withManagerLogs(handleGET);
