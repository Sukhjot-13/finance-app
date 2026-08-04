// src/app/api/transactions/[id]/route.js
import dbConnect from "@/lib/mongodb";
import Transaction from "@/models/transaction.model";
import { verifySession } from "@/lib/auth"; // Using the secure session verifier
import { sendError, sendSuccess } from "@/lib/server-utils";

/**
 * GET a single transaction by its ID.
 */
export async function GET(request, { params }) {
  const { user, error } = await verifySession();
  if (error || !user) return sendError(error || "Unauthorized", 401);

  const { id } = await params;

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
  const { user, error } = await verifySession();
  if (error || !user) return sendError(error || "Unauthorized", 401);

  const { id } = await params;

  try {
    await dbConnect();
    const body = await request.json();
    const { type, amount, category, date, description } = body;

    // Store the date exactly as the client sent it (see POST /api/transactions
    // for why no timezone-offset adjustment belongs on the server).
    let parsedDate = date ? new Date(date) : undefined;
    if (parsedDate && isNaN(parsedDate.getTime())) parsedDate = undefined;

    const updatedTransaction = await Transaction.findOneAndUpdate(
      { _id: id, userId: user._id },
      {
        ...(type && { type }),
        ...(amount && { amount: parseFloat(amount) }),
        ...(category && { category: category.trim() }),
        ...(parsedDate && { date: parsedDate }),
        ...(description !== undefined && { description: description.trim() }),
      },
      { new: true, runValidators: true }
    );

    if (!updatedTransaction) {
      return sendError("Transaction not found or unauthorized", 404);
    }

    return sendSuccess(updatedTransaction);
  } catch (err) {
    console.error(err);
    return sendError("Server error", 500);
  }
}

/**
 * DELETE a transaction by its ID.
 */
export async function DELETE(request, { params }) {
  const { user, error } = await verifySession();
  if (error || !user) return sendError(error || "Unauthorized", 401);

  const { id } = await params;

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
