// src/app/api/reports/generate/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Transaction from "@/models/transaction.model";
import { verifyAuth } from "@/lib/auth";

export async function POST(request) {
  const { user } = await verifyAuth();
  if (!user)
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  await dbConnect();
  const { startDate, endDate } = await request.json();

  if (!startDate || !endDate) {
    return NextResponse.json(
      { message: "Start date and end date are required" },
      { status: 400 }
    );
  }

  try {
    const transactions = await Transaction.find({
      userId: user._id,
      date: { $gte: new Date(startDate), $lte: new Date(endDate) },
    });

    const totalIncome = transactions
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);
    const netSavings = totalIncome - totalExpenses;

    const expenseBreakdown = transactions
      .filter((t) => t.type === "expense")
      .reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {});

    const incomeBreakdown = transactions
      .filter((t) => t.type === "income")
      .reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {});

    const expenseBreakdownArray = Object.entries(expenseBreakdown)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
    const incomeBreakdownArray = Object.entries(incomeBreakdown)
      .map(([source, total]) => ({ source, total }))
      .sort((a, b) => b.total - a.total);

    return NextResponse.json(
      {
        summary: { totalIncome, totalExpenses, netSavings },
        expenseDetails: expenseBreakdownArray,
        incomeDetails: incomeBreakdownArray,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Generate report error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
