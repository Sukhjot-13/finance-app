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
  // The dashboard also drives the recurring throttle; keep it deterministic
  // and make sure an unconsumed *Once from another suite can't leak in.
  const RLm = globalThis.__models.rateLimit;
  RLm.aggregate.mockReset();
  RLm.aggregate.mockResolvedValue([]);
  RLm.updateOne.mockReset();
  RLm.updateOne.mockResolvedValue({});
});

describe("GET /api/reports/dashboard", () => {
  const get = async (qs) => {
    const { GET } = await import("@/app/api/reports/dashboard/route");
    return GET(new Request(`http://localhost/api/reports/dashboard${qs}`));
  };

  it("computes balance/monthly/breakdown and honors start+end bounds", async () => {
    // Promise.all order: balance → monthly → expenseBreakdown
    // Totals are INTEGER MINOR UNITS (amounts are 2dp, so $300 = 30000).
    T().aggregate
      .mockResolvedValueOnce([
        { _id: "income", totalMinor: 30000 },
        { _id: "expense", totalMinor: 10000 },
      ])
      .mockResolvedValueOnce([
        { _id: "income", totalMinor: 5000 },
        { _id: "expense", totalMinor: 2000 },
      ])
      .mockResolvedValueOnce([
        { category: "Food", totalMinor: 1500 },
        { category: "Transport", totalMinor: 500 },
      ]);
    T().find.mockReturnValueOnce(makeQueryBuilder([{ _id: "r1", type: "expense" }]));

    const res = await get("?start=2026-07-31T18%3A30%3A00Z&end=2026-08-31T18%3A30%3A00Z");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.currentBalance).toBe(200);
    expect(body.monthlyIncome).toBe(50);
    expect(body.monthlyExpenses).toBe(20);
    expect(body.expenseBreakdown).toEqual([
      { category: "Food", total: 15 },
      { category: "Transport", total: 5 },
    ]);

    // monthly aggregation must use $gte AND $lt with the CLIENT instants
    const monthlyMatch = T().aggregate.mock.calls[1][0][0].$match;
    expect(monthlyMatch.date.$gte).toEqual(new Date("2026-07-31T18:30:00Z"));
    expect(monthlyMatch.date.$lt).toEqual(new Date("2026-08-31T18:30:00Z"));

    // recent transactions capped at 5 (builder the route used)
    const recentBuilder = T().find.mock.results.at(-1).value;
    expect(recentBuilder.limit).toHaveBeenCalledWith(5);
  });

  it("0.1 + 0.2 in the balance must NOT produce float drift", async () => {
    T().aggregate.mockResolvedValueOnce([
      { _id: "income", totalMinor: 10 },
      { _id: "expense", totalMinor: 20 },
    ]);
    const body = await (await get("")).json();
    // Integer subtraction then ONE division — never 0.1 - 0.2 in floats.
    expect(body.currentBalance).toBe(-0.1);
    expect(JSON.stringify(body.currentBalance)).toBe("-0.1");
  });

  it("sums MINOR units, never the raw float", async () => {
    await get("");
    const sumExpr = T().aggregate.mock.calls[0][0][1].$group.totalMinor.$sum;
    expect(sumExpr).toMatchObject({ $round: expect.anything(), });
    expect(JSON.stringify(sumExpr)).toContain("$amountMinor");
    expect(JSON.stringify(sumExpr)).toContain("$amount");
  });

  it("falls back to a server-computed month window without params", async () => {    T().aggregate.mockResolvedValue([]);
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

  it("400s present-but-unparseable start/end bounds", async () => {
    const res = await get("?start=nonsense");
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      message: /Invalid date range/,
    });
    expect(T().aggregate).not.toHaveBeenCalled();
  });
  it("zero-fills empty aggregations instead of NaN-ing the UI", async () => {
    T().aggregate.mockResolvedValue([]);
    const body = await (await get("")).json();
    expect(body.currentBalance).toBe(0);
    expect(body.monthlyIncome).toBe(0);
    expect(body.monthlyExpenses).toBe(0);
    expect(body.expenseBreakdown).toEqual([]);
  });

  it("materializes due recurring rules on normal app use (throttled per user)", async () => {
    const RL = globalThis.__models.rateLimit;
    RL.aggregate.mockReset();
    RL.updateOne.mockReset();
    // No hit recorded inside the 60s window → this pass materializes.
    RL.aggregate.mockResolvedValue([]);

    const { GET } = await import("@/app/api/reports/dashboard/route");
    await GET(new Request("http://localhost/api/reports/dashboard"));

    // The throttle key is namespaced per user and recorded in the shared
    // RateLimit collection (a plain recursion would re-scan on every load).
    const recorded = RL.updateOne.mock.calls.map(([filter]) => filter.key);
    expect(recorded.some((k) => k.startsWith("recurring-materialize:"))).toBe(true);
  });

  it("skips materialization inside the throttle window", async () => {
    const RL = globalThis.__models.rateLimit;
    RL.aggregate.mockReset();
    RL.updateOne.mockReset();
    // A hit already exists in the window → nothing recorded, nothing run.
    RL.aggregate.mockResolvedValue([{ n: 1 }]);

    const { GET } = await import("@/app/api/reports/dashboard/route");
    await GET(new Request("http://localhost/api/reports/dashboard"));

    expect(RL.updateOne).not.toHaveBeenCalled();
  });

  it("still serves the dashboard when materialization blows up", async () => {
    const RL = globalThis.__models.rateLimit;
    RL.aggregate.mockResolvedValue([]);
    globalThis.__models.recurring.find.mockRejectedValueOnce(new Error("synthetic recurring read outage"));
    T().aggregate.mockResolvedValue([
      { _id: "income", totalMinor: 1000 },
      { _id: "expense", totalMinor: 400 },
    ]);
    const manager = await import("@/lib/manager/server");
    const report = vi.spyOn(manager, "logServerError").mockImplementation(() => {});
    try {
      const res = await get("");
      expect(res.status).toBe(200);
      expect((await res.json()).currentBalance).toBe(6);
      expect(report).toHaveBeenCalledWith("Recurring materialization on dashboard failed",
        expect.objectContaining({ message: "synthetic recurring read outage" }),
        { route: "GET /api/reports/dashboard" });
    } finally { report.mockRestore(); }
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
        { category: "__total__", amount: 1000, amountMinor: 100000 },
        { category: "Food", amount: 400, amountMinor: 40000 },
      ])
    );
    // spending aggregation then excluded-spent aggregation (minor units)
    T().aggregate
      .mockResolvedValueOnce([{ _id: "Food", spentMinor: 50000 }])
      .mockResolvedValueOnce([{ _id: null, spentMinor: 2500 }]);

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

  it("a category named 'constructor' reports $0, not the Object constructor", async () => {
    B().find.mockReturnValueOnce(
      makeQueryBuilder([{ category: "constructor", amount: 400, amountMinor: 40000 }])
    );
    T().aggregate.mockResolvedValue([]);

    const body = await (await get("month=2026-08")).json();

    const row = body.progress.find((p) => p.category === "constructor");
    expect(row.spent).toBe(0);
    expect(row.percentage).toBe(0);
    expect(row.remaining).toBe(400);
    expect(row.overBudget).toBe(false);
    expect(typeof row.spent).toBe("number");
  });

  it("a category named '__proto__' does not silently lose its spending", async () => {
    B().find.mockReturnValueOnce(
      makeQueryBuilder([{ category: "__proto__", amount: 400, amountMinor: 40000 }])
    );
    T().aggregate.mockResolvedValueOnce([{ _id: "__proto__", spentMinor: 10000 }]);

    const body = await (await get("month=2026-08")).json();

    const row = body.progress.find((p) => p.category === "__proto__");
    expect(row.spent).toBe(100);
    expect(row.percentage).toBe(25);
    expect(body.totalSpent).toBe(100);
  });

  it("a legitimate $0 spend is reported as 0 (Object.hasOwn, not ||)", async () => {
    B().find.mockReturnValueOnce(
      makeQueryBuilder([{ category: "Food", amount: 400, amountMinor: 40000 }])
    );
    T().aggregate.mockResolvedValueOnce([{ _id: "Food", spentMinor: 0 }]);

    const body = await (await get("month=2026-08")).json();
    expect(body.progress[0].spent).toBe(0);
    expect(body.progress[0].percentage).toBe(0);
  });

  it("400s invalid month params instead of silently mixing months", async () => {
    B().find.mockReturnValueOnce(makeQueryBuilder([]));
    T().aggregate.mockResolvedValue([]);

    for (const qs of ["month=garbage", "month=2026-13", "month=2026-1"]) {
      const res = await get(qs);
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({
        message: /YYYY-MM format/,
      });
    }
    expect(B().find).not.toHaveBeenCalled();
  });

  it("derives the budget month from the window start when month is absent", async () => {
    B().find.mockReturnValueOnce(makeQueryBuilder([]));
    T().aggregate.mockResolvedValue([]);

    await get("start=2026-07-31T00:00Z&end=2026-08-31T00:00Z");

    expect(B().find.mock.calls[0][0].month).toBe("2026-07");
  });

  it("400s present-but-unparseable start/end bounds", async () => {
    const res = await get("start=nonsense&month=2026-08");
    expect(res.status).toBe(400);
    expect(T().aggregate).not.toHaveBeenCalled();
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

  it("400s invalid instants and ranges over 3 years", async () => {
    expect(
      (
        await post({
          startDate: "2026-08-01",
          endDate: "2026-08-31",
          startInstant: "not-a-date",
        })
      ).status
    ).toBe(400);
    expect(
      (
        await post({
          startDate: "2020-01-01",
          endDate: "2026-08-31",
          startInstant: "2020-01-01T00:00:00.000Z",
          endInstant: "2026-08-31T23:59:59.999Z",
        })
      ).status
    ).toBe(400);
    expect(T().find).not.toHaveBeenCalled();
  });

  it("prefers browser-timezone instants and sums/sorts breakdowns", async () => {
    T().find.mockResolvedValueOnce([
      { type: "income", amount: 100, amountMinor: 10000, category: "Salary" },
      { type: "income", amount: 50, amountMinor: 5000, category: "Bonus" },
      { type: "expense", amount: 30, amountMinor: 3000, category: "Food" },
      { type: "expense", amount: 70, amountMinor: 7000, category: "Food" },
      { type: "expense", amount: 20, amountMinor: 2000, category: "Transport" },
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

  it("0.1 + 0.2 is exactly 0.3, never 0.30000000000000004", async () => {
    T().find.mockResolvedValueOnce([
      { type: "expense", amount: 0.1, amountMinor: 10, category: "Food" },
      { type: "expense", amount: 0.2, amountMinor: 20, category: "Food" },
    ]);

    const res = await post({ startDate: "2026-08-01", endDate: "2026-08-31" });
    const raw = await res.text();

    expect(raw).not.toContain("0.30000000000000004");
    expect(JSON.parse(raw).summary.totalExpenses).toBe(0.3);
    expect(JSON.parse(raw).expenseDetails[0].total).toBe(0.3);
  });

  it("legacy rows with only the float amount still total exactly", async () => {
    T().find.mockResolvedValueOnce([
      { type: "expense", amount: 0.1, category: "Food" },
      { type: "expense", amount: 0.2, category: "Food" },
    ]);
    const res = await post({ startDate: "2026-08-01", endDate: "2026-08-31" });
    const raw = await res.text();
    expect(raw).not.toContain("0.30000000000000004");
    expect(JSON.parse(raw).summary.totalExpenses).toBe(0.3);
  });

  it("a category named '__proto__' is REPORTED, not silently dropped", async () => {
    T().find.mockResolvedValueOnce([
      { type: "expense", amount: 30, amountMinor: 3000, category: "__proto__" },
      { type: "expense", amount: 5, amountMinor: 500, category: "Food" },
    ]);

    const res = await post({ startDate: "2026-08-01", endDate: "2026-08-31" });
    const body = await res.json();

    // The old `acc["__proto__"] = ...` on a plain {} was a no-op, so this
    // category's spending vanished from a financial report entirely.
    expect(body.expenseDetails).toEqual([
      { category: "__proto__", total: 30 },
      { category: "Food", total: 5 },
    ]);
    expect(body.summary.totalExpenses).toBe(35);
  });

  it("a category named 'constructor' is reported as a number", async () => {
    T().find.mockResolvedValueOnce([
      { type: "expense", amount: 30, amountMinor: 3000, category: "constructor" },
    ]);
    const body = await (await post({ startDate: "2026-08-01", endDate: "2026-08-31" })).json();
    expect(body.expenseDetails[0]).toEqual({ category: "constructor", total: 30 });
  });

  it("400s a literal null body instead of throwing a TypeError 500", async () => {
    const { POST } = await import("@/app/api/reports/generate/route");
    const res = await POST(
      new Request("http://localhost/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "null",
      })
    );
    expect(res.status).toBe(400);
  });
});
