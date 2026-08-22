// src/app/api/categories/[id]/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Category from "@/models/category.model";
import Transaction from "@/models/transaction.model";
import Budget from "@/models/budget.model";
import { verifySession } from "@/lib/auth";
import mongoose from "mongoose";

// PUT rename a custom category.
// Renaming cascades: transactions AND monthly budgets are stored by plain
// category name, so both are re-pointed at the new name — otherwise reports,
// dropdowns and budget bars would reference a ghost label.
export async function PUT(request, { params }) {
  const { user, status } = await verifySession();
  if (!user)
    return NextResponse.json(
      { message: "Not authenticated" },
      { status: status || 401 }
    );

  const { id } = await params;

  try {
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ message: "Category not found" }, { status: 404 });
    }

    await dbConnect();

    const { name } = await request.json();

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { message: "Category name is required" },
        { status: 400 }
      );
    }

    const newName = name.trim();
    if (newName.length > 50) {
      return NextResponse.json(
        { message: "Category name cannot exceed 50 characters" },
        { status: 400 }
      );
    }

    const category = await Category.findOne({ _id: id, userId: user._id });
    if (!category) {
      return NextResponse.json(
        { message: "Category not found or you do not have permission to edit it" },
        { status: 404 }
      );
    }

    const oldName = category.name;
    category.name = newName;
    try {
      await category.save();
    } catch (saveError) {
      if (saveError.code === 11000) {
        return NextResponse.json(
          { message: "A category with this name already exists" },
          { status: 409 }
        );
      }
      throw saveError;
    }

    if (oldName !== newName) {
      await Transaction.updateMany(
        { userId: user._id, category: oldName },
        { $set: { category: newName } }
      );
      await Budget.updateMany(
        { userId: user._id, category: oldName },
        { $set: { category: newName } }
      );
    }

    return NextResponse.json(category, { status: 200 });
  } catch (error) {
    console.error("Category rename error:", error.message);
    return NextResponse.json(
      { message: "Error updating category" },
      { status: 500 }
    );
  }
}

// DELETE a custom category.
// Transactions move to "Other" (an existing default for BOTH expense and
// income lists); any budgets set for the deleted name are removed so no
// progress bar references a category the user can no longer select.
export async function DELETE(request, { params }) {
  const { user, status } = await verifySession();
  if (!user)
    return NextResponse.json(
      { message: "Not authenticated" },
      { status: status || 401 }
    );

  const { id } = await params;

  try {
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ message: "Category not found" }, { status: 404 });
    }

    await dbConnect();

    const category = await Category.findOneAndDelete({
      _id: id,
      userId: user._id,
    });

    if (!category) {
      return NextResponse.json(
        { message: "Category not found or you do not have permission to delete it" },
        { status: 404 }
      );
    }

    await Transaction.updateMany(
      { userId: user._id, category: category.name },
      { $set: { category: "Other" } }
    );
    await Budget.deleteMany({ userId: user._id, category: category.name });

    return NextResponse.json(
      { message: "Category deleted successfully. Transactions reassigned to Other." },
      { status: 200 }
    );
  } catch (error) {
    console.error("Category delete error:", error.message);
    return NextResponse.json(
      { message: "Error deleting category" },
      { status: 500 }
    );
  }
}
