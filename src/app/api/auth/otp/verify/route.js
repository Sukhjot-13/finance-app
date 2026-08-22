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
  // Parse inside try: a malformed body must be a controlled 400, never an
  // unhandled throw that surfaces as a framework 500.
  let email;
  let otp;
  try {
    ({ email, otp } = await req.json());
  } catch {
    return sendError("Invalid request body.", 400);
  }

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

    // Set cookies. sameSite "lax" (not "strict"): strict cookies are NOT
    // sent on top-level navigations from other sites, so following an
    // external link to the app looked like a logged-out visit and bounced
    // users to /login. Lax still withholds cookies from cross-site POSTs,
    // so CSRF protection for mutating endpoints is unaffected.
    const cookieStore = await cookies();
    cookieStore.set("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 15 * 60, // 15 minutes
      path: "/",
      sameSite: "lax",
    });

    cookieStore.set("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
      sameSite: "lax",
    });

    // New = no name AND onboarding never completed (skip counts as done),
    // so "Skip for now" users go straight to the dashboard on later logins.
    const isNewUser = !user.accountName && !user.onboarded;

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
