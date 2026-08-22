// FILE: finance-app/src/app/api/reports/dashboard/route.js
import dbConnect from "@/lib/mongodb";
import Transaction from "@/models/transaction.model";
import { verifySession } from "@/lib/auth";
import mongoose from "mongoose";
import { NextResponse } from "next/server";

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
    const startOfMonth =
      parseInstant(searchParams.get("start")) ||
      new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endOfMonth =
      parseInstant(searchParams.get("end")) ||
      new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 1);

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
      { $match: { userId, date: { $gte: startOfMonth, $lt: endOfMonth } } },
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
          date: { $gte: startOfMonth, $lt: endOfMonth },
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
