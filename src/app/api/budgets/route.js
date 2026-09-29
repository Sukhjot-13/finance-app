import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Budget from "@/models/budget.model";
import { verifySession } from "@/lib/auth";
import { isValidMonthKey, utcMonthKey } from "@/lib/utils";
import { MAX_AMOUNT, toMinorUnits } from "@/lib/money";
import { logServerError, withManagerLogs } from "@/lib/manager/server";

// Budgets are whole-unit caps (min 1), unlike transaction amounts.
function coerceBudgetAmount(value) {
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > MAX_AMOUNT) return null;
  return n;
}

// GET all budgets for the current month
async function handleGET(req) {
  const { user, status } = await verifySession();
  if (!user)
    return NextResponse.json({ message: "Not authenticated" }, { status: status || 401 });

  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    // Server-LOCAL month parts disagree with users' calendars around month
    // boundaries — fall back on UTC parts (the server is UTC in production).
    const month = searchParams.get("month") || utcMonthKey();

    const budgets = await Budget.find({ userId: user._id, month }).lean();
    return NextResponse.json(budgets, { status: 200 });
  } catch (error) {
    console.error("GET budgets error:", error?.message);
    logServerError("GET budgets error", error, { route: "GET /api/budgets" });
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// POST create or update a budget
async function handlePOST(req) {
  const { user, status } = await verifySession();
  if (!user)
    return NextResponse.json({ message: "Not authenticated" }, { status: status || 401 });

  try {
    await dbConnect();
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { message: "Invalid request body" },
        { status: 400 }
      );
    }
    const { category, amount, month } = body || {};

    // Strict type/format guards — don't trust client coercion ("50" < 1
    // string-compares as false, and schema validators only run on the
    // upsert-INSERT path, not the update path).
    if (
      !category ||
      typeof category !== "string" ||
      !category.trim() ||
      category.trim().length > 50
    ) {
      return NextResponse.json(
        { message: "Category is required (50 characters max)" },
        { status: 400 }
      );
    }

    if (!isValidMonthKey(month)) {
      return NextResponse.json(
        { message: "Month must be in YYYY-MM format" },
        { status: 400 }
      );
    }

    // Number.isFinite (not isNaN) so "Infinity"/"1e400" cannot be stored:
    // a poisoned budget cap breaks the progress math permanently.
    const amountNum = coerceBudgetAmount(amount);
    if (amountNum === null) {
      return NextResponse.json(
        { message: "Budget must be a number of at least 1" },
        { status: 400 }
      );
    }

    // Upsert: create if not exists, update if does
    const budget = await Budget.findOneAndUpdate(
      { userId: user._id, category: category.trim(), month },
      { amount: amountNum, amountMinor: toMinorUnits(amountNum) },
      { upsert: true, new: true, runValidators: true }
    );

    return NextResponse.json(budget, { status: 200 });
  } catch (error) {
    console.error("POST budget error:", error?.message);
    logServerError("POST budget error", error, { route: "POST /api/budgets" });

    if (error.code === 11000) {
      return NextResponse.json(
        { message: "Budget already exists for this category and month" },
        { status: 409 }
      );
    }

    // Infrastructure failures are 500s (retryable) — never 400s.
    return NextResponse.json(
      { message: "Error saving budget" },
      { status: 500 }
    );
  }
}

// DELETE a budget
async function handleDELETE(req) {
  const { user, status } = await verifySession();
  if (!user)
    return NextResponse.json({ message: "Not authenticated" }, { status: status || 401 });

  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const rawCategory = searchParams.get("category");
    const rawMonth = searchParams.get("month");
    const category = rawCategory?.trim();
    const month = rawMonth || utcMonthKey();

    if (!category) {
      return NextResponse.json(
        { message: "Category is required" },
        { status: 400 }
      );
    }

    if (!isValidMonthKey(month)) {
      return NextResponse.json(
        { message: "Month must be in YYYY-MM format" },
        { status: 400 }
      );
    }

    // POST trims before storing, so match trimmed here — otherwise
    // "?category=%20Food%20" deletes nothing yet reports success.
    // A miss is a 404, not a silent success.
    const deleted = await Budget.findOneAndDelete({
      userId: user._id,
      category,
      month,
    });

    if (!deleted) {
      return NextResponse.json(
        { message: "Budget not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: "Budget deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("DELETE budget error:", error?.message);
    logServerError("DELETE budget error", error, { route: "DELETE /api/budgets" });
    return NextResponse.json(
      { message: "Error deleting budget" },
      { status: 500 }
    );
  }
}

// Every verb below is wrapped so the request gets a trace-scoped child
// logger, a completion entry with the status it actually produced, and a
// flush scheduled with `after()` once the response completes.
export const GET = withManagerLogs(handleGET);
export const POST = withManagerLogs(handlePOST);
export const DELETE = withManagerLogs(handleDELETE);
