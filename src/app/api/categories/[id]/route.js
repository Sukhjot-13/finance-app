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
// The three writes run inside a Mongo TRANSACTION when the deployment
// supports it (replica set / Atlas). On standalone instances (no txn
// support) it falls back to sequential writes with best-effort rollback, so
// a mid-cascade failure no longer leaves transactions pointing at the old
// name while the category doc holds the new one.
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
    if (oldName === newName) {
      return NextResponse.json(category, { status: 200 });
    }

    // --- Transactional path ---
    let session = null;
    try {
      const candidate = await mongoose.startSession();
      // Without an active connection (or on very old drivers) a session may
      // come back without transaction support — treat that as standalone.
      if (candidate && typeof candidate.withTransaction === "function") {
        session = candidate;
      } else if (candidate?.endSession) {
        candidate.endSession();
      }
    } catch {
      session = null;
    }

    if (session) {
      try {
        let committed = false;
        await session.withTransaction(async () => {
          category.name = newName;
          await category.save({ session });
          await Transaction.updateMany(
            { userId: user._id, category: oldName },
            { $set: { category: newName } },
            { session }
          );
          await Budget.updateMany(
            { userId: user._id, category: oldName },
            { $set: { category: newName } },
            { session }
          );
          committed = true;
        });
        session.endSession();
        // Re-read outside the aborted/committed session context.
        const fresh = committed
          ? await Category.findById(category._id)
          : null;
        return NextResponse.json(fresh || category, { status: 200 });
      } catch (txError) {
        session.endSession();
        if (txError.code === 11000) {
          return NextResponse.json(
            { message: "A category with this name already exists" },
            { status: 409 }
          );
        }
        const msg = String(txError?.message || "");
        const unsupported =
          /replica set/i.test(msg) ||
          /transaction/i.test(msg) && /not (supported|enabled)/i.test(msg);
        if (!unsupported) {
          console.error("Category rename error:", txError.message);
          return NextResponse.json(
            { message: "Error updating category" },
            { status: 500 }
          );
        }
        // Unsupported here → sequential fallback below.
      }
    }

    // --- Sequential fallback with best-effort rollback ---
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

    try {
      await Transaction.updateMany(
        { userId: user._id, category: oldName },
        { $set: { category: newName } }
      );
      await Budget.updateMany(
        { userId: user._id, category: oldName },
        { $set: { category: newName } }
      );
    } catch (cascadeError) {
      // Roll back the rename so nothing references a label that doesn't
      // exist yet. If even the rollback fails, surface the original error —
      // retrying the same rename is safe either way.
      console.error("Rename cascade failed, rolling back:", cascadeError.message);
      category.name = oldName;
      try {
        await category.save();
      } catch (rollbackError) {
        console.error("Rename rollback failed:", rollbackError.message);
      }
      throw cascadeError;
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
