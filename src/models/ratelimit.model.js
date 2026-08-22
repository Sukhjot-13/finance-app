// FILE: finance-app/src/models/ratelimit.model.js
import mongoose from "mongoose";

// Fixed-collection backing store for auth rate limiting. Replaces in-memory
// Maps so limits survive restarts AND are shared across every serverless
// instance (they all point at the same database).
//
// Sliding-window design: each hit appends a timestamp; consumers count how
// many fall inside their window. `hits` is capped ($slice) so a hostile key
// can't grow a document unboundedly.
const RateLimitSchema = new mongoose.Schema({
  key: { type: String, required: true },
  hits: { type: [Date], default: [] },
  expiresAt: { type: Date, required: true },
});

RateLimitSchema.index({ key: 1 }, { unique: true });

// Unlike subdocument arrays, top-level collections DO support MongoDB TTL
// indexes — MongoDB purges expired documents automatically (sweeper runs
// roughly once a minute).
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.RateLimit ||
  mongoose.model("RateLimit", RateLimitSchema);
