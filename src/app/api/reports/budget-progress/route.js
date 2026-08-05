import dbConnect from "@/lib/mongodb";
import Transaction from "@/models/transaction.model";
import Budget from "@/models/budget.model";
import { verifyAuth } from "@/lib/auth";
import mongoose from "mongoose";
import { NextResponse } from "next/server";

const OVERALL_CATEGORY = "__total__";

export async function GET(req) {
  const { user } = await verifyAuth();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();

  try {
    const userId = new mongoose.Types.ObjectId(user._id);
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

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
          date: { $gte: startOfMonth },
          excludeFromBudget: { $ne: true },
        },
      },
      {
        $group: {
          _id: "$category",
          spent: { $sum: "$amount" },
        },
      },
    ]);

    const spendingMap = {};
    let totalSpent = 0;
    spending.forEach((s) => {
      spendingMap[s._id] = s.spent;
      totalSpent += s.spent;
    });

    // Sum of one-time expenses excluded from the budget this month, so the UI
    // can show what was skipped.
    const excludedResult = await Transaction.aggregate([
      {
        $match: {
          userId,
          type: "expense",
          date: { $gte: startOfMonth },
          excludeFromBudget: true,
        },
      },
      {
        $group: {
          _id: null,
          spent: { $sum: "$amount" },
        },
      },
    ]);
    const excludedSpent = excludedResult.length > 0 ? excludedResult[0].spent : 0;

    // Separate overall budget from per-category budgets
    const overallBudgetEntry = budgets.find((b) => b.category === OVERALL_CATEGORY);
    const categoryBudgets = budgets.filter((b) => b.category !== OVERALL_CATEGORY);

    // Overall budget progress
    let overall = null;
    if (overallBudgetEntry) {
      const spent = totalSpent;
      const percentage = overallBudgetEntry.amount > 0 ? Math.min((spent / overallBudgetEntry.amount) * 100, 100) : 0;
      overall = {
        budget: overallBudgetEntry.amount,
        spent,
        remaining: Math.max(overallBudgetEntry.amount - spent, 0),
        percentage: Math.round(percentage),
        overBudget: spent > overallBudgetEntry.amount,
      };
    }

    // Per-category progress
    const progress = categoryBudgets.map((budget) => {
      const spent = spendingMap[budget.category] || 0;
      const percentage = budget.amount > 0 ? Math.min((spent / budget.amount) * 100, 100) : 0;
      return {
        category: budget.category,
        budget: budget.amount,
        spent,
        remaining: Math.max(budget.amount - spent, 0),
        percentage: Math.round(percentage),
        overBudget: spent > budget.amount,
      };
    });

    return NextResponse.json({ overall, progress, totalSpent, excludedSpent }, { status: 200 });
  } catch (error) {
    console.error("Budget progress API Error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
