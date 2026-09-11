// FILE: finance-app/src/app/api/user/route.js
import dbConnect from "@/lib/mongodb";
import User from "@/models/user.model";
import { verifySession } from "@/lib/auth"; // Import the new function
import { NextResponse } from "next/server";

// GET user details
export async function GET(req) {
  // Full session check (access token + refresh token in DB)
  const { user, status } = await verifySession();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: status || 401 });
  }

  try {
    await dbConnect();
    const userData = await User.findById(user._id).select("-otp -refreshTokens -__v").lean();
    if (!userData) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }
    return NextResponse.json(userData, { status: 200 });
  } catch (dbError) {
    console.error("GET /api/user error:", dbError.message);
    return NextResponse.json({ message: "Server error" }, { status: 500 });
  }
}

// UPDATE user details
export async function PUT(req) {
    const { user, status } = await verifySession();
    if (!user) {
        return NextResponse.json({ message: "Unauthorized" }, { status: status || 401 });
    }

    let body;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
    }

    try {
        await dbConnect();
        const accountName =
          typeof body.accountName === "string" ? body.accountName.trim() : undefined;
        const currency = body.currency;

        // Cap account name length; schema has no maxlength of its own
        if (accountName !== undefined && accountName.length > 60) {
            return NextResponse.json(
              { message: "Account name must be 60 characters or fewer" },
              { status: 400 }
            );
        }

        // Validate currency explicitly so bad input is a 400, not a
        // mongoose enum failure surfacing as an opaque 500.
        if (currency !== undefined && !["USD", "INR"].includes(currency)) {
            return NextResponse.json(
              { message: "Currency must be USD or INR" },
              { status: 400 }
            );
        }

        // Onboarding can only be COMPLETED from the client (never revoked),
        // so skipped users aren't re-prompted on every login.
        const wantsOnboard =
          body.onboarded === true ||
          (typeof body.accountName === "string" && Boolean(body.accountName.trim()));

        const fieldsToUpdate = {};
        if (accountName !== undefined) fieldsToUpdate.accountName = accountName || null;
        if (currency !== undefined) fieldsToUpdate.currency = currency;
        if (wantsOnboard) fieldsToUpdate.onboarded = true;

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
        console.error("PUT /api/user error:", dbError.message);
        return NextResponse.json({ message: "Server error" }, { status: 500 });
    }
}
