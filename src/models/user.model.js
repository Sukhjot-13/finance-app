// models/user.model.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const UserSchema = new mongoose.Schema({
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash OTP before saving
UserSchema.pre("save", async function (next) {
  if (this.isModified("otp") && this.otp) {
    this.otp = await bcrypt.hash(this.otp, 10);
  }
  next();
});

// Method to compare OTP
UserSchema.methods.compareOTP = async function (candidateOTP) {
  return await bcrypt.compare(candidateOTP, this.otp);
};

export default mongoose.models.User || mongoose.model("User", UserSchema);
