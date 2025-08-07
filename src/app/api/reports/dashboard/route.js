// FILE: finance-app/src/app/api/reports/dashboard/route.js
import dbConnect from "@/lib/mongodb";
import Transaction from "@/models/transaction.model";
import { verifyAuth } from "@/lib/auth";
import mongoose from "mongoose";
import { NextResponse } from "next/server";

export async function GET(req) {
  // Use the correct verifyAuth function
  const { user } = await verifyAuth();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();

  try {
    const userId = new mongoose.Types.ObjectId(user._id);
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Aggregations
    const balancePromise = Transaction.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: "$type",
          total: { $sum: "$amount" },
        },
      },
    ]);

    const monthlyPromise = Transaction.aggregate([
      { $match: { userId, date: { $gte: startOfMonth } } },
      {
        $group: {
          _id: "$type",
          total: { $sum: "$amount" },
        },
      },
    ]);

    const expenseBreakdownPromise = Transaction.aggregate([
      {
        $match: {
          userId,
          type: "expense",
          date: { $gte: startOfMonth },
        },
      },
      {
        $group: {
          _id: "$category",
          total: { $sum: "$amount" },
        },
      },
      { $project: { category: "$_id", total: 1, _id: 0 } },
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

    const income = balance.find((b) => b._id === "income")?.total || 0;
    const expenses = balance.find((b) => b._id === "expense")?.total || 0;
    const currentBalance = income - expenses;

    const monthlyIncome = monthly.find((m) => m._id === "income")?.total || 0;
    const monthlyExpenses =
      monthly.find((m) => m._id === "expense")?.total || 0;

    return NextResponse.json(
      {
        currentBalance,
        monthlyIncome,
        monthlyExpenses,
        expenseBreakdown,
        recentTransactions,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Dashboard API Error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
