// src/lib/rate-limit.js
//
// MongoDB-backed sliding-window rate limiting for auth endpoints.
//
// Why: in-memory Maps reset on every deploy/restart and are per-instance,
// so limits silently vanish under serverless scaling. A tiny Mongo collection
// shares state across all instances with zero extra infrastructure.
//
// Failure posture: every helper fails OPEN (returns 0 / no-ops) if the
// database is unreachable — a rate limiter must never become the thing that
// locks everyone out of the app during an incident.

import dbConnect from "@/lib/mongodb";
import RateLimit from "@/models/ratelimit.model";

/**
 * Records one hit for `key`. Keeps at most the last 100 timestamps per key.
 */
export async function recordHit(key, windowMs) {
  try {
    const now = new Date();
    await RateLimit.updateOne(
      { key },
      {
        $push: { hits: { $each: [now], $slice: -100 } },
        $set: { expiresAt: new Date(now.getTime() + windowMs) },
      },
      { upsert: true }
    );
  } catch (error) {
    console.error("rate-limit recordHit error:", error.message);
  }
}

/**
 * Number of hits for `key` inside the trailing `windowMs`.
 */
export async function countRecentHits(key, windowMs) {
  try {
    const cutoff = new Date(Date.now() - windowMs);
    const result = await RateLimit.aggregate([
      { $match: { key } },
      {
        $project: {
          n: {
            $size: {
              $filter: {
                input: "$hits",
                as: "h",
                cond: { $gt: ["$$h", cutoff] },
              },
            },
          },
        },
      },
    ]);
    return result[0]?.n || 0;
  } catch (error) {
    console.error("rate-limit countRecentHits error:", error.message);
    return 0;
  }
}

/**
 * Removes the most recent hit — used to refund quota when the guarded
 * operation itself failed (e.g. email send bounced).
 */
export async function popLastHit(key) {
  try {
    await RateLimit.updateOne({ key }, { $pop: { hits: 1 } });
  } catch (error) {
    console.error("rate-limit popLastHit error:", error.message);
  }
}

/**
 * Clears all history for `key` — used on success paths (e.g. correct OTP).
 */
export async function resetKey(key) {
  try {
    await RateLimit.deleteOne({ key });
  } catch (error) {
    console.error("rate-limit resetKey error:", error.message);
  }
}
