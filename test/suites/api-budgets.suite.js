// test/suites/api-budgets.suite.js — src/app/api/budgets/route.js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeQueryBuilder } from "../helpers/mocks.js";

const loadRoute = () => import("@/app/api/budgets/route");

const req = (method, url, body) =>
  new Request(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.__verifySessionImpl = vi.fn(async () => ({ user: { _id: "64b64b64b64b64b64b64b64b" } }));
});

describe("GET /api/budgets", () => {
  it("defaults to the current month when none is sent", async () => {
    // find().lean() is chained → builder, not a bare promise
    globalThis.__models.budget.find.mockReturnValueOnce(makeQueryBuilder([]));
    const { GET } = await loadRoute();

    const res = await GET(req("GET", "http://localhost/api/budgets"));

    expect(res.status).toBe(200);
    const [query] = globalThis.__models.budget.find.mock.calls[0];
    expect(query.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it("uses the requested month verbatim", async () => {
    globalThis.__models.budget.find.mockReturnValueOnce(makeQueryBuilder([]));
    const { GET } = await loadRoute();

    await GET(req("GET", "http://localhost/api/budgets?month=2025-12"));

    const [query] = globalThis.__models.budget.find.mock.calls[0];
    expect(query.month).toBe("2025-12");
    expect(query.userId).toBe("64b64b64b64b64b64b64b64b");
  });
});

describe("POST /api/budgets (M4 type guards)", () => {
  const post = async (body) => {
    const { POST } = await loadRoute();
    return POST(req("POST", "http://localhost/api/budgets", body));
  };

  it.each([
    [{ category: "Food", amount: 10 }, /YYYY-MM format/], // month missing
    [{ amount: 10, month: "2026-08" }, /Category is required/],
    [{ category: "", amount: 10, month: "2026-08" }, /Category is required/],
    [{ category: "Food", month: "2026-08" }, /number of at least 1/],
  ])("rejects invalid payloads: %j", async (body, pattern) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ message: pattern });
  });

  it("rejects non-YYYY-MM months on BOTH insert and update paths", async () => {
    for (const month of ["2026-1", "08-2026", "abc", ""]) {
      const res = await post({ category: "Food", amount: 10, month });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({
        message: /YYYY-MM format/,
      });
    }
  });

  it("rejects amounts that are not finite numbers ≥ 1", async () => {
    for (const amount of ["abc", NaN, 0, -5, Infinity]) {
      globalThis.__models.budget.findOneAndUpdate.mockClear();
      const res = await post({
        category: "Food",
        amount: Number.isNaN(amount) ? "not-a-number" : amount,
        month: "2026-08",
      });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({
        message: /number of at least 1/,
      });
      expect(globalThis.__models.budget.findOneAndUpdate).not.toHaveBeenCalled();
    }
  });

  it("accepts numeric strings by coercing them safely", async () => {
    globalThis.__models.budget.findOneAndUpdate.mockReturnValueOnce(
      makeQueryBuilder({})
    );
    const res = await post({
      category: "  Food  ",
      amount: "50.25",
      month: "2026-08",
    });

    expect(res.status).toBe(200);
    const [filter, update] =
      globalThis.__models.budget.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ userId: "64b64b64b64b64b64b64b64b", category: "Food", month: "2026-08" });
    expect(update).toEqual({ amount: 50.25 });
  });

  it("maps duplicate-key errors to 409", async () => {
    globalThis.__models.budget.findOneAndUpdate.mockRejectedValueOnce(
      Object.assign(new Error("dup"), { code: 11000 })
    );
    const res = await post({ category: "Food", amount: 5, month: "2026-08" });
    expect(res.status).toBe(409);
  });

  it("caps category names at 50 chars like every other entity", async () => {
    const res = await post({
      category: "x".repeat(51),
      amount: 5,
      month: "2026-08",
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/budgets", () => {
  it("requires a category param", async () => {
    const { DELETE } = await loadRoute();
    const res = await DELETE(
      req("DELETE", "http://localhost/api/budgets?month=2026-08")
    );
    expect(res.status).toBe(400);
  });

  it("deletes scoped to the owner and returns success even when absent", async () => {
    globalThis.__models.budget.findOneAndDelete.mockResolvedValueOnce(null);
    const { DELETE } = await loadRoute();

    const res = await DELETE(
      req("DELETE", "http://localhost/api/budgets?category=Food&month=2026-08")
    );

    expect(res.status).toBe(200);
    expect(globalThis.__models.budget.findOneAndDelete).toHaveBeenCalledWith({
      userId: "64b64b64b64b64b64b64b64b",
      category: "Food",
      month: "2026-08",
    });
  });
});
