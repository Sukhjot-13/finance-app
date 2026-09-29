// FILE: finance-app/src/app/api/recurring/route.js
import dbConnect from "@/lib/mongodb";
import Recurring from "@/models/recurring.model";
import { verifySession } from "@/lib/auth";
import { firstRunDate } from "@/lib/recurring";
import { sendError, sendSuccess } from "@/lib/server-utils";
import { coerceAmount, toMinorUnits } from "@/lib/money";
import { logServerError, withManagerLogs } from "@/lib/manager/server";

function validateRuleBody(body) {
  const { type, amount, category, frequency, dayOfMonth, dayOfWeek } = body || {};
  if (type !== "income" && type !== "expense") {
    return "type must be income or expense.";
  }
  const amountNum = coerceAmount(amount);
  if (amountNum === null) {
    return "amount must be a positive number.";
  }
  if (typeof category !== "string" || !category.trim() || category.trim().length > 50) {
    return "category is required (max 50 chars).";
  }
  if (frequency !== "weekly" && frequency !== "monthly") {
    return "frequency must be weekly or monthly.";
  }
  if (frequency === "monthly") {
    const dom = Number(dayOfMonth);
    if (!Number.isInteger(dom) || dom < 1 || dom > 28) {
      return "dayOfMonth must be an integer 1–28 for monthly rules.";
    }
  }
  if (frequency === "weekly") {
    const dow = Number(dayOfWeek);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
      return "dayOfWeek must be an integer 0–6 for weekly rules.";
    }
  }
  if (body.description !== undefined) {
    if (typeof body.description !== "string" || body.description.length > 200) {
      return "description must be a string (max 200 chars).";
    }
  }
  return null;
}

async function handleGET() {
  const { user, status } = await verifySession();
  if (!user) {
    return sendError("Unauthorized", status || 401);
  }
  try {
    await dbConnect();
    const rules = await Recurring.find({ userId: user._id }).sort({ nextRunAt: 1 }).lean();
    return sendSuccess({ rules });
  } catch (error) {
    console.error("GET /api/recurring error:", error.message);
    logServerError("GET /api/recurring error", error, { route: "GET /api/recurring" });
    return sendError("Failed to fetch recurring rules.", 500);
  }
}

async function handlePOST(req) {
  const { user, status } = await verifySession();
  if (!user) {
    return sendError("Unauthorized", status || 401);
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return sendError("Invalid request body.", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return sendError("Invalid request body.", 400);
  }
  const validationError = validateRuleBody(body);
  if (validationError) {
    return sendError(validationError, 400);
  }
  try {
    await dbConnect();
    const rule = new Recurring({
      userId: user._id,
      type: body.type,
      amount: coerceAmount(body.amount),
      amountMinor: toMinorUnits(coerceAmount(body.amount)),
      currency: body.currency === "INR" ? "INR" : "USD",
      category: body.category.trim(),
      description: body.description?.trim() || "",
      frequency: body.frequency,
      dayOfMonth: body.frequency === "monthly" ? Number(body.dayOfMonth) : undefined,
      dayOfWeek: body.frequency === "weekly" ? Number(body.dayOfWeek) : undefined,
      nextRunAt: firstRunDate({
        frequency: body.frequency,
        dayOfMonth: Number(body.dayOfMonth),
        dayOfWeek: Number(body.dayOfWeek),
      }),
      active: true,
    });
    await rule.save();
    return sendSuccess({ rule }, 201);
  } catch (error) {
    console.error("POST /api/recurring error:", error.message);
    logServerError("POST /api/recurring error", error, { route: "POST /api/recurring" });
    return sendError("Failed to create recurring rule.", 500);
  }
}

// Every verb below is wrapped so the request gets a trace-scoped child
// logger, a completion entry with the status it actually produced, and a
// flush scheduled with `after()` once the response completes.
export const GET = withManagerLogs(handleGET);
export const POST = withManagerLogs(handlePOST);
