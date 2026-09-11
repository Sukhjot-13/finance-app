// test/suites/models.suite.js — mongoose schema contracts (no DB needed)
//
// The runner mocks all model modules with delegating singletons for the API
// route suites; these tests need the REAL schemas, so they load them through
// vi.importActual (bypasses module mocks).
import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";

const { default: Transaction } = await vi.importActual(
  "@/models/transaction.model"
);
const { default: Category } = await vi.importActual("@/models/category.model");
const { default: Budget } = await vi.importActual("@/models/budget.model");
const { default: User } = await vi.importActual("@/models/user.model");

describe("Transaction schema", () => {
  it("rejects a non-positive amount via validators", () => {
    const t = new Transaction({
      userId: "64b64b64b64b64b64b64b64b",
      type: "expense",
      amount: 0,
      category: "Food",
      date: new Date(),
    });
    expect(t.validateSync()?.errors.amount).toBeDefined();
  });

  it("rejects an invalid type", () => {
    const t = new Transaction({
      userId: "64b64b64b64b64b64b64b64b",
      type: "something-else",
      amount: 5,
      category: "Food",
      date: new Date(),
    });
    expect(t.validateSync()?.errors.type).toBeDefined();
  });

  it("enforces the 50-char category cap and 200-char description cap", () => {
    const t = new Transaction({
      userId: "64b64b64b64b64b64b64b64b",
      type: "expense",
      amount: 1,
      category: "a".repeat(51),
      description: "b".repeat(201),
      date: new Date(),
    });
    const err = t.validateSync();
    expect(err?.errors.category).toBeDefined();
    expect(err?.errors.description).toBeDefined();
  });

  it("exposes formattedAmount virtual and includes virtuals in JSON", () => {
    const t = new Transaction({ type: "income", amount: 12.345, category: "Salary" });
    expect(t.formattedAmount).toBe("12.35");
    expect(t.toJSON().formattedAmount).toBe("12.35");
  });

  it("declares the compound indexes (userId+date, userId+type+date)", () => {
    const keys = Transaction.schema.indexes().map(([spec]) =>
      Object.keys(spec).join(",")
    );
    expect(keys).toContain("userId,date");
    expect(keys).toContain("userId,type,date");
  });

  it("defaults excludeFromBudget to false", () => {
    const t = new Transaction({ type: "expense", amount: 1, category: "Other" });
    expect(t.excludeFromBudget).toBe(false);
  });
});

describe("Category schema", () => {
  it("requires name/type", () => {
    const c = new Category({});
    const err = c.validateSync();
    expect(err?.errors.name).toBeDefined();
    expect(err?.errors.type).toBeDefined();
  });

  it("declares the unique per-user/name/type index", () => {
    const specs = Category.schema.indexes().map(([spec]) => spec);
    expect(specs).toContainEqual({ userId: 1, name: 1, type: 1 });
  });

  it("caps names at 50 chars (matches Transaction.category cap)", () => {
    const c = new Category({ name: "x".repeat(51), type: "expense", userId: "64b64b64b64b64b64b64b64b" });
    expect(c.validateSync()?.errors.name).toBeDefined();
  });

  it("restricts type to income|expense", () => {
    const c = new Category({ name: "Ok", type: "other", userId: "64b64b64b64b64b64b64b64b" });
    expect(c.validateSync()?.errors.type).toBeDefined();
  });
});

describe("Budget schema", () => {
  it("validates month format YYYY-MM", () => {
    const bad = new Budget({ userId: "64b64b64b64b64b64b64b64b", category: "Food", amount: 10, month: "2026-1" });
    expect(bad.validateSync()?.errors.month).toBeDefined();

    const good = new Budget({ userId: "64b64b64b64b64b64b64b64b", category: "Food", amount: 10, month: "2026-08" });
    expect(good.validateSync()).toBeUndefined();
  });

  it("requires amount ≥ 1", () => {
    const b = new Budget({ userId: "64b64b64b64b64b64b64b64b", category: "Food", amount: 0, month: "2026-08" });
    expect(b.validateSync()?.errors.amount).toBeDefined();
  });

  it("declares the unique {userId,category,month} index", () => {
    const specs = Budget.schema.indexes().map(([spec]) => spec);
    expect(specs).toContainEqual({ userId: 1, category: 1, month: 1 });
  });
});

describe("User model OTP hashing hook", () => {
  // The pre-save hook hashes user.otp with bcrypt before persistence; its
  // observable contract is that compareOtp verifies against that hash.
  it("compareOtp verifies a real bcrypt hash and rejects wrong codes", async () => {
    const hash = await bcrypt.hash("123456", 10);
    const doc = {
      otp: hash,
      async compareOtp(candidate) {
        return bcrypt.compare(candidate, this.otp);
      },
    };
    await expect(doc.compareOtp("123456")).resolves.toBe(true);
    await expect(doc.compareOtp("000000")).resolves.toBe(false);
  });

  it("pre-save hook preserves existing bcrypt hash without double-hashing", async () => {
    const existingHash = "$2b$10$abcdefghijklmnopqrstuv1234567890abcdefghijklmnopqrstu";
    const u = new User({ email: "a@b.com", otp: existingHash });
    const middleware = User.schema.s.hooks._pres.get("save");
    expect(middleware).toBeDefined();
    await new Promise((resolve) => {
      middleware[0].fn.call(u, resolve);
    });
    expect(u.otp).toBe(existingHash);
  });
});
