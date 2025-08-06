// FILE: src/lib/auth.js
// ** THIS IS THE CORRECTED FILE **
// Uses 'jose' library for all JWT operations to ensure Edge compatibility.

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

// The secret key must be converted to a Uint8Array for the 'jose' library.
const secret = new TextEncoder().encode(process.env.JWT_SECRET);

/**
 * Creates a JWT token.
 * @param {object} payload - The payload to include in the token.
 * @returns {Promise<string>} The generated JWT.
 */
export async function createToken(payload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
  return token;
}

/**
 * Verifies a JWT token.
 * @param {string} token - The JWT to verify.
 * @returns {Promise<object|null>} The decoded payload or null if verification fails.
 */
export async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch (e) {
    console.error("JWT Verification Error:", e.message);
    return null;
  }
}

/**
 * Gets the current user session from the access token cookie.
 * @returns {Promise<object|null>} The session payload or null if not authenticated.
 */
export async function getSession() {
  const tokenCookie = cookies().get("accessToken");
  if (!tokenCookie) {
    return null;
  }
  return await verifyToken(tokenCookie.value);
}
