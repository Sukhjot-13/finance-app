// src/app/api/auth/refresh/route.js
//
// Refresh flow with rotation + grace window + reuse detection:
// 1. The presented refresh token is verified (JWT) and looked up in the DB
//    by its SHA-256 hash (legacy plaintext entries still accepted).
// 2. ACTIVE token  -> rotate: old entry is marked `rotatedAt`, a fresh
//    token is stored (hashed) and set as the cookie.
// 3. ROTATED token within the grace window -> concurrent tab / duplicate
//    request: issue only a new ACCESS token, touch nothing else.
// 4. ROTATED token past the grace window -> reuse after grace = treated as
//    theft: every session for the user is revoked, cookies cleared.
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import dbConnect from "@/lib/mongodb";
import User from "@/models/user.model";
import { sendError, sendSuccess } from "@/lib/server-utils";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  purgeExpiredRefreshTokens,
  REFRESH_ROTATION_GRACE_MS,
} from "@/lib/auth";

export async function POST() {
  const cookieStore = await cookies();
  const rawToken = await cookieStore.get("refreshToken")?.value;

  if (!rawToken) {
    return sendError("Refresh token not found. Please log in.", 401);
  }

  // 1. Verify the refresh token signature and expiry. Only a bad token may
  // clear cookies — a transient DB error below must not log the user out.
  let decoded;
  try {
    decoded = jwt.verify(rawToken, process.env.REFRESH_TOKEN_SECRET);
  } catch (error) {
    console.error("Refresh token verification failed:", error.message);
    cookieStore.delete("refreshToken");
    cookieStore.delete("accessToken");
    return sendError("Session expired or invalid. Please log in again.", 401);
  }

  try {
    // 2. Find the user and the matching session entry.
    // dbConnect is INSIDE the try: a DB outage must surface as a retryable
    // 500, never as an unhandled throw that bypasses this handler.
    await dbConnect();

    const hashedRaw = hashToken(rawToken);
    const user = await User.findOne({
      _id: decoded.userId,
      $or: [
        { "refreshTokens.token": hashedRaw },
        { "refreshTokens.token": rawToken }, // legacy plaintext entries
      ],
    });

    if (!user) {
      // Token invalid or revoked server-side. Clear cookies.
      cookieStore.delete("refreshToken");
      cookieStore.delete("accessToken");
      return sendError("Invalid refresh token. Please log in again.", 401);
    }

    const sessionEntry = user.refreshTokens.find(
      (t) => t.token === hashedRaw || t.token === rawToken
    );

    const rotatedAt = sessionEntry?.rotatedAt
      ? new Date(sessionEntry.rotatedAt).getTime()
      : null;
    const isRotatedToken = rotatedAt !== null;

    if (isRotatedToken && Date.now() - rotatedAt >= REFRESH_ROTATION_GRACE_MS) {
      // Reuse of a rotated token AFTER the grace window — treat as theft.
      // Revoke every session for this user, not just this one.
      console.warn(
        "Refresh-token reuse detected — revoking all sessions for user",
        String(decoded.userId)
      );
      await User.updateOne(
        { _id: decoded.userId },
        { $set: { refreshTokens: [] } }
      );
      cookieStore.delete("refreshToken");
      cookieStore.delete("accessToken");
      return sendError("Session expired or invalid. Please log in again.", 401);
    }

    if (!isRotatedToken) {
      // 3. Active token — rotate it: mark this entry rotated and store the
      // new one (hashed). Two ops because Mongo forbids pull+push on the
      // same array in one update; both target exactly this entry.
      const newRefreshToken = generateRefreshToken(user._id);
      await User.updateOne(
        {
          _id: decoded.userId,
          refreshTokens: { $elemMatch: { token: sessionEntry.token } },
        },
        { $set: { "refreshTokens.$.rotatedAt": new Date() } }
      );
      await User.updateOne(
        { _id: decoded.userId },
        { $push: { refreshTokens: { token: hashToken(newRefreshToken) } } }
      );

      // sameSite "lax" — strict broke top-level arrivals from external
      // links (cookies withheld → proxy treated the user as anonymous).
      // Lax keeps cross-site POSTs cookieless, so CSRF safety is unchanged.
      cookieStore.set("refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 30 * 24 * 60 * 60, // 30 days
        path: "/",
        sameSite: "lax",
      });
    }
    // Rotated-but-within-grace: fall through and just mint an access token.

    // 4. Issue a fresh access token
    const accessToken = generateAccessToken(user._id);

    cookieStore.set("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 15 * 60, // 15 minutes
      path: "/",
      sameSite: "lax",
    });

    // 5. Opportunistically prune expired + rotated-past-grace tokens (TTL
    // indexes don't work on subdocument arrays). Best-effort; non-fatal.
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
