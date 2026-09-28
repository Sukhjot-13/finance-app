// src/app/api/transactions/[id]/route.js
import dbConnect from "@/lib/mongodb";
import Transaction from "@/models/transaction.model";
import { verifySession } from "@/lib/auth"; // Using the secure session verifier
import { sendError, sendSuccess } from "@/lib/server-utils";
import mongoose from "mongoose";
import { coerceAmount, toMinorUnits } from "@/lib/money";

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
    console.error("GET /api/transactions/[id] error:", err?.message);
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
  // `await request.json()` resolves to null for the literal body `null`
  // (it does not throw), so the destructuring below would throw a TypeError
  // and surface as a 500. 400 is the honest answer.
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return sendError("Invalid request body", 400);
  }

  try {
    await dbConnect();
    const { type, amount, category, date, description, excludeFromBudget, currency } = body;

    // Strict guards: present-but-invalid fields are 400s. The old code
    // silently OMITTED them and returned 200, so edits looked saved while
    // changing nothing — pure confusion.
    if (type !== undefined && !["income", "expense"].includes(type)) {
      return sendError("Transaction type must be 'income' or 'expense'", 400);
    }

    let amountNum;
    if (amount !== undefined) {
      amountNum = coerceAmount(amount);
      if (amountNum === null) {
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

    let currencyStr;
    if (currency !== undefined) {
      if (currency !== "USD" && currency !== "INR") {
        return sendError("Currency must be USD or INR", 400);
      }
      currencyStr = currency;
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
        ...(amountNum !== undefined && {
          amount: amountNum,
          amountMinor: toMinorUnits(amountNum),
        }),
        ...(categoryStr !== undefined && { category: categoryStr }),
        ...(parsedDate !== undefined && { date: parsedDate }),
        ...(description !== undefined && { description: description.trim() }),
        // Check against undefined (not truthiness) so `false` persists —
        // `...(excludeFromBudget && {...})` would silently drop a cleared flag.
        ...(excludeFromBudget !== undefined && { excludeFromBudget: Boolean(excludeFromBudget) }),
        ...(currencyStr !== undefined && { currency: currencyStr }),
      },
      { new: true, runValidators: true }
    );

    if (!updatedTransaction) {
      return sendError("Transaction not found or unauthorized", 404);
    }

    return sendSuccess(updatedTransaction);
  } catch (err) {
    console.error("PUT /api/transactions/[id] error:", err?.message);
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
    console.error("DELETE /api/transactions/[id] error:", err?.message);
    return sendError("Server error", 500);
  }
}
