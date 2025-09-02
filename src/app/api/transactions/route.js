// FILE: finance-app/src/app/api/transactions/route.js
import dbConnect from "@/lib/mongodb";
import Transaction from "@/models/transaction.model";
import { verifyAuth } from "@/lib/auth";
import { NextResponse } from "next/server";

// GET all transactions for the user
export async function GET(req) {
  try {
    // Use the correct verifyAuth function
    const { user } = await verifyAuth();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    
    const transactions = await Transaction.find({ userId: user._id }).sort({
      date: -1,
      createdAt: -1,
    });
    return NextResponse.json(transactions, { status: 200 });
  } catch (error) {
    console.error("GET transactions error:", error);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// POST a new transaction
export async function POST(req) {
  try {
    const { user } = await verifyAuth();
    if (!user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    await dbConnect();
    const body = await req.json();
    
    // Input validation
    const { type, amount, category, date, description } = body;
    
    if (!type || !['income', 'expense'].includes(type)) {
      return NextResponse.json(
        { message: "Transaction type must be 'income' or 'expense'" },
        { status: 400 }
      );
    }
    
    if (!amount || isNaN(amount) || amount <= 0) {
      return NextResponse.json(
        { message: "Amount must be a positive number" },
        { status: 400 }
      );
    }
    
    if (!category || typeof category !== 'string' || category.trim().length === 0) {
      return NextResponse.json(
        { message: "Category is required" },
        { status: 400 }
      );
    }
    
    if (!date || isNaN(Date.parse(date))) {
      return NextResponse.json(
        { message: "Valid date is required" },
        { status: 400 }
      );
    }
    
    // Sanitize inputs
    // FIX: The `new Date(date)` constructor treats the date string 'YYYY-MM-DD' as UTC.
    // This causes a timezone issue where the date might be saved as the previous day.
    // To fix this, we create a new Date object from the date string, which correctly
    // interprets it in the server's local time zone, and then adjust for the timezone offset
    // to ensure it reflects the user's local date.
    const tempDate = new Date(date);
    const userDate = new Date(tempDate.getTime() + tempDate.getTimezoneOffset() * 60000);

    const sanitizedData = {
      type,
      amount: parseFloat(amount),
      category: category.trim(),
      date: userDate,
      description: description ? description.trim() : '',
      userId: user._id
    };
    
    const transaction = new Transaction(sanitizedData);
    await transaction.save();
    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    console.error("POST transaction error:", error);
    
    if (error.name === 'ValidationError') {
      return NextResponse.json(
        { message: "Validation error", error: error.message },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { message: "Failed to create transaction" },
      { status: 500 }
    );
  }
}
