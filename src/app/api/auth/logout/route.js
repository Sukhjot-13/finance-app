// src/app/api/auth/logout/route.js
import { cookies } from "next/headers";
import { sendSuccess } from "@/lib/server-utils";
import { verifyToken, hashToken } from "@/lib/auth";
import User from "@/models/user.model";
import dbConnect from "@/lib/mongodb";
import { logServerError } from "@/lib/manager";

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
    // The client cookie IS cleared on every path, so a 500 here would be a
    // lie about the client's own state AND left the shell unusable (every
    // subsequent /api/user is 401). Instead the response is 200 with an
    // explicit `revoked: false` + machine-readable code: this device is out,
    // but the server-side session may still be live on OTHER devices.
    console.error("Logout error:", error?.message);
    logServerError("Logout error", error, { route: "POST /api/auth/logout" });
    cookieStore.delete("accessToken");
    cookieStore.delete("refreshToken");
    return sendSuccess({
      message:
        "Signed out on this device, but the server could not end your session. Other devices may still be signed in.",
      revoked: false,
      code: "SERVER_REVOKE_FAILED",
    });
  }

  // Clear the cookies on the client side regardless
  cookieStore.delete("accessToken");
  cookieStore.delete("refreshToken");

  return sendSuccess({ message: "Logged out successfully", revoked: true });
}
