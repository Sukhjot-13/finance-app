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

  try {
    await dbConnect();
    const transaction = await Transaction.findOne({
      _id: params.id,
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
 * UPDATE a transaction by its ID.
 */
export async function PUT(request, { params }) {
  const { user, error } = await verifySession();
  if (error || !user) return sendError(error || "Unauthorized", 401);

  try {
    await dbConnect();
    const body = await request.json();

    // Ensure user can only update their own transaction
    const updatedTransaction = await Transaction.findOneAndUpdate(
      { _id: params.id, userId: user._id },
      body,
      { new: true, runValidators: true }
    );

    if (!updatedTransaction) {
      return sendError("Transaction not found or you do not have permission to edit it", 404);
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

  try {
    await dbConnect();
    
    // Ensure user can only delete their own transaction
    const deletedTransaction = await Transaction.findOneAndDelete({
      _id: params.id,
      userId: user._id,
    });

    if (!deletedTransaction) {
      return sendError("Transaction not found or you do not have permission to delete it", 404);
    }

    return sendSuccess({ message: "Transaction deleted successfully" });
  } catch (err) {
    console.error(err);
    return sendError("Server error", 500);
  }
}
