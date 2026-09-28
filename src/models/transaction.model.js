// FILE: finance-app/src/models/transaction.model.js
import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // Add index for better query performance
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
      // Defense in depth against the "Infinity poisons every aggregate"
    // defect: `v > 0` is TRUE for Infinity, so the number-type check has to
    // be explicit. Any write path that skips route validation still fails
    // here instead of storing a non-finite amount.
      validate: {
        validator: function(v) {
          return Number.isFinite(v) && v > 0;
        },
        message: "Amount must be a positive finite number"
      }
    },
    // INTEGER minor units (cents). All report arithmetic sums this field so
    // float drift (0.1 + 0.2) can never reach a payload. See src/lib/money.js.
    amountMinor: {
      type: Number,
      required: true,
      min: [1, "Amount must be greater than 0"],
      validate: {
        validator: function(v) {
          return Number.isInteger(v) && v > 0;
        },
        message: "amountMinor must be a positive integer in minor units"
      }
    },
    currency: {
      type: String,
      enum: ["USD", "INR"],
      default: "USD",
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
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
    // Which recurring rule materialized this row, and the occurrence it
    // represents. Together they form the uniqueness key that makes
    // materializeDueRules idempotent under concurrent calls (Task 1).
    recurringRuleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Recurring",
      default: null,
    },
    scheduledFor: {
      type: Date,
      default: null,
    },
    // One-time/sudden expenses that should not count toward monthly budget
    // progress. Consumers read it with truthy checks so pre-existing documents
    // (which lack the field entirely) behave as false.
    excludeFromBudget: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for common query patterns. NOTE: these MUST be declared
// via .index() — an `indexes: [...]` schema option is not a valid Mongoose
// option and would silently never create anything.
TransactionSchema.index({ userId: 1, date: -1 });
TransactionSchema.index({ userId: 1, type: 1, date: -1 });

// Second line of defence for recurring materialization. `sparse` so
// hand-created transactions (both fields null) are exempt — a sparse
// compound index only indexes documents that actually carry the key, so
// many ordinary rows can all share the same (null, null) pair.
TransactionSchema.index(
  { recurringRuleId: 1, scheduledFor: 1 },
  { unique: true, sparse: true }
);

// Add a virtual for formatted amount. Reads the integer minor units when
// present so the rendered value can never inherit float drift.
TransactionSchema.virtual('formattedAmount').get(function() {
  if (Number.isInteger(this.amountMinor)) {
    return (this.amountMinor / 100).toFixed(2);
  }
  return this.amount.toFixed(2);
});

// Ensure virtuals are included when converting to JSON
TransactionSchema.set('toJSON', { virtuals: true });

export default mongoose.models.Transaction ||
  mongoose.model("Transaction", TransactionSchema);
