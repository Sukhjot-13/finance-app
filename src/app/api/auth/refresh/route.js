// src/app/api/auth/refresh/route.js
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import dbConnect from "@/lib/mongodb";
import User from "@/models/user.model";
import { sendError, sendSuccess } from "@/lib/server-utils";
import {
  generateAccessToken,
  purgeExpiredRefreshTokens,
} from "@/lib/auth";
import mongoose from "mongoose";

export async function POST() {
  await dbConnect();
  const cookieStore = await cookies();
  const token = await cookieStore.get("refreshToken")?.value;

  if (!token) {
    return sendError("Refresh token not found. Please log in.", 401);
  }

  // 1. Verify the refresh token signature and expiry. Only a bad token may
  // clear cookies — a transient DB error below must not log the user out.
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
  } catch (error) {
    console.error("Refresh token verification failed:", error.message);
    cookieStore.delete("refreshToken");
    cookieStore.delete("accessToken");
    return sendError("Session expired or invalid. Please log in again.", 401);
  }

  try {
    // 2. Find the user and check if the token is valid in the database
    const user = await User.findOne({
      _id: new mongoose.Types.ObjectId(decoded.userId),
      "refreshTokens.token": token,
    });

    if (!user) {
      // Token invalid or revoked server-side. Clear cookies.
      cookieStore.delete("refreshToken");
      cookieStore.delete("accessToken");
      return sendError("Invalid refresh token. Please log in again.", 401);
    }

    // 3. Issue a new access token
    const accessToken = generateAccessToken(user._id);

    // 4. Set the new access token in cookies
    cookieStore.set("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 15 * 60, // 15 minutes
      path: "/",
      sameSite: "strict",
    });

    // 5. Opportunistically prune refresh tokens past their TTL (TTL indexes
    // don't work on subdocument arrays). Best-effort; failures are non-fatal.
    try {
      await purgeExpiredRefreshTokens(user._id);
    } catch (pruneError) {
      console.error("Refresh-token prune failed:", pruneError.message);
    }

    return sendSuccess({ message: "Access token refreshed successfully" });
  } catch (error) {
    // Transient infrastructure error — keep cookies so the client can retry.
    console.error("Token refresh failed:", error.message);
    return sendError("Could not refresh session. Please try again.", 500);
  }
}
