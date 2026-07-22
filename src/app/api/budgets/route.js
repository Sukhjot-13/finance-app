import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Budget from "@/models/budget.model";
import { verifyAuth } from "@/lib/auth";

// GET all budgets for the current month
export async function GET(req) {
  const { user } = await verifyAuth();
  if (!user)
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  await dbConnect();

  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") || getCurrentMonth();

    const budgets = await Budget.find({ userId: user._id, month }).lean();
    return NextResponse.json(budgets, { status: 200 });
  } catch (error) {
    console.error("GET budgets error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// POST create or update a budget
export async function POST(req) {
  const { user } = await verifyAuth();
  if (!user)
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  await dbConnect();

  try {
    const body = await req.json();
    const { category, amount, month } = body;

    if (!category || !amount || !month) {
      return NextResponse.json(
        { message: "Category, amount, and month are required" },
        { status: 400 }
      );
    }

    if (amount < 1) {
      return NextResponse.json(
        { message: "Budget must be at least 1" },
        { status: 400 }
      );
    }

    // Upsert: create if not exists, update if does
    const budget = await Budget.findOneAndUpdate(
      { userId: user._id, category, month },
      { amount },
      { upsert: true, new: true, runValidators: true }
    );

    return NextResponse.json(budget, { status: 200 });
  } catch (error) {
    console.error("POST budget error:", error);

    if (error.code === 11000) {
      return NextResponse.json(
        { message: "Budget already exists for this category and month" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { message: "Error saving budget", error: error.message },
      { status: 400 }
    );
  }
}

// DELETE a budget
export async function DELETE(req) {
  const { user } = await verifyAuth();
  if (!user)
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  await dbConnect();

  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const month = searchParams.get("month") || getCurrentMonth();

    if (!category) {
      return NextResponse.json(
        { message: "Category is required" },
        { status: 400 }
      );
    }

    await Budget.findOneAndDelete({
      userId: user._id,
      category,
      month,
    });

    return NextResponse.json(
      { message: "Budget deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("DELETE budget error:", error);
    return NextResponse.json(
      { message: "Error deleting budget" },
      { status: 500 }
    );
  }
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
