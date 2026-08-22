// src/app/api/categories/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Category from "@/models/category.model";
import { verifySession } from "@/lib/auth";
import { defaultExpenseCategories, defaultIncomeCategories } from "@/lib/constants";

// GET all categories for the user (defaults + custom)
export async function GET(request) {
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
export async function POST(request) {
  const { user, status } = await verifySession();
  if (!user)
    return NextResponse.json({ message: "Not authenticated" }, { status: status || 401 });

  try {
    await dbConnect();
    const { name, type } = await request.json();

    if (!name || typeof name !== "string" || !name.trim() || !type) {
      return NextResponse.json(
        { message: "Category name and type are required" },
        { status: 400 }
      );
    }

    if (name.trim().length > 50) {
      return NextResponse.json(
        { message: "Category name cannot exceed 50 characters" },
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
    console.error("Create category error:", error.message);
    return NextResponse.json(
      { message: "Error creating category" },
      { status: 400 }
    );
  }
}
