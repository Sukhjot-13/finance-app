// src/app/api/auth/otp/verify/route.js
import User from "@/models/user.model";
import { sendError, sendSuccess } from "@/lib/server-utils";
import { generateAccessToken, generateRefreshToken } from "@/lib/auth";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongodb";

// In-memory brute-force protection (in production, use Redis).
// 5 failed attempts per email within 15 minutes locks that email out for
// 15 minutes. Entries reset on success and are swept when the map grows.
const LOCKOUT_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const verifyAttempts = new Map();

function getAttemptState(email) {
  const now = Date.now();
  let entry = verifyAttempts.get(email);
  if (!entry) {
    entry = { attempts: [], lockedUntil: 0 };
    verifyAttempts.set(email, entry);
  }
  if (entry.lockedUntil <= now && entry.attempts.length > 0) {
    entry.attempts = entry.attempts.filter((t) => now - t < LOCKOUT_MS);
  }
  return { entry, now };
}

function isLockedOut(entry, now) {
  if (entry.lockedUntil > now) return true;
  // Auto-lock once the failure threshold inside the window is reached
  return entry.attempts.length >= MAX_ATTEMPTS;
}

function recordFailure(entry) {
  entry.attempts.push(Date.now());
  if (entry.attempts.length >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
  }
}

function sweepStaleAttempts() {
  if (verifyAttempts.size <= 1000) return;
  const now = Date.now();
  for (const [key, entry] of verifyAttempts) {
    const stale =
      entry.lockedUntil <= now &&
      entry.attempts.every((t) => now - t >= LOCKOUT_MS);
    if (stale) verifyAttempts.delete(key);
  }
}

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

  sweepStaleAttempts();
  const key = String(email).trim().toLowerCase();
  const { entry, now } = getAttemptState(key);

  // Reject cheaply while locked — identical message as any other failure so
  // attackers learn nothing extra.
  if (isLockedOut(entry, now)) {
    return sendError(
      "Too many failed attempts. Please try again later.",
      429
    );
  }

  try {
    await dbConnect();

    const user = await findUserByEmail(email);

    // One uniform failure message for "no pending OTP", "expired", and
    // "wrong code" — differences would let callers probe which emails exist.
    let failureMessage = null;

    if (!user || !user.otp || !user.otpExpires) {
      failureMessage = "Invalid or expired code. Please request a new one.";
    } else if (new Date() > user.otpExpires) {
      failureMessage = "Invalid or expired code. Please request a new one.";
    }

    if (!failureMessage) {
      const isMatch = await user.compareOtp(String(otp));
      if (!isMatch) {
        failureMessage = "Invalid or expired code. Please request a new one.";
      }
    }

    if (failureMessage) {
      recordFailure(entry);
      return sendError(failureMessage, 400);
    }

    // Success — clear OTP fields and this email's failure history
    user.otp = undefined;
    user.otpExpires = undefined;
    verifyAttempts.delete(key);

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Store the new refresh token in the database
    user.refreshTokens.push({ token: refreshToken });
    await user.save();

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
