// FILE: finance-app/src/app/api/reports/export/route.js
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import Transaction from "@/models/transaction.model";
import { verifySession } from "@/lib/auth";
import { NextResponse } from "next/server";

// Max rows per export — a full-history dump must not hammer the tier.
const MAX_ROWS = 10000;

/**
 * Neutralize CSV formula injection: exported text is user-writable, and
 * spreadsheet apps execute cells starting with = + - @ (plus tab/CR).
 */
export function sanitizeCsvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    return `'${text}`;
  }
  return text;
}

function toCsvRow(cells) {
  return cells
    .map((cell) => {
      const text = sanitizeCsvCell(cell);
      // Quote when the cell contains a structural character.
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    })
    .join(",");
}

export async function GET(req) {
  const { user, status } = await verifySession();
  if (!user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: status || 401 });
  }

  try {
    await dbConnect();
    const userId = new mongoose.Types.ObjectId(user._id);
    const { searchParams } = new URL(req.url);

    const filter = { userId };
    const parseInstant = (value) => {
      if (!value) return null;
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? null : parsed;
    };
    const start = parseInstant(searchParams.get("start"));
    const end = parseInstant(searchParams.get("end"));
    if ((searchParams.get("start") && !start) || (searchParams.get("end") && !end)) {
      return NextResponse.json(
        { message: "Invalid date range. Use ISO date strings." },
        { status: 400 }
      );
    }
    if (start || end) {
      filter.date = {};
      if (start) filter.date.$gte = start;
      if (end) filter.date.$lt = end;
    }
    const type = searchParams.get("type");
    if (type === "income" || type === "expense") {
      filter.type = type;
    }

    const docs = await Transaction.find(filter)
      .sort({ date: -1 })
      .limit(MAX_ROWS + 1)
      .lean();
    const truncated = docs.length > MAX_ROWS;
    const rows = docs.slice(0, MAX_ROWS);

    const header = ["date", "type", "amount", "category", "description"];
    const lines = [header.join(",")];
    for (const tx of rows) {
      lines.push(
        toCsvRow([
          tx.date ? new Date(tx.date).toISOString() : "",
          tx.type || "",
          tx.amount ?? "",
          tx.category || "",
          tx.description || "",
        ])
      );
    }

    return new NextResponse(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="fintrack-transactions.csv"',
        "Cache-Control": "no-store",
        ...(truncated ? { "X-Export-Truncated": "true" } : {}),
      },
    });
  } catch (error) {
    console.error("GET /api/reports/export error:", error.message);
    return NextResponse.json({ message: "Failed to export transactions." }, { status: 500 });
  }
}
