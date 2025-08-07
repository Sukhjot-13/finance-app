// src/app/api/auth/logout/route.js
import { cookies } from "next/headers";
import { sendSuccess, sendError, verifyToken } from "@/lib/server-utils";
import User from "@/models/user.model";
import { connectDB } from "@/lib/db";

export async function POST(req) {
  const cookieStore = cookies();
  const refreshToken = cookieStore.get("refreshToken")?.value;

  try {
    await connectDB();
    
    if (refreshToken) {
      // Find the user and remove the specific refresh token
      const decoded = verifyToken(refreshToken, process.env.REFRESH_TOKEN_SECRET);
      if (decoded && decoded.userId) {
        await User.updateOne(
          { _id: decoded.userId },
          { $pull: { refreshTokens: { token: refreshToken } } }
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
