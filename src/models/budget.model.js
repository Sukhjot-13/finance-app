import mongoose from "mongoose";

const BudgetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: [1, "Budget must be at least 1"],
      // `amount > 1` is true for Infinity, so finiteness is explicit.
      validate: {
        validator: function (v) {
          return Number.isFinite(v) && v >= 1;
        },
        message: "Budget must be a finite number of at least 1",
      },
    },
    // INTEGER minor units so budget caps and spend compare exactly.
    amountMinor: {
      type: Number,
      required: false,
      min: [1, "Budget must be at least 1"],
    },
    month: {
      type: String,
      required: true,
      // Strict calendar months: the naive /^\d{4}-\d{2}$/ also accepts
      // "2026-13", which stores budgets no month-scoped query ever shows.
      match: [/^\d{4}-(0[1-9]|1[0-2])$/, "Month must be in YYYY-MM format"],
    },
  },
  { timestamps: true }
);

// Ensure one budget per user per category per month
BudgetSchema.index({ userId: 1, category: 1, month: 1 }, { unique: true });

export default mongoose.models.Budget || mongoose.model("Budget", BudgetSchema);
