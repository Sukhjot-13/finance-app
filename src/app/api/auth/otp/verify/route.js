// src/app/api/auth/otp/verify/route.js
import bcrypt from "bcryptjs";
import User from "@/models/user.model";
import { sendError, sendSuccess } from "@/lib/server-utils";
import {
  generateAccessToken,
  generateRefreshToken,
  purgeExpiredRefreshTokens,
  hashToken,
} from "@/lib/auth";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongodb";
import { recordHit, countRecentHits, resetKey } from "@/lib/rate-limit";

// Brute-force protection, backed by MongoDB so it is shared across
// instances and survives restarts. 5 failed attempts per email inside a
// sliding 15-minute window locks that email out for the remainder of it.
const VERIFY_WINDOW_MS = 15 * 60 * 1000;
const VERIFY_MAX_ATTEMPTS = 5;

// bcrypt hash of a throwaway string. Compared against when no real OTP
// exists so the endpoint's timing is identical either way.
const DUMMY_HASH =
  "$2b$10$k01Lo54J/UL7JlMkAOoXv.rmp/VE03sYCLi0rKBHa7.KQT.duddqa";

/**
 * Finds a user by email. New accounts are always stored lowercased; the
 * exact-match fallback keeps legacy mixed-case signups reachable.
 */
async function findUserByEmail(email) {
  const normalized = email.trim().toLowerCase();
  let user = await User.findOne({ email: normalized });
  if (!user && email !== normalized) {
    user = await User.findOne({ email });
  }
  return user;
}

export async function POST(req) {
  const { email, otp } = await req.json();

  if (!email || !otp) {
    return sendError("Email and OTP are required.", 400);
  }

  try {
    await dbConnect();

    const attemptKey = `otp-verify:${String(email).trim().toLowerCase()}`;
    const recentFailures = await countRecentHits(attemptKey, VERIFY_WINDOW_MS);

    // Reject cheaply while locked out — identical message as any other
    // failure so attackers learn nothing extra.
    if (recentFailures >= VERIFY_MAX_ATTEMPTS) {
      return sendError(
        "Too many failed attempts. Please try again later.",
        429
      );
    }

    const user = await findUserByEmail(email);

    // One uniform failure message for "no pending OTP", "expired", and
    // "wrong code" — differences would let callers probe which emails exist.
    let failureMessage = null;
    let compareTarget = user && user.otp ? user.otp : DUMMY_HASH;

    if (!user || !user.otp || !user.otpExpires) {
      failureMessage = "Invalid or expired code. Please request a new one.";
    } else if (new Date() > user.otpExpires) {
      failureMessage = "Invalid or expired code. Please request a new one.";
    }

    // Always run a bcrypt comparison — against a dummy hash when no real
    // OTP exists — so response timing can't reveal which emails have a
    // pending login code.
    const isMatch = await bcrypt.compare(String(otp), compareTarget);
    if (!failureMessage && !isMatch) {
      failureMessage = "Invalid or expired code. Please request a new one.";
    }

    if (failureMessage) {
      await recordHit(attemptKey, VERIFY_WINDOW_MS);
      return sendError(failureMessage, 400);
    }

    // Success — clear OTP fields and this email's failure history
    user.otp = undefined;
    user.otpExpires = undefined;
    resetKey(attemptKey).catch(() => {});

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Store the HASHED refresh token in the database (a DB leak must not
    // expose live session tokens).
    user.refreshTokens.push({ token: hashToken(refreshToken) });
    await user.save();

    // TTL indexes don't work on subdocument arrays — prune stale sessions
    await purgeExpiredRefreshTokens(user._id);

    // Set cookies
    const cookieStore = await cookies();
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
