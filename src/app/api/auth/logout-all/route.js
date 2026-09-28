// src/app/api/auth/logout-all/route.js
import { cookies } from "next/headers";
import { sendSuccess, sendError } from "@/lib/server-utils";
import { verifyToken } from "@/lib/auth";
import User from "@/models/user.model";
import dbConnect from "@/lib/mongodb";

export async function POST(req) {
  const cookieStore = await cookies();
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
    // Same contract as /api/auth/logout: this device is genuinely signed
    // out (cookies cleared), so return 200 with an explicit `revoked: false`
    // + machine-readable code rather than a 500 that contradicts the
    // response the client actually needs to act on.
    console.error("Logout-all error:", error?.message);
    return sendSuccess({
      message:
        "Signed out on this device, but other devices may still be signed in. Please log back in and try again.",
      revoked: false,
      code: "SERVER_REVOKE_ALL_FAILED",
    });
  } finally {
    // Clear the cookies on the client side regardless of DB operation success
    cookieStore.delete("accessToken");
    cookieStore.delete("refreshToken");
  }

  return sendSuccess({
    message: "Successfully logged out from all devices.",
    revoked: true,
  });
}
