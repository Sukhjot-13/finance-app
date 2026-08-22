// FILE: finance-app/src/lib/auth.js
import jwt from "jsonwebtoken";
import { randomUUID, createHash } from "crypto";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

// Must match the JWT expiresIn for refresh tokens below
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// How long a rotated-away refresh token still authenticates. This absorbs
// multi-tab races (two tabs refreshing with the same cookie at once) so
// rotation never logs people out. After the grace window a presented
// rotated token is treated as token theft (reuse detection).
export const REFRESH_ROTATION_GRACE_MS = 60 * 1000;

if (!ACCESS_TOKEN_SECRET || !REFRESH_TOKEN_SECRET) {
  throw new Error("Missing JWT secret environment variables.");
}

const accessTokenSecret = new TextEncoder().encode(ACCESS_TOKEN_SECRET);

/**
 * Refresh tokens are stored in MongoDB as SHA-256 hashes — a database leak
 * must not expose usable session tokens. Legacy plaintext entries are still
 * accepted on lookups until they expire naturally.
 */
export const hashToken = (token) =>
  createHash("sha256").update(token).digest("hex");

export const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, ACCESS_TOKEN_SECRET, { expiresIn: "15m" });
};

export const generateRefreshToken = (userId) => {
  return jwt.sign({ userId, jti: randomUUID() }, REFRESH_TOKEN_SECRET, {
    expiresIn: "30d",
  });
};

/**
 * Verifies a JWT token.
 * @param {string} token - The JWT token to verify.
 * @param {string} secret - The secret key to use for verification.
 * @returns {object | null} - The decoded payload or null if invalid.
 */
export function verifyToken(token, secret) {
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    console.error("Token verification failed:", error.message);
    return null;
  }
}

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
 *
 * Returns { user } on success, or { user: null, error, status } where status
 * distinguishes definitive auth failures (401) from infrastructure trouble
 * (503) — so callers never turn a transient DB outage into a forced logout.
 */
export const verifySession = async () => {
  const User = (await import("@/models/user.model")).default;
  const dbConnect = (await import("./mongodb")).default;

  const cookieStore = await cookies();
  const accessToken = cookieStore.get("accessToken")?.value;
  const refreshToken = cookieStore.get("refreshToken")?.value;

  if (!accessToken || !refreshToken) {
    return { user: null, error: "Missing tokens", status: 401 };
  }

  // Signature/expiry problems are definitive auth failures.
  let decoded;
  try {
    decoded = jwt.verify(accessToken, ACCESS_TOKEN_SECRET);
  } catch {
    return { user: null, error: "Invalid or expired access token", status: 401 };
  }

  try {
    await dbConnect();

    const hashedRefresh = hashToken(refreshToken);
    const userFromDb = await User.findOne({
      _id: decoded.userId,
      // Match the hash; legacy plaintext entries still work until they
      // expire or get rotated.
      $or: [
        { "refreshTokens.token": hashedRefresh },
        { "refreshTokens.token": refreshToken },
      ],
    });

    if (!userFromDb) {
      return {
        user: null,
        error: "Session invalid. Refresh token not found in DB.",
        status: 401,
      };
    }

    return { user: { _id: decoded.userId } };
  } catch (error) {
    // DB unreachable / timed out etc. — retryable, not an auth failure.
    console.error("verifySession transient error:", error.message);
    return { user: null, error: "Service temporarily unavailable", status: 503 };
  }
};

/**
 * MongoDB TTL indexes do not work on subdocument arrays, so expired refresh
 * tokens would otherwise live forever. Call this on login and on refresh to
 * pull:
 *  - tokens older than the full TTL, and
 *  - rotated-away tokens past the short rotation-grace window.
 */
export const purgeExpiredRefreshTokens = async (userId) => {
  const User = (await import("@/models/user.model")).default;
  const ttlCutoff = new Date(Date.now() - REFRESH_TOKEN_TTL_MS);
  const graceCutoff = new Date(Date.now() - REFRESH_ROTATION_GRACE_MS);
  await User.updateOne(
    { _id: userId },
    {
      $pull: {
        refreshTokens: {
          $or: [
            { createdAt: { $lt: ttlCutoff } },
            { rotatedAt: { $exists: true, $ne: null, $lt: graceCutoff } },
          ],
        },
      },
    }
  );
};
