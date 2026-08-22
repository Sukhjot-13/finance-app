// test/suites/api-reports.suite.js — dashboard / budget-progress / generate
import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeQueryBuilder } from "../helpers/mocks.js";

const T = () => globalThis.__models.transaction;
const B = () => globalThis.__models.budget;

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.__verifySessionImpl = vi.fn(async () => ({
    user: { _id: "64b64b64b64b64b64b64b64b" },
  }));
  // Restore deterministic defaults so unconsumed *Once impls from earlier
  // suites/tests can never leak into these routes.
  const Tm = T();
  Tm.aggregate.mockReset();
  Tm.aggregate.mockResolvedValue([]);
  Tm.find.mockReset();
  Tm.find.mockReturnValue(makeQueryBuilder([]));
  B().find.mockReset();
  B().find.mockReturnValue(makeQueryBuilder([]));
});

describe("GET /api/reports/dashboard", () => {
  const get = async (qs) => {
    const { GET } = await import("@/app/api/reports/dashboard/route");
    return GET(new Request(`http://localhost/api/reports/dashboard${qs}`));
  };

  it("computes balance/monthly/breakdown and honors start+end bounds", async () => {
    // Promise.all order: balance → monthly → expenseBreakdown
    T().aggregate
      .mockResolvedValueOnce([{ _id: "income", total: 300 }, { _id: "expense", total: 100 }])
      .mockResolvedValueOnce([{ _id: "income", total: 50 }, { _id: "expense", total: 20 }])
      .mockResolvedValueOnce([
        { category: "Food", total: 15 },
        { category: "Transport", total: 5 },
      ]);
    T().find.mockReturnValueOnce(makeQueryBuilder([{ _id: "r1", type: "expense" }]));

    const res = await get("?start=2026-07-31T18%3A30%3A00Z&end=2026-08-31T18%3A30%3A00Z");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.currentBalance).toBe(200);
    expect(body.monthlyIncome).toBe(50);
    expect(body.monthlyExpenses).toBe(20);
    expect(body.expenseBreakdown).toHaveLength(2);

    // monthly aggregation must use $gte AND $lt with the CLIENT instants
    const monthlyMatch = T().aggregate.mock.calls[1][0][0].$match;
    expect(monthlyMatch.date.$gte).toEqual(new Date("2026-07-31T18:30:00Z"));
    expect(monthlyMatch.date.$lt).toEqual(new Date("2026-08-31T18:30:00Z"));

    // recent transactions capped at 5 (builder the route used)
    const recentBuilder = T().find.mock.results.at(-1).value;
    expect(recentBuilder.limit).toHaveBeenCalledWith(5);
  });

  it("falls back to a server-computed month window without params", async () => {
    T().aggregate.mockResolvedValue([]);
    const res = await get("");
    expect(res.status).toBe(200);

    for (const call of T().aggregate.mock.calls.slice(0, 3)) {
      const match = call[0][0].$match;
      if (match.date) {
        expect(match.date.$gte).toBeInstanceOf(Date);
        expect(match.date.$lt).toBeInstanceOf(Date);
        expect(match.date.$lt.getTime()).toBeGreaterThan(match.date.$gte.getTime());
      }
    }
  });

  it("zero-fills empty aggregations instead of NaN-ing the UI", async () => {
    T().aggregate.mockResolvedValue([]);
    const body = await (await get("")).json();
    expect(body.currentBalance).toBe(0);
    expect(body.monthlyIncome).toBe(0);
    expect(body.monthlyExpenses).toBe(0);
    expect(body.expenseBreakdown).toEqual([]);
  });
});

describe("GET /api/reports/budget-progress", () => {
  const get = async (qs = "") => {
    const { GET } = await import("@/app/api/reports/budget-progress/route");
    return GET(new Request(`http://localhost/api/reports/budget-progress?${qs}`));
  };

  it("blends budgets + spend into overall/category progress with exclusions", async () => {
    B().find.mockReturnValueOnce(
      makeQueryBuilder([
        { category: "__total__", amount: 1000 },
        { category: "Food", amount: 400 },
      ])
    );
    // spending aggregation then excluded-spent aggregation
    T().aggregate
      .mockResolvedValueOnce([{ _id: "Food", spent: 500 }])
      .mockResolvedValueOnce([{ _id: null, spent: 25 }]);

    const body = await (
      await get("start=2026-07-31T00:00Z&end=2026-08-31T00:00Z&month=2026-08")
    ).json();

    expect(B().find).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "64b64b64b64b64b64b64b64b", month: "2026-08" })
    );

    expect(body.overall).toMatchObject({
      budget: 1000,
      spent: 500,
      percentage: 50,
      overBudget: false,
      remaining: 500,
    });
    expect(body.progress[0]).toMatchObject({
      category: "Food",
      budget: 400,
      spent: 500,
      percentage: 100, // capped at 100
      overBudget: true,
    });
    expect(body.totalSpent).toBe(500);
    expect(body.excludedSpent).toBe(25);

    // spending excludes one-time expenses and is end-bounded ($lt)
    const spendMatch = T().aggregate.mock.calls[0][0][0].$match;
    expect(spendMatch.excludeFromBudget).toEqual({ $ne: true });
    expect(spendMatch.date.$lt).toEqual(new Date("2026-08-31T00:00Z"));
  });

  it("falls back to the current month key on invalid month params", async () => {
    B().find.mockReturnValueOnce(makeQueryBuilder([]));
    T().aggregate.mockResolvedValue([]);

    await get("month=garbage");

    expect(B().find.mock.calls[0][0].month).toMatch(/^\d{4}-\d{2}$/);
  });

  it("returns null overall when only no overall budget exists", async () => {
    B().find.mockReturnValueOnce(makeQueryBuilder([]));
    T().aggregate.mockResolvedValue([]);

    const body = await (await get("month=2026-08")).json();
    expect(body.overall).toBeNull();
    expect(body.progress).toEqual([]);
  });
});

describe("POST /api/reports/generate", () => {
  const post = async (body) => {
    const { POST } = await import("@/app/api/reports/generate/route");
    return POST(
      new Request("http://localhost/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
  };

  it("400s on missing or reversed ranges", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ startDate: "2026-08-10", endDate: "2026-08-01" })).status).toBe(400);
  });

  it("prefers browser-timezone instants and sums/sorts breakdowns", async () => {
    T().find.mockResolvedValueOnce([
      { type: "income", amount: 100, category: "Salary" },
      { type: "income", amount: 50, category: "Bonus" },
      { type: "expense", amount: 30, category: "Food" },
      { type: "expense", amount: 70, category: "Food" },
      { type: "expense", amount: 20, category: "Transport" },
    ]);

    const res = await post({
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      startInstant: "2026-07-31T18:30:00.000Z",
      endInstant: "2026-08-31T18:29:59.999Z",
    });
    const body = await res.json();

    expect(T().find.mock.calls[0][0].date.$gte).toEqual(
      new Date("2026-07-31T18:30:00.000Z")
    );
    expect(T().find.mock.calls[0][0].date.$lte).toEqual(
      new Date("2026-08-31T18:29:59.999Z")
    );
    expect(T().find.mock.calls[0][0].userId).toBe("64b64b64b64b64b64b64b64b");

    expect(body.summary).toEqual({ totalIncome: 150, totalExpenses: 120, netSavings: 30 });
    expect(body.expenseDetails[0]).toEqual({ category: "Food", total: 100 }); // sorted desc
    expect(body.incomeDetails[0].source).toBe("Salary");
  });
});
