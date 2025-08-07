// src/app/api/auth/otp/verify/route.js
import User from "@/models/user.model";
import {
  sendError,
  sendSuccess,
  generateAccessToken,
  generateRefreshToken,
} from "@/lib/server-utils";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongodb";

export async function POST(req) {
  await dbConnect();
  const { email, otp } = await req.json();

  if (!email || !otp) {
    return sendError("Email and OTP are required.", 400);
  }

  try {
    const user = await User.findOne({ email });

    if (!user || !user.otp || !user.otpExpires) {
      return sendError("Invalid request. Please try again.", 400);
    }

    if (new Date() > user.otpExpires) {
      return sendError("OTP has expired. Please request a new one.", 400);
    }

    const isMatch = await bcrypt.compare(otp, user.otp);
    if (!isMatch) {
      return sendError("Invalid OTP.", 400);
    }

    // OTP is valid, clear it from the database
    user.otp = undefined;
    user.otpExpires = undefined;

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Store the new refresh token in the database
    user.refreshTokens.push({ token: refreshToken });
    await user.save();

    // Set cookies
    const cookieStore = cookies();
    cookieStore.set("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 15 * 60, // 15 minutes
      path: "/",
      sameSite: "strict",
    });

    cookieStore.set("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
      sameSite: "strict",
    });

    const isNewUser = !user.accountName;

    return sendSuccess({
      message: "Login successful.",
      isNewUser,
      user: {
        id: user._id,
        email: user.email,
        accountName: user.accountName,
      },
    });
  } catch (error) {
    console.error(error);
    return sendError("An internal server error occurred.", 500);
  }
}
