// src/lib/rate-limit.js
//
// MongoDB-backed sliding-window rate limiting for auth endpoints.
//
// Why: in-memory Maps reset on every deploy/restart and are per-instance,
// so limits silently vanish under serverless scaling. A tiny Mongo collection
// shares state across all instances with zero extra infrastructure.
//
// Failure posture: every helper fails OPEN (returns 0 / no-ops / allows) if
// the database is unreachable — a rate limiter must never become the thing
// that locks everyone out of the app during an incident. This is safe to do
// because every operation guarded by these helpers (OTP send/verify) ALSO
// requires the database to succeed — during a DB outage the guarded
// operation itself fails, so fail-open can never grant access, it only
// avoids masking the real outage with spurious 429s.

import dbConnect from "@/lib/mongodb";
import RateLimit from "@/models/ratelimit.model";

/**
 * Records one hit for `key`. Keeps at most the last 100 timestamps per key.
 */
export async function recordHit(key, windowMs) {
  try {
    await dbConnect();
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
    await dbConnect();
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
 * Resolves the caller IP for rate-limit bucketing.
 *
 * SECURITY: never trust the FIRST x-forwarded-for entry — any client can
 * prepend arbitrary values to that header. `x-real-ip` is set by our hosting
 * edge from the actual TCP peer, so prefer it; otherwise use the LAST
 * x-forwarded-for entry (appended by the closest proxy, not spoofable by
 * the client). Worst case the bucket key is coarse — the per-email bucket
 * (derived from validated input, not headers) remains the authoritative one.
 */
export function getClientIp(request) {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "unknown";
}

/**
 * Atomic record-then-count for a sliding-window check.
 *
 * The old count-then-record pattern had a check-then-act race: concurrent
 * requests could all observe N-1 and all pass. Recording FIRST (a single
 * atomic $push) and then counting means every in-flight request is visible
 * to the others, so bursts can no longer slip under the cap.
 *
 * Semantics: allows up to `max` hits per window; the (max+1)-th is denied.
 * Rejected requests stay recorded (standard over-count-by-one); successful
 * operations should refund via popLastHit / resetKey as before.
 *
 * Returns { allowed, count }. Fails OPEN (allowed:true) on DB errors.
 */
export async function recordHitAndCount(key, windowMs, max) {
  try {
    await dbConnect();
    const now = new Date();
    await RateLimit.updateOne(
      { key },
      {
        $push: { hits: { $each: [now], $slice: -100 } },
        $set: { expiresAt: new Date(now.getTime() + windowMs) },
      },
      { upsert: true }
    );
    const cutoff = new Date(now.getTime() - windowMs);
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
    const count = result[0]?.n || 0;
    return { allowed: count <= max, count };
  } catch (error) {
    console.error("rate-limit recordHitAndCount error:", error.message);
    return { allowed: true, count: 0 };
  }
}

/**
 * Removes the most recent hit — used to refund quota when the guarded
 * operation itself failed (e.g. email send bounced).
 */
export async function popLastHit(key) {
  try {
    await dbConnect();
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
    await dbConnect();
    await RateLimit.deleteOne({ key });
  } catch (error) {
    console.error("rate-limit resetKey error:", error.message);
  }
}
