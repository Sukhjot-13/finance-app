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
      validate: {
        validator: function(v) {
          return v > 0;
        },
        message: "Amount must be a positive number"
      }
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
  },
  { 
    timestamps: true,
    // Add compound index for common queries
    indexes: [
      { userId: 1, date: -1 },
      { userId: 1, type: 1, date: -1 }
    ]
  }
);

// Add a virtual for formatted amount
TransactionSchema.virtual('formattedAmount').get(function() {
  return this.amount.toFixed(2);
});

// Ensure virtuals are included when converting to JSON
TransactionSchema.set('toJSON', { virtuals: true });

export default mongoose.models.Transaction ||
  mongoose.model("Transaction", TransactionSchema);
