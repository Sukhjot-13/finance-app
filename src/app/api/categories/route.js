// src/app/api/categories/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Category from "@/models/category.model";
import { verifySession } from "@/lib/auth";
import { defaultExpenseCategories, defaultIncomeCategories } from "@/lib/constants";
import { isReservedCategoryName, RESERVED_CATEGORY_NAMES } from "@/lib/money";
import { logServerError, withManagerLogs } from "@/lib/manager/server";

// GET all categories for the user (defaults + custom)
async function handleGET(request) {
  const { user, status } = await verifySession();
  if (!user)
    return NextResponse.json({ message: "Not authenticated" }, { status: status || 401 });

  try {
    await dbConnect();

    const userCategories = await Category.find({ userId: user._id });
    const expenseCategories = [
      ...new Set([
        ...defaultExpenseCategories,
        ...userCategories
          .filter((c) => c.type === "expense")
          .map((c) => c.name),
      ]),
    ];
    const incomeCategories = [
      ...new Set([
        ...defaultIncomeCategories,
        ...userCategories.filter((c) => c.type === "income").map((c) => c.name),
      ]),
    ];

    return NextResponse.json(
      { expense: expenseCategories, income: incomeCategories, allCustom: userCategories },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// POST a new custom category
async function handlePOST(request) {
  const { user, status } = await verifySession();
  if (!user)
    return NextResponse.json({ message: "Not authenticated" }, { status: status || 401 });

  try {
    await dbConnect();
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: "Invalid request body" },
        { status: 400 }
      );
    }
    // A literal `null` body parses to null without throwing.
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { message: "Invalid request body" },
        { status: 400 }
      );
    }
    const { name, type } = body;

    if (!name || typeof name !== "string" || !name.trim() || !type) {
      return NextResponse.json(
        { message: "Category name and type are required" },
        { status: 400 }
      );
    }

    if (type !== "expense" && type !== "income") {
      return NextResponse.json(
        { message: "Category type must be 'expense' or 'income'" },
        { status: 400 }
      );
    }

    if (name.trim().length > 50) {
      return NextResponse.json(
        { message: "Category name cannot exceed 50 characters" },
        { status: 400 }
      );
    }

    if (isReservedCategoryName(name)) {
      return NextResponse.json(
        { message: "That category name is reserved. Please choose another." },
        { status: 400 }
      );
    }

    const newCategory = new Category({ name: name.trim(), type, userId: user._id });
    await newCategory.save();
    return NextResponse.json(newCategory, { status: 201 });
  } catch (error) {
    if (error.code === 11000) {
      return NextResponse.json(
        { message: "Category already exists" },
        { status: 409 }
      );
    }
    // Infrastructure failures are 500s (retryable) — never 400s, which would
    // mislead clients into thinking their input was wrong.
    console.error("Create category error:", error.message);
    logServerError("Create category error", error, { route: "POST /api/categories" });
    return NextResponse.json(
      { message: "Error creating category" },
      { status: 500 }
    );
  }
}

// Every verb below is wrapped so the request gets a trace-scoped child
// logger, a completion entry with the status it actually produced, and a
// flush scheduled with `after()` once the response completes.
export const GET = withManagerLogs(handleGET);
export const POST = withManagerLogs(handlePOST);
