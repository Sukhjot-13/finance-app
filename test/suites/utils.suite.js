// test/suites/utils.suite.js — src/lib/utils.js
import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatDateForInput,
  isValidMonthKey,
  utcMonthKey,
} from "@/lib/utils";

describe("formatCurrency", () => {
  it("formats USD with en-US locale", () => {
    expect(formatCurrency(1234.5, "USD")).toBe("$1,234.50");
  });

  it("formats INR with lakh grouping (en-IN)", () => {
    expect(formatCurrency(250000, "INR")).toBe("₹2,50,000.00");
  });

  it("treats null/undefined as zero", () => {
    expect(formatCurrency(null, "USD")).toBe("$0.00");
    expect(formatCurrency(undefined, "USD")).toBe("$0.00");
  });

  it("handles negative amounts", () => {
    expect(formatCurrency(-42, "USD")).toBe("-$42.00");
  });

  it("defaults to USD when currency is omitted", () => {
    expect(formatCurrency(10)).toBe("$10.00");
  });
});

describe("formatDate", () => {
  it("formats an ISO date as 'Month Day, Year'", () => {
    expect(formatDate("2026-03-07T12:00:00Z")).toMatch(
      /March 7, 2026|March 6, 2026/
    );
  });

  it("returns empty string for null/undefined/invalid input", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("not-a-date")).toBe("");
  });
});

describe("formatDateForInput", () => {
  it("produces YYYY-MM-DD using LOCAL date parts", () => {
    expect(formatDateForInput(new Date(2026, 0, 9))).toBe("2026-01-09");
  });

  it("pads single-digit months and days", () => {
    expect(formatDateForInput(new Date(2026, 3, 4))).toBe("2026-04-04");
  });

  it("returns empty string for missing or non-Date values", () => {
    expect(formatDateForInput(null)).toBe("");
    expect(formatDateForInput(undefined)).toBe("");
    expect(formatDateForInput("2026-01-01")).toBe("");
  });
});

describe("isValidMonthKey / utcMonthKey", () => {
  it("accepts real calendar months only", () => {
    expect(isValidMonthKey("2026-08")).toBe(true);
    expect(isValidMonthKey("2026-01")).toBe(true);
    expect(isValidMonthKey("2026-12")).toBe(true);
    expect(isValidMonthKey("2026-13")).toBe(false);
    expect(isValidMonthKey("2026-00")).toBe(false);
    expect(isValidMonthKey("2026-1")).toBe(false);
    expect(isValidMonthKey("08-2026")).toBe(false);
    expect(isValidMonthKey("")).toBe(false);
    expect(isValidMonthKey(null)).toBe(false);
    expect(isValidMonthKey(undefined)).toBe(false);
  });

  it("derives a UTC month key deterministically", () => {
    expect(utcMonthKey(new Date("2026-08-15T12:00:00Z"))).toBe("2026-08");
    expect(utcMonthKey(new Date("2026-01-01T00:30:00Z"))).toBe("2026-01");
  });
});
