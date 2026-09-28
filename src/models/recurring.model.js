// FILE: finance-app/src/models/recurring.model.js
import mongoose from "mongoose";

// A recurring-transaction rule (e.g. monthly rent, weekly groceries budget).
// Due occurrences are materialized into Transaction documents on login
// (check-on-login pattern — see src/lib/recurring.js), so no cron is needed.
const RecurringSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["income", "expense"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [0.01, "Amount must be greater than 0"],
      validate: {
        validator: function (v) {
          return Number.isFinite(v) && v > 0;
        },
        message: "Amount must be a positive finite number",
      },
    },
    // INTEGER minor units — materialized transactions sum this rather than
    // the float, so repeated materialization cannot introduce float drift.
    amountMinor: {
      type: Number,
      required: true,
      min: [1, "Amount must be greater than 0"],
    },
    currency: {
      type: String,
      enum: ["USD", "INR"],
      default: "USD",
    },
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: [50, "Category name cannot exceed 50 characters"]
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, "Description cannot exceed 200 characters"]
    },
    frequency: {
      type: String,
      enum: ["weekly", "monthly"],
      required: true,
    },
    // Monthly rules run on this day-of-month (1–28 so every month has it).
    dayOfMonth: {
      type: Number,
      min: 1,
      max: 28,
    },
    // Weekly rules run on this day-of-week (0 = Sunday).
    dayOfWeek: {
      type: Number,
      min: 0,
      max: 6,
    },
    // Next occurrence to materialize. Rules with nextRunAt <= now are due.
    nextRunAt: {
      type: Date,
      required: true,
      index: true,
    },
    lastRunAt: {
      type: Date,
      default: null,
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

RecurringSchema.index({ userId: 1, active: 1, nextRunAt: 1 });

export default mongoose.models.Recurring ||
  mongoose.model("Recurring", RecurringSchema);
