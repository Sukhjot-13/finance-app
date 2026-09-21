// src/app/api/transactions/[id]/route.js
import dbConnect from "@/lib/mongodb";
import Transaction from "@/models/transaction.model";
import { verifySession } from "@/lib/auth"; // Using the secure session verifier
import { sendError, sendSuccess } from "@/lib/server-utils";
import mongoose from "mongoose";

/**
 * GET a single transaction by its ID.
 */
export async function GET(request, { params }) {
  const { user, error, status: sessionStatus } = await verifySession();
  if (error || !user) return sendError(error || "Unauthorized", sessionStatus || 401);

  const { id } = await params;

  if (!mongoose.isValidObjectId(id)) {
    return sendError("Transaction not found", 404);
  }

  try {
    await dbConnect();
    const transaction = await Transaction.findOne({
      _id: id,
      userId: user._id, // Ensure user can only get their own transaction
    });

    if (!transaction) {
      return sendError("Transaction not found", 404);
    }

    return sendSuccess(transaction);
  } catch (err) {
    console.error(err);
    return sendError("Server error", 500);
  }
}

/**
 * PUT (update) a transaction by its ID.
 */
export async function PUT(request, { params }) {
  const { user, error, status: sessionStatus } = await verifySession();
  if (error || !user) return sendError(error || "Unauthorized", sessionStatus || 401);

  const { id } = await params;

  if (!mongoose.isValidObjectId(id)) {
    return sendError("Transaction not found", 404);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return sendError("Invalid request body", 400);
  }

  try {
    await dbConnect();
    const { type, amount, category, date, description, excludeFromBudget } = body;

    // Strict guards: present-but-invalid fields are 400s. The old code
    // silently OMITTED them and returned 200, so edits looked saved while
    // changing nothing — pure confusion.
    if (type !== undefined && !["income", "expense"].includes(type)) {
      return sendError("Transaction type must be 'income' or 'expense'", 400);
    }

    let amountNum;
    if (amount !== undefined) {
      amountNum =
        typeof amount === "string" && amount.trim() === ""
          ? NaN
          : Number(amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        return sendError("Amount must be a positive number", 400);
      }
    }

    let categoryStr;
    if (category !== undefined) {
      if (typeof category !== "string" || !category.trim()) {
        return sendError("Category is required", 400);
      }
      if (category.trim().length > 50) {
        return sendError("Category name cannot exceed 50 characters", 400);
      }
      categoryStr = category.trim();
    }

    let parsedDate;
    if (date !== undefined && date !== null) {
      parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return sendError("Valid date is required", 400);
      }
    }

    if (description !== undefined && typeof description !== "string") {
      return sendError("Description must be a string", 400);
    }

    // Store the date exactly as the client sent it (see POST /api/transactions
    // for why no timezone-offset adjustment belongs on the server).
    const updatedTransaction = await Transaction.findOneAndUpdate(
      { _id: id, userId: user._id },
      {
        ...(type !== undefined && { type }),
        ...(amountNum !== undefined && { amount: amountNum }),
        ...(categoryStr !== undefined && { category: categoryStr }),
        ...(parsedDate !== undefined && { date: parsedDate }),
        ...(description !== undefined && { description: description.trim() }),
        // Check against undefined (not truthiness) so `false` persists —
        // `...(excludeFromBudget && {...})` would silently drop a cleared flag.
        ...(excludeFromBudget !== undefined && { excludeFromBudget: Boolean(excludeFromBudget) }),
      },
      { new: true, runValidators: true }
    );

    if (!updatedTransaction) {
      return sendError("Transaction not found or unauthorized", 404);
    }

    return sendSuccess(updatedTransaction);
  } catch (err) {
    console.error(err);
    if (err.name === "ValidationError") {
      return sendError(err.message, 400);
    }
    return sendError("Server error", 500);
  }
}

/**
 * DELETE a transaction by its ID.
 */
export async function DELETE(request, { params }) {
  const { user, error, status: sessionStatus } = await verifySession();
  if (error || !user) return sendError(error || "Unauthorized", sessionStatus || 401);

  const { id } = await params;

  if (!mongoose.isValidObjectId(id)) {
    return sendError("Transaction not found", 404);
  }

  try {
    await dbConnect();
    // Ensure user can only delete their own transaction
    const deletedTransaction = await Transaction.findOneAndDelete({
      _id: id,
      userId: user._id,
    });

    if (!deletedTransaction) {
      return sendError("Transaction not found or unauthorized", 404);
    }

    return sendSuccess({ message: "Transaction deleted successfully" });
  } catch (err) {
    console.error(err);
    return sendError("Server error", 500);
  }
}
