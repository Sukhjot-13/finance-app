// src/app/api/reports/generate/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Transaction from "@/models/transaction.model";
import { verifySession } from "@/lib/auth";

export async function POST(request) {
  const { user, status } = await verifySession();
  if (!user)
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  await dbConnect();
  const { startDate, endDate, startInstant, endInstant } = await request.json();

  if (!startDate || !endDate) {
    return NextResponse.json(
      { message: "Start date and end date are required" },
      { status: 400 }
    );
  }

  // Prefer absolute instants computed in the BROWSER (user's timezone) so the
  // window matches the user's calendar days; fall back to legacy string
  // parsing (server-local) when they're absent.
  const parsedStart = startInstant ? new Date(startInstant) : null;
  const parsedEnd = endInstant ? new Date(endInstant) : null;
  const rangeStart =
    parsedStart && !isNaN(parsedStart.getTime())
      ? parsedStart
      : new Date(startDate + "T00:00:00");
  const rangeEnd =
    parsedEnd && !isNaN(parsedEnd.getTime())
      ? parsedEnd
      : new Date(endDate + "T23:59:59.999");

  try {
    const transactions = await Transaction.find({
      userId: user._id,
      date: { $gte: rangeStart, $lte: rangeEnd },
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
