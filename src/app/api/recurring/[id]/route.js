// FILE: finance-app/src/app/api/recurring/[id]/route.js
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import Recurring from "@/models/recurring.model";
import { verifySession } from "@/lib/auth";
import { sendError, sendSuccess } from "@/lib/server-utils";
import { coerceAmount, toMinorUnits } from "@/lib/money";

async function findOwnedRule(id, userId) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  return Recurring.findOne({ _id: id, userId });
}

export async function PATCH(req, { params }) {
  const { user, status } = await verifySession();
  if (!user) {
    return sendError("Unauthorized", status || 401);
  }
  const { id } = await params;
  let body;
  try {
    body = await req.json();
  } catch {
    return sendError("Invalid request body.", 400);
  }
  // A literal `null` body resolves to null without throwing.
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return sendError("Invalid request body.", 400);
  }
  try {
    await dbConnect();
    const rule = await findOwnedRule(id, user._id);
    if (!rule) {
      return sendError("Recurring rule not found.", 404);
    }
    // Editable: amount, category, description, active. Schedule changes go
    // through delete + recreate so nextRunAt stays unambiguous.
    if (body.amount !== undefined) {
      const amountNum = coerceAmount(body.amount);
      if (amountNum === null) {
        return sendError("amount must be a positive number.", 400);
      }
      rule.amount = amountNum;
      rule.amountMinor = toMinorUnits(amountNum);
    }
    if (body.category !== undefined) {
      if (typeof body.category !== "string" || !body.category.trim() || body.category.trim().length > 50) {
        return sendError("category is required (max 50 chars).", 400);
      }
      rule.category = body.category.trim();
    }
    if (body.description !== undefined) {
      if (typeof body.description !== "string" || body.description.length > 200) {
        return sendError("description must be a string (max 200 chars).", 400);
      }
      rule.description = body.description.trim();
    }
    if (body.active !== undefined) {
      rule.active = Boolean(body.active);
    }
    await rule.save();
    return sendSuccess({ rule });
  } catch (error) {
    console.error("PATCH /api/recurring/[id] error:", error.message);
    return sendError("Failed to update recurring rule.", 500);
  }
}

export async function DELETE(_req, { params }) {
  const { user, status } = await verifySession();
  if (!user) {
    return sendError("Unauthorized", status || 401);
  }
  const { id } = await params;
  try {
    await dbConnect();
    const rule = await findOwnedRule(id, user._id);
    if (!rule) {
      return sendError("Recurring rule not found.", 404);
    }
    await Recurring.deleteOne({ _id: rule._id });
    // Already-materialized Transactions are history and stay untouched.
    return sendSuccess({ deleted: true });
  } catch (error) {
    console.error("DELETE /api/recurring/[id] error:", error.message);
    return sendError("Failed to delete recurring rule.", 500);
  }
}
