// src/app/api/reports/dashboard/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Transaction from "@/models/transaction.model";
import { getSession } from "@/lib/auth";
import { startOfMonth, endOfMonth } from "date-fns";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  await dbConnect();
  const { userId } = session;
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  try {
    const transactions = await Transaction.find({ userId });
    const monthlyTransactions = transactions.filter((t) => {
      const tDate = new Date(t.date);
      return tDate >= monthStart && tDate <= monthEnd;
    });

    const monthlyIncome = monthlyTransactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const monthlyExpenses = monthlyTransactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalIncome = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpenses = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalSavings = transactions
      .filter((t) => t.type === "savings")
      .reduce((sum, t) => sum + t.amount, 0);

    const currentBalance = totalIncome - totalExpenses - totalSavings;

    const expenseBreakdown = monthlyTransactions
      .filter((t) => t.type === "expense")
      .reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {});

    const expenseBreakdownArray = Object.entries(expenseBreakdown)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);

    const recentTransactions = await Transaction.find({ userId })
      .sort({ date: -1 })
      .limit(5);

    return NextResponse.json(
      {
        currentBalance,
        monthlyIncome,
        monthlyExpenses,
        expenseBreakdown: expenseBreakdownArray,
        recentTransactions,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Dashboard report error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
