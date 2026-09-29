// src/app/api/categories/[id]/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Category from "@/models/category.model";
import Transaction from "@/models/transaction.model";
import Budget from "@/models/budget.model";
import { verifySession } from "@/lib/auth";
import { isReservedCategoryName } from "@/lib/money";
import mongoose from "mongoose";
import { logServerError, withManagerLogs } from "@/lib/manager/server";

// PUT rename a custom category.
// Renaming cascades: transactions AND monthly budgets are stored by plain
// category name, so both are re-pointed at the new name — otherwise reports,
// dropdowns and budget bars would reference a ghost label.
// The three writes run inside a Mongo TRANSACTION when the deployment
// supports it (replica set / Atlas). On standalone instances (no txn
// support) it falls back to sequential writes with best-effort rollback, so
// a mid-cascade failure no longer leaves transactions pointing at the old
// name while the category doc holds the new one.
async function handlePUT(request, { params }) {
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
    const { name } = body;

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

    // See src/lib/money.js: reserved names break the report spending maps.
    if (isReservedCategoryName(newName)) {
      return NextResponse.json(
        { message: "That category name is reserved. Please choose another." },
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

    // Budgets are keyed {userId,category,month} WITHOUT a type, while the
    // category key includes the type. Renaming A(expense)→B when ANY budget
    // already lives under B would duplicate-key mid-cascade and split-brain
    // the rename — reject upfront instead.
    const budgetCollision = await Budget.findOne({
      userId: user._id,
      category: newName,
    });
    if (budgetCollision) {
      return NextResponse.json(
        { message: "A budget with this name already exists" },
        { status: 409 }
      );
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
          logServerError("Category rename error", txError, { route: "PUT /api/categories/[id]" });
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
      // Roll back EVERYTHING the cascade touched (transactions AND budgets),
      // then the rename itself — otherwise a partial cascade leaves a
      // split-brain: category doc on the old name, rows on the new one.
      // All best-effort: if even the rollback fails, surface the original
      // error — retrying the same rename is safe either way.
      console.error("Rename cascade failed, rolling back:", cascadeError.message);
      logServerError("Rename cascade failed, rolling back", cascadeError, {
        route: "PUT /api/categories/[id]",
      });
      try {
        await Transaction.updateMany(
          { userId: user._id, category: newName },
          { $set: { category: oldName } }
        );
      } catch (revertError) {
        console.error("Rename transaction-revert failed:", revertError.message);
        logServerError("Rename transaction-revert failed", revertError, { route: "PUT /api/categories/[id]" });
      }
      try {
        await Budget.updateMany(
          { userId: user._id, category: newName },
          { $set: { category: oldName } }
        );
      } catch (revertError) {
        console.error("Rename budget-revert failed:", revertError.message);
        logServerError("Rename budget-revert failed", revertError, { route: "PUT /api/categories/[id]" });
      }
      category.name = oldName;
      try {
        await category.save();
      } catch (rollbackError) {
        console.error("Rename rollback failed:", rollbackError.message);
        logServerError("Rename rollback failed", rollbackError, { route: "PUT /api/categories/[id]" });
      }
      throw cascadeError;
    }

    return NextResponse.json(category, { status: 200 });
  } catch (error) {
    console.error("Category rename error:", error.message);
    logServerError("Category rename error", error, { route: "PUT /api/categories/[id]" });
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
async function handleDELETE(request, { params }) {
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

    // Cascades run after the delete — on failure, best-effort restore the
    // category doc (same _id) so rows never reference a missing category
    // and a retry stays possible. Restore failures only log.
    try {
      await Transaction.updateMany(
        { userId: user._id, category: category.name },
        { $set: { category: "Other" } }
      );
      await Budget.deleteMany({ userId: user._id, category: category.name });
    } catch (cascadeError) {
      console.error("Category delete cascade failed, restoring:", cascadeError.message);
      logServerError("Category delete cascade failed, restoring", cascadeError, {
        route: "DELETE /api/categories/[id]",
      });
      try {
        const restore = new Category({
          _id: category._id,
          userId: category.userId,
          name: category.name,
          type: category.type,
        });
        await restore.save();
      } catch (restoreError) {
        console.error("Category delete-restore failed:", restoreError.message);
        logServerError("Category delete-restore failed", restoreError, { route: "DELETE /api/categories/[id]" });
      }
      throw cascadeError;
    }

    return NextResponse.json(
      { message: "Category deleted successfully. Transactions reassigned to Other." },
      { status: 200 }
    );
  } catch (error) {
    console.error("Category delete error:", error.message);
    logServerError("Category delete error", error, { route: "DELETE /api/categories/[id]" });
    return NextResponse.json(
      { message: "Error deleting category" },
      { status: 500 }
    );
  }
}

// Every verb below is wrapped so the request gets a trace-scoped child
// logger, a completion entry with the status it actually produced, and a
// flush scheduled with `after()` once the response completes.
export const PUT = withManagerLogs(handlePUT);
export const DELETE = withManagerLogs(handleDELETE);
