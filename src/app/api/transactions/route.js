// FILE: finance-app/src/app/api/transactions/route.js
import dbConnect from "@/lib/mongodb";
import Transaction from "@/models/transaction.model";
import { verifyAuth } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET all transactions for the user
export async function GET(req) {
  // Use the correct verifyAuth function
  const { user } = await verifyAuth();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  try {
    const transactions = await Transaction.find({ userId: user._id }).sort({
      date: -1,
      createdAt: -1,
    });
    return NextResponse.json(transactions, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// POST a new transaction
export async function POST(req) {
  const { user } = await verifyAuth();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  try {
    const body = await req.json();
    const transaction = new Transaction({ ...body, userId: user._id });
    await transaction.save();
    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: "Failed to create transaction", error: error.message },
      { status: 400 }
    );
  }
}
