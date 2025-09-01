// FILE: finance-app/src/lib/auth.js
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

if (!ACCESS_TOKEN_SECRET || !REFRESH_TOKEN_SECRET) {
  throw new Error("Missing JWT secret environment variables.");
}

const accessTokenSecret = new TextEncoder().encode(ACCESS_TOKEN_SECRET);

export const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, ACCESS_TOKEN_SECRET, { expiresIn: "15m" });
};

export const generateRefreshToken = (userId) => {
  return jwt.sign({ userId, jti: nanoid() }, REFRESH_TOKEN_SECRET, {
    expiresIn: "30d",
  });
};

/**
 * A lightweight verifier for the Edge runtime (Middleware).
 * Renamed back to verifyAuth for consistency.
 * It only checks the access token signature and does NOT touch the database.
 */
export const verifyAuth = async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;

  if (!token) return { user: null };

  try {
    const { payload } = await jwtVerify(token, accessTokenSecret);
    return { user: { _id: payload.userId } };
  } catch (err) {
    return { user: null };
  }
};

/**
 * A secure verifier for API Routes (Node.js runtime).
 * It checks the access token AND verifies the refresh token exists in the database.
 */
export const verifySession = async () => {
  const User = (await import("@/models/user.model")).default;
  const dbConnect = (await import("./mongodb")).default;

  const cookieStore = await cookies();
  const accessToken = cookieStore.get("accessToken")?.value;
  const refreshToken = cookieStore.get("refreshToken")?.value;

  if (!accessToken || !refreshToken) {
    return { user: null, error: "Missing tokens" };
  }

  try {
    const decoded = jwt.verify(accessToken, ACCESS_TOKEN_SECRET);
    const userId = decoded.userId;

    await dbConnect();

    const userFromDb = await User.findOne({
      _id: userId,
      "refreshTokens.token": refreshToken,
    });

    if (!userFromDb) {
      return {
        user: null,
        error: "Session invalid. Refresh token not found in DB.",
      };
    }

    return { user: { _id: userId } };
  } catch (error) {
    return { user: null, error: error.message };
  }
};
