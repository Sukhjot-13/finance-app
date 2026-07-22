import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Category from "@/models/category.model";
import Transaction from "@/models/transaction.model";
import { verifyAuth } from "@/lib/auth";
import mongoose from "mongoose";

// PUT rename a custom category
export async function PUT(request, { params }) {
  const { user } = await verifyAuth();
  if (!user)
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  await dbConnect();

  try {
    const { name } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json(
        { message: "Category name is required" },
        { status: 400 }
      );
    }

    const category = await Category.findOneAndUpdate(
      { _id: params.id, userId: user._id },
      { name: name.trim() },
      { new: true, runValidators: true }
    );

    if (!category) {
      return NextResponse.json(
        { message: "Category not found or you do not have permission to edit it" },
        { status: 404 }
      );
    }

    return NextResponse.json(category, { status: 200 });
  } catch (error) {
    if (error.code === 11000) {
      return NextResponse.json(
        { message: "A category with this name already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { message: "Error updating category", error: error.message },
      { status: 400 }
    );
  }
}

// DELETE a custom category
export async function DELETE(request, { params }) {
  const { user } = await verifyAuth();
  if (!user)
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  await dbConnect();

  try {
    const category = await Category.findOneAndDelete({
      _id: params.id,
      userId: user._id,
    });

    if (!category) {
      return NextResponse.json(
        { message: "Category not found or you do not have permission to delete it" },
        { status: 404 }
      );
    }

    // Reassign all transactions using this category to "Miscellaneous"
    await Transaction.updateMany(
      { userId: user._id, category: category.name },
      { $set: { category: "Miscellaneous" } }
    );

    return NextResponse.json(
      { message: "Category deleted successfully. Transactions reassigned to Miscellaneous." },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { message: "Error deleting category", error: error.message },
      { status: 400 }
    );
  }
}
