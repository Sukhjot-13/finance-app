// src/app/api/transactions/route.js

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Transaction from "@/models/transaction.model";
import { getSession } from "@/lib/auth";

// GET all transactions for the logged-in user
export async function GET(request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  await dbConnect();

  try {
    const transactions = await Transaction.find({
      userId: session.userId,
    }).sort({ date: -1 });
    return NextResponse.json(transactions, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// POST a new transaction
export async function POST(request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  await dbConnect();
  const body = await request.json();

  try {
    const newTransaction = new Transaction({
      ...body,
      userId: session.userId,
    });
    await newTransaction.save();
    return NextResponse.json(newTransaction, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: "Error creating transaction", error: error.message },
      { status: 400 }
    );
  }
}
