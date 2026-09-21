// src/app/api/auth/logout/route.js
import { cookies } from "next/headers";
import { sendSuccess, sendError } from "@/lib/server-utils";
import { verifyToken, hashToken } from "@/lib/auth";
import User from "@/models/user.model";
import dbConnect from "@/lib/mongodb";

export async function POST(req) {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("refreshToken")?.value;

  try {
    await dbConnect();

    if (refreshToken) {
      // Remove this session's token from the DB. Stored entries are hashes;
      // the raw value is included for pre-hashing legacy sessions.
      const decoded = verifyToken(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET
      );
      if (decoded && decoded.userId) {
        await User.updateOne(
          { _id: decoded.userId },
          {
            $pull: {
              refreshTokens: { token: { $in: [hashToken(refreshToken), refreshToken] } },
            },
          }
        );
      }
    }
  } catch (error) {
    // Honest failure: the server-side session may still be live, so report
    // a 500 — but still clear this device's cookies so the local logout
    // always takes effect here (mirrors logout-all's contract).
    console.error("Logout error:", error.message);
    cookieStore.delete("accessToken");
    cookieStore.delete("refreshToken");
    return sendError(
      "Could not complete server-side logout. This device was logged out locally — please log in and use 'Log Out From All Devices' if this is a shared device.",
      500
    );
  }

  // Clear the cookies on the client side regardless
  cookieStore.delete("accessToken");
  cookieStore.delete("refreshToken");

  return sendSuccess({ message: "Logged out successfully" });
}
