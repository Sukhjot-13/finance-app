// src/lib/server-utils.js
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

/**
 * Sends a standardized success response.
 * @param {object} data - The payload to send.
 * @param {number} status - The HTTP status code.
 * @returns {NextResponse}
 */
export function sendSuccess(data, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Sends a standardized error response.
 * @param {string} message - The error message.
 * @param {number} status - The HTTP status code.
 * @returns {NextResponse}
 */
export function sendError(message, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Generates a short-lived access token.
 * @param {mongoose.Types.ObjectId} userId - The user's ID.
 * @returns {string}
 */
export function generateAccessToken(userId) {
  return jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "15m", // 15 minutes
  });
}

/**
 * Generates a long-lived refresh token.
 * @param {mongoose.Types.ObjectId} userId - The user's ID.
 * @returns {string}
 */
export function generateRefreshToken(userId) {
  return jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "30d", // 30 days
  });
}

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
