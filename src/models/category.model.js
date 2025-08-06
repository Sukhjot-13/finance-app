// models/category.model.js
import mongoose from "mongoose";

const CategorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    // To distinguish between income and expense categories if needed
    type: String,
    enum: ["income", "expense"],
    required: true,
  },
});

// Ensure a category name is unique per user per type
CategorySchema.index({ userId: 1, name: 1, type: 1 }, { unique: true });

export default mongoose.models.Category ||
  mongoose.model("Category", CategorySchema);
