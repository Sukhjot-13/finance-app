// FILE: finance-app/src/models/user.model.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const RefreshTokenSchema = new mongoose.Schema({
  // SHA-256 hash of the JWT (never the raw token) — see lib/auth.js.
  token: { type: String, required: true },
  deviceInfo: { type: String }, // e.g., User-Agent string
  ipAddress: { type: String },
  createdAt: {
    type: Date,
    default: Date.now,
    // NOTE: MongoDB TTL indexes do NOT work on subdocument arrays. Expired
    // tokens are removed by purgeExpiredRefreshTokens() (src/lib/auth.js),
    // called on login and token refresh.
  },
  // Set when this token is rotated away. Within REFRESH_ROTATION_GRACE_MS
  // it still authenticates (multi-tab race absorption); after that it's
  // purged, and presenting it is treated as reuse/theft.
  rotatedAt: { type: Date, default: null },
});

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, "Please provide an email."],
      unique: true,
      match: [/.+\@.+\..+/, "Please fill a valid email address"],
    },
    accountName: {
      type: String,
      default: null,
    },
    // Set once the user finishes OR deliberately skips /welcome. Without it,
    // "skip" users (accountName stays null) were re-prompted on every login.
    onboarded: {
      type: Boolean,
      default: false,
    },
    otp: {
      type: String,
    },
    otpExpires: {
      type: Date,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    currency: {
      type: String,
      enum: ["USD", "INR"],
      default: "USD",
    },
    refreshTokens: [RefreshTokenSchema],
  },
  { timestamps: true }
);

// Hash OTP before saving
UserSchema.pre("save", async function (next) {
  if (this.isModified("otp") && this.otp) {
    const salt = await bcrypt.genSalt(10);
    this.otp = await bcrypt.hash(this.otp, salt);
  }
  next();
});

// Method to compare OTP
UserSchema.methods.compareOtp = async function (candidateOtp) {
  return await bcrypt.compare(candidateOtp, this.otp);
};

export default mongoose.models.User || mongoose.model("User", UserSchema);
