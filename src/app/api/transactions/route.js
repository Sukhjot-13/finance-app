// FILE: finance-app/src/app/api/transactions/route.js
import dbConnect from "@/lib/mongodb";
import Transaction from "@/models/transaction.model";
import { verifySession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { coerceAmount, toMinorUnits } from "@/lib/money";
import { logServerError } from "@/lib/manager";

// Escapes user input so it's always treated literally in $regex filters.
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseInstant(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

// GET transactions for the user — server-side filtered + paginated.
// Query params:
//   page (default 1), limit (default 50, max 200)
//   type ("income"|"expense"), category, search (description/category)
//   from / to (absolute instants bounding the transaction date)
// Response shape: { transactions, total, page, pageSize, totalPages }
export async function GET(req) {
  try {
    // Full session check so server-side revocation applies here too
    const { user, status } = await verifySession();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: status || 401 });
    }

    await dbConnect();

    const { searchParams } = new URL(req.url);
    const page = Math.max(parseInt(searchParams.get("page"), 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit"), 10) || 50, 1),
      200
    );

    const query = { userId: user._id };

    const type = searchParams.get("type");
    if (type === "income" || type === "expense") {
      query.type = type;
    }

    const category = searchParams.get("category");
    if (category && category.trim()) {
      query.category = category.trim();
    }

    const search = searchParams.get("search");
    if (search && search.trim()) {
      const pattern = new RegExp(escapeRegex(search.trim()), "i");
      query.$or = [{ description: pattern }, { category: pattern }];
    }

    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");
    const from = fromRaw ? parseInstant(fromRaw) : null;
    const to = toRaw ? parseInstant(toRaw) : null;
    // Present-but-unparseable bounds are a client bug: 400 instead of
    // silently returning unfiltered data the user thinks is filtered.
    if ((fromRaw && !from) || (toRaw && !to)) {
      return NextResponse.json(
        { message: "Invalid date filter. Use ISO date strings." },
        { status: 400 }
      );
    }
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = from;
      if (to) query.date.$lte = to;
    }

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Transaction.countDocuments(query),
    ]);

    return NextResponse.json(
      {
        transactions,
        total,
        page,
        pageSize: limit,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET transactions error:", error?.message);
    logServerError("GET transactions error", error, { route: "GET /api/transactions" });
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// POST a new transaction
export async function POST(req) {
  try {
    const { user, status } = await verifySession();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: status || 401 });
    }

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
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { message: "Invalid request body" },
        { status: 400 }
      );
    }
    
    // Input validation
    const { type, amount, category, date, description, excludeFromBudget } = body;
    
    if (!type || !['income', 'expense'].includes(type)) {
      return NextResponse.json(
        { message: "Transaction type must be 'income' or 'expense'" },
        { status: 400 }
      );
    }
    
    // Number.isFinite (not `isNaN`) is the guard: `isNaN("Infinity")` and
    // `isNaN("1e400")` are both FALSE and the strings then compare > 0, so a
    // single such row made every aggregate for the user ±Infinity forever.
    const amountNum = coerceAmount(amount);
    if (amountNum === null) {
      return NextResponse.json(
        { message: "Amount must be a positive number" },
        { status: 400 }
      );
    }
    
    if (!category || typeof category !== 'string' || category.trim().length === 0) {
      return NextResponse.json(
        { message: "Category is required" },
        { status: 400 }
      );
    }
    
    if (!date || isNaN(Date.parse(date))) {
      return NextResponse.json(
        { message: "Valid date is required" },
        { status: 400 }
      );
    }

    if (description !== undefined && typeof description !== "string") {
      return NextResponse.json(
        { message: "Description must be a string" },
        { status: 400 }
      );
    }

    if (body.currency !== undefined && body.currency !== "USD" && body.currency !== "INR") {
      return NextResponse.json(
        { message: "Currency must be USD or INR" },
        { status: 400 }
      );
    }
    
    // Sanitize inputs
    // Store the date exactly as the client sent it. The client sends an ISO
    // instant for 12:00 noon in the USER's local timezone (e.g. for a UTC-5
    // user picking Aug 4, the client sends "2026-08-04T17:00:00.000Z").
    // Storing that instant as-is means it renders back as the same calendar
    // date for the user in any timezone.
    // IMPORTANT: never adjust by the server's own timezone offset here — the
    // server's timezone is irrelevant to the user (and is UTC in production,
    // which is what made dates shift to the previous day).
    const userDate = new Date(date);

    const sanitizedData = {
      type,
      amount: amountNum,
      amountMinor: toMinorUnits(amountNum),
      currency: body.currency === "INR" ? "INR" : "USD",
      category: category.trim(),
      date: userDate,
      description: description ? description.trim() : '',
      // Always persist the flag (Boolean() coerces undefined -> false), so a
      // client that doesn't send it still gets a deterministic value.
      excludeFromBudget: Boolean(excludeFromBudget),
      userId: user._id
    };
    
    const transaction = new Transaction(sanitizedData);
    await transaction.save();
    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    console.error("POST transaction error:", error?.message);
    logServerError("POST transaction error", error, { route: "POST /api/transactions" });
    
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { message: "Validation error", error: error.message },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { message: "Failed to create transaction" },
      { status: 500 }
    );
  }
}
