// FILE: finance-app/src/app/api/user/route.js
import dbConnect from "@/lib/mongodb";
import User from "@/models/user.model";
import { verifySession } from "@/lib/auth"; // Import the new function
import { NextResponse } from "next/server";

// GET user details
export async function GET(req) {
  // Use the new, more secure session verification
  const { user, error } = await verifySession(); 
  if (error || !user) {
    return NextResponse.json({ message: "Unauthorized", error: error }, { status: 401 });
  }

  await dbConnect();
  try {
    const userData = await User.findById(user._id).select("-otp -refreshTokens -__v").lean();
    if (!userData) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }
    return NextResponse.json(userData, { status: 200 });
  } catch (dbError) {
    return NextResponse.json({ message: "Server error", error: dbError.message }, { status: 500 });
  }
}

// UPDATE user details
export async function PUT(req) {
    const { user, error } = await verifySession();
    if (error || !user) {
        return NextResponse.json({ message: "Unauthorized", error: error }, { status: 401 });
    }

    await dbConnect();
    try {
        const body = await req.json();
        const { accountName, currency } = body;

        const fieldsToUpdate = {};
        if (accountName) fieldsToUpdate.accountName = accountName;
        if (currency) fieldsToUpdate.currency = currency;

        if (Object.keys(fieldsToUpdate).length === 0) {
            return NextResponse.json({ message: "No fields to update" }, { status: 400 });
        }

        const updatedUser = await User.findByIdAndUpdate(
          user._id,
          { $set: fieldsToUpdate },
          { new: true, runValidators: true }
        ).select("-otp -refreshTokens -__v");

        if (!updatedUser) {
          return NextResponse.json({ message: "User not found" }, { status: 404 });
        }

        return NextResponse.json(updatedUser, { status: 200 });
    } catch (dbError) {
        return NextResponse.json({ message: "Server error", error: dbError.message }, { status: 500 });
    }
}
