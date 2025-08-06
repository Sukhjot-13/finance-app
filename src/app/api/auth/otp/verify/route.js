// FILE: src/app/api/auth/otp/verify/route.js
// Handles verifying the OTP and creating a session token.

import dbConnect from "@/lib/mongodb";
import User from "@/models/user.model";
import { createToken, setAuthCookies } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(request) {
  await dbConnect();
  const { email, otp } = await request.json();

  if (!email || !otp) {
    return NextResponse.json(
      { message: "Email and OTP are required." },
      { status: 400 }
    );
  }

  try {
    const user = await User.findOne({ email });

    if (!user || !user.otp || user.otpExpires < new Date()) {
      return NextResponse.json(
        { message: "Invalid OTP or OTP has expired." },
        { status: 400 }
      );
    }

    const isMatch = await user.compareOTP(otp);
    if (!isMatch) {
      return NextResponse.json({ message: "Invalid OTP." }, { status: 400 });
    }

    // OTP is valid, clear it from DB
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    // ** THE FIX IS HERE **
    // Create JWT payload with a plain string for the user ID.
    const tokenPayload = { userId: user._id.toString(), email: user.email };
    const token = await createToken(tokenPayload);

    // Set cookie in the response headers
    const response = NextResponse.json(
      {
        message: "Login successful.",
        isNewUser: !user.accountName,
      },
      { status: 200 }
    );

    response.cookies.set("accessToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch (error) {
    console.error("OTP Verify Error:", error);
    return NextResponse.json(
      { message: "An error occurred during verification." },
      { status: 500 }
    );
  }
}
