// src/app/api/auth/refresh/route.js
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import dbConnect from "@/lib/mongodb";
import User from "@/models/user.model";
import { sendError, sendSuccess } from "@/lib/server-utils";
import { generateAccessToken } from "@/lib/auth";
import mongoose from "mongoose";

export async function POST() {
  console.log("\n--- Refresh Token Attempt ---");
  await dbConnect();
  const cookieStore = cookies();
  const token = await cookieStore.get("refreshToken")?.value;

  if (!token) {
    console.log("[REFRESH_ERROR] No refresh token found in cookies.");
    return sendError("Refresh token not found. Please log in.", 401);
  }
  console.log("[REFRESH_INFO] Found refresh token in cookies.");

  try {
    // 1. Verify the refresh token
    console.log("[REFRESH_INFO] Verifying JWT...");
    const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    console.log(`[REFRESH_SUCCESS] JWT verified. User ID: ${decoded.userId}`);

    // 2. Find the user and check if the token is valid in the database
    console.log("[REFRESH_INFO] Searching for user and token in database...");
    const user = await User.findOne({
      _id: new mongoose.Types.ObjectId(decoded.userId),
      "refreshTokens.token": token,
    });

    if (!user) {
      // This is the most likely point of failure.
      console.log(
        "[REFRESH_ERROR] User not found with this refresh token. The token may be invalid, expired, or was not saved correctly in the DB."
      );
      // For security, we can clear the cookie
      cookieStore.delete("refreshToken");
      cookieStore.delete("accessToken");
      return sendError("Invalid refresh token. Please log in again.", 401);
    }
    console.log(
      "[REFRESH_SUCCESS] Found user and matching token in the database."
    );

    // 3. Generate a new access token
    console.log("[REFRESH_INFO] Generating new access token...");
    const accessToken = generateAccessToken(user._id);

    // 4. Set the new access token in cookies
    cookieStore.set("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 15 * 60, // 15 minutes
      path: "/",
      sameSite: "strict",
    });
    console.log(
      "[REFRESH_SUCCESS] New access token set in cookies. Refresh successful."
    );
    return sendSuccess({ message: "Access token refreshed successfully" });
  } catch (error) {
    console.error(
      "[REFRESH_FATAL] An error occurred during token refresh:",
      error.message
    );
    // Clear potentially invalid tokens from cookies
    cookieStore.delete("refreshToken");
    cookieStore.delete("accessToken");
    return sendError("Session expired or invalid. Please log in again.", 401);
  }
}
