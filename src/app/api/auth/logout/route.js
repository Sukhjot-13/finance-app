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
    // Even if there's an error, we should proceed to clear cookies
    console.error("Logout error:", error.message);
  } finally {
    // Clear the cookies on the client side regardless
    cookieStore.delete("accessToken");
    cookieStore.delete("refreshToken");
  }

  return sendSuccess({ message: "Logged out successfully" });
}
