// src/app/api/auth/logout-all/route.js
import { cookies } from "next/headers";
import { sendSuccess, sendError, verifyToken } from "@/lib/server-utils";
import User from "@/models/user.model";
import dbConnect from "@/lib/mongodb";

export async function POST(req) {
  const cookieStore = cookies();
  const refreshToken = cookieStore.get("refreshToken")?.value;

  if (!refreshToken) {
    return sendError("Authentication required.", 401);
  }

  try {
    await dbConnect();
    
    const decoded = verifyToken(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    if (!decoded || !decoded.userId) {
      // Clear cookies even if token is invalid
      cookieStore.delete("accessToken");
      cookieStore.delete("refreshToken");
      return sendError("Invalid session. Please log in again.", 401);
    }

    // Find the user and clear all their refresh tokens from the database
    await User.updateOne(
      { _id: decoded.userId },
      { $set: { refreshTokens: [] } } // This empties the array
    );

  } catch (error) {
    console.error("Logout-all error:", error.message);
    // Don't expose server errors, but still clear cookies as a precaution
  } finally {
    // Clear the cookies on the client side regardless of DB operation success
    cookieStore.delete("accessToken");
    cookieStore.delete("refreshToken");
  }

  return sendSuccess({ message: "Successfully logged out from all devices." });
}
