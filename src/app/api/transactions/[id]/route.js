// src/app/api/transactions/[id]/route.js
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Transaction from "@/models/transaction.model";
import { getSession } from "@/lib/auth";

// PUT (update) a specific transaction
export async function PUT(request, { params }) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  await dbConnect();
  const { id } = params;
  const body = await request.json();

  try {
    const updatedTransaction = await Transaction.findOneAndUpdate(
      { _id: id, userId: session.userId },
      body,
      { new: true, runValidators: true }
    );

    if (!updatedTransaction) {
      return NextResponse.json(
        { message: "Transaction not found or user not authorized" },
        { status: 404 }
      );
    }
    return NextResponse.json(updatedTransaction, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { message: "Server error", error: error.message },
      { status: 500 }
    );
  }
}

// DELETE a specific transaction
export async function DELETE(request, { params }) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });

  await dbConnect();
  const { id } = params;

  try {
    const deletedTransaction = await Transaction.findOneAndDelete({
      _id: id,
      userId: session.userId,
    });

    if (!deletedTransaction) {
      return NextResponse.json(
        { message: "Transaction not found or user not authorized" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { message: "Transaction deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}
