// src/app/api/categories/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Category from "@/models/category.model";
import { getSession } from "@/lib/auth";

const defaultExpenseCategories = [
  "Food",
  "Groceries",
  "Transport",
  "Bills",
  "Housing",
  "Entertainment",
  "Health",
  "Shopping",
  "Other",
];
const defaultIncomeCategories = [
  "Salary",
  "Bonus",
  "Freelance",
  "Investment",
  "Other",
];

// GET all categories for the user (defaults + custom)
export async function GET(request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  await dbConnect();

  try {
    const userCategories = await Category.find({ userId: session.userId });
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
      { expense: expenseCategories, income: incomeCategories },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// POST a new custom category
export async function POST(request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  await dbConnect();
  const { name, type } = await request.json();

  if (!name || !type) {
    return NextResponse.json(
      { message: "Category name and type are required" },
      { status: 400 }
    );
  }

  try {
    const newCategory = new Category({ name, type, userId: session.userId });
    await newCategory.save();
    return NextResponse.json(newCategory, { status: 201 });
  } catch (error) {
    if (error.code === 11000) {
      return NextResponse.json(
        { message: "Category already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { message: "Error creating category", error: error.message },
      { status: 400 }
    );
  }
}
