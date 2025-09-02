// src/lib/server-utils.js
import { NextResponse } from "next/server";

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
