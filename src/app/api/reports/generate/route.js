// src/app/api/reports/generate/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Transaction from "@/models/transaction.model";
import { verifySession } from "@/lib/auth";
import { fromMinorUnits, minorOf } from "@/lib/money";
import { logServerError } from "@/lib/manager";

export async function POST(request) {
  const { user, status } = await verifySession();
  if (!user)
    return NextResponse.json({ message: "Not authenticated" }, { status: status || 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }
  // A literal `null` body parses to null WITHOUT throwing, so the
  // destructuring below would raise a TypeError and become a 500.
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  try {
    await dbConnect();
    const { startDate, endDate, startInstant, endInstant } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { message: "Start date and end date are required" },
        { status: 400 }
      );
    }

    // Prefer absolute instants computed in the BROWSER (user's timezone) so
    // the window matches the user's calendar days; fall back to legacy string
    // parsing (server-local) when they're absent. Present-but-invalid
    // instants are a client bug → 400, not a silent fallback.
    if (
      (startInstant && isNaN(new Date(startInstant).getTime())) ||
      (endInstant && isNaN(new Date(endInstant).getTime()))
    ) {
      return NextResponse.json(
        { message: "Invalid instant format" },
        { status: 400 }
      );
    }
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

    if (isNaN(rangeStart.getTime()) || isNaN(rangeEnd.getTime())) {
      return NextResponse.json(
        { message: "Invalid date format" },
        { status: 400 }
      );
    }

    if (rangeStart > rangeEnd) {
      return NextResponse.json(
        { message: "Start date must be on or before the end date" },
        { status: 400 }
      );
    }

    // Unbounded ranges load the user's entire history into memory (find +
    // in-memory reduce). Cap at 3 years — yearly reports stay fine, runaway
    // windows get a clear error instead of a CPU/memory cliff.
    const MAX_REPORT_RANGE_MS = 3 * 366 * 24 * 60 * 60 * 1000;
    if (rangeEnd.getTime() - rangeStart.getTime() > MAX_REPORT_RANGE_MS) {
      return NextResponse.json(
        { message: "Report range cannot exceed 3 years" },
        { status: 400 }
      );
    }

    const query = Transaction.find({
      userId: user._id,
      date: { $gte: rangeStart, $lte: rangeEnd },
    });
    const transactions = await (typeof query.lean === "function"
      ? query.select("type amount amountMinor category date").lean()
      : query);

    // EVERY sum runs over integer minor units and is converted to a decimal
    // exactly once at the end. Summing the raw doubles produced payloads
    // like 1234.5600000000002.
    const incomeMinor = (transactions || [])
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + minorOf(t), 0);
    const expensesMinor = (transactions || [])
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + minorOf(t), 0);

    const totalIncome = fromMinorUnits(incomeMinor);
    const totalExpenses = fromMinorUnits(expensesMinor);
    const netSavings = fromMinorUnits(incomeMinor - expensesMinor);

    // Object.create(null): a category named "__proto__" would otherwise be
    // a silent no-op on a plain `{}` (its spending would vanish from the
    // report entirely) and "constructor" would read back the Object
    // constructor.
    const expenseMinorMap = Object.create(null);
    const incomeMinorMap = Object.create(null);
    for (const t of transactions || []) {
      const map = t.type === "expense" ? expenseMinorMap : t.type === "income" ? incomeMinorMap : null;
      if (!map) continue;
      const minor = minorOf(t);
      map[t.category] = (Object.hasOwn(map, t.category) ? map[t.category] : 0) + minor;
    }

    const expenseBreakdownArray = Object.entries(expenseMinorMap)
      .map(([category, totalMinor]) => ({ category, total: fromMinorUnits(totalMinor) }))
      .sort((a, b) => b.total - a.total);
    const incomeBreakdownArray = Object.entries(incomeMinorMap)
      .map(([source, totalMinor]) => ({ source, total: fromMinorUnits(totalMinor) }))
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
    console.error("Generate report error:", error?.message);
    logServerError("Generate report error", error, { route: "POST /api/reports/generate" });
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
