// FILE: finance-app/src/models/user.model.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const RefreshTokenSchema = new mongoose.Schema({
  token: { type: String, required: true },
  deviceInfo: { type: String }, // e.g., User-Agent string
  ipAddress: { type: String },
  createdAt: { type: Date, default: Date.now },
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
