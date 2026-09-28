// FILE: finance-app/src/lib/money.js
//
// Server-side money helpers.
//
// CURRENCY ASSUMPTION: every supported currency (USD, INR) is quoted with 2
// decimal places, so minor units are always amount * 100. All arithmetic that
// feeds a report runs in INTEGER minor units and is converted to a decimal
// major value exactly once, at the response boundary. Summing BSON doubles
// (1234.56 + 0.1 + 0.2) drifts to 1234.8600000000002; summing integers
// (123456 + 10 + 20) cannot.

export const CURRENCY_DECIMALS = 2;

/** Minor units per major unit (10 ** CURRENCY_DECIMALS). */
export const MINOR_UNITS = 100;

/** Upper bound for any single stored amount. */
export const MAX_AMOUNT = 1e12;

/**
 * Mongo aggregation expression that yields INTEGER minor units for a
 * transaction document.
 *
 * Prefers the stored `amountMinor`. Documents written before the minor-unit
 * migration fall back to `round(amount * 100)`, so reports stay correct while
 * the migration is pending (and the fallback is still exact integer
 * arithmetic — never a float sum).
 */
export const AMOUNT_MINOR_EXPR = {
  $round: [
    {
      $ifNull: ["$amountMinor", { $multiply: [{ $ifNull: ["$amount", 0] }, MINOR_UNITS] }],
    },
    0,
  ],
};

/**
 * Coerces untrusted input to a usable positive amount.
 *
 * Rejects everything `Number.isFinite` rejects: `NaN`, `Infinity`,
 * `-Infinity`, and numeric strings that overflow to `Infinity` (`"1e400"`).
 * Returns `null` instead of throwing so routes can map it to a 400.
 */
export function coerceAmount(value) {
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT) return null;
  return n;
}

/** Integer minor units for a major-unit amount. Non-finite input → 0. */
export function toMinorUnits(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * MINOR_UNITS);
}

/**
 * Major-unit value for integer minor units. The single division (never a sum
 * of floats) keeps the decimal exact: 30 / 100 === 0.3.
 */
export function fromMinorUnits(minor) {
  const n = Number(minor);
  if (!Number.isFinite(n)) return 0;
  return n / MINOR_UNITS;
}

/**
 * Object.prototype member names that must never be usable as a category.
 *
 * Reports key their spending maps BY CATEGORY NAME. A category named
 * `constructor` made `spendingMap[budget.category] || 0` resolve to the Object
 * constructor, and `acc["__proto__"] = ...` was a silent no-op so that
 * category's spending DISAPPEARED from a financial report. Rejecting the
 * names at the write boundary is the durable fix; the report routes
 * additionally use Object.create(null) + Object.hasOwn as defence in depth.
 */
export const RESERVED_CATEGORY_NAMES = Object.freeze([
  "__proto__",
  "constructor",
  "prototype",
  "toString",
  "valueOf",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
]);

/** Case-insensitive exact match against the reserved names. */
export function isReservedCategoryName(name) {
  if (typeof name !== "string") return false;
  return RESERVED_CATEGORY_NAMES.includes(name.trim());
}

/**
 * Minor units for a document-shaped record, tolerating legacy rows that only
 * have the float `amount`.
 */
export function minorOf(record) {
  if (!record) return 0;
  if (Number.isInteger(record.amountMinor)) return record.amountMinor;
  return toMinorUnits(record.amount);
}
