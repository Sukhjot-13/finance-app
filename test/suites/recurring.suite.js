// test/suites/recurring.suite.js — src/lib/recurring.js + /api/recurring/* + /api/reports/export
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  advanceRuleDate,
  firstRunDate,
  materializeDueRules,
  MAX_CATCH_UP_RUNS,
} from "@/lib/recurring";
import { sanitizeCsvCell } from "@/app/api/reports/export/route";

const R = () => globalThis.__models.recurring;
const T = () => globalThis.__models.transaction;

const VALID_ID = "64b64b64b64b64b64b64b64b";
const req = (url, method = "GET", body) =>
  new Request(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.__verifySessionImpl = vi.fn(async () => ({ user: { _id: VALID_ID } }));
});

describe("advanceRuleDate", () => {
  it("advances weekly rules by exactly 7 days", () => {
    const from = new Date("2026-09-01T00:00:00.000Z");
    expect(advanceRuleDate(from, "weekly").toISOString()).toBe("2026-09-08T00:00:00.000Z");
  });

  it("advances monthly rules by one calendar month", () => {
    const from = new Date("2026-09-15T00:00:00.000Z");
    expect(advanceRuleDate(from, "monthly").toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });
});

describe("firstRunDate", () => {
  it("schedules monthly rules on dayOfMonth (today counts)", () => {
    const from = new Date("2026-09-15T10:00:00.000Z");
    const run = firstRunDate({ frequency: "monthly", dayOfMonth: 15 }, from);
    expect(run.toISOString()).toBe("2026-09-15T00:00:00.000Z");
  });

  it("pushes past monthly days into next month", () => {
    const from = new Date("2026-09-20T10:00:00.000Z");
    const run = firstRunDate({ frequency: "monthly", dayOfMonth: 5 }, from);
    expect(run.toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });

  it("schedules weekly rules on the next matching weekday", () => {
    // 2026-09-15 is a Tuesday (day 2); next Monday (day 1) is 2026-09-21.
    const from = new Date("2026-09-15T10:00:00.000Z");
    const run = firstRunDate({ frequency: "weekly", dayOfWeek: 1 }, from);
    expect(run.toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });
});

describe("materializeDueRules (injected fakes, no DB)", () => {
  const rule = (overrides = {}) => ({
    _id: "rule-1",
    userId: VALID_ID,
    type: "expense",
    amount: 10,
    category: "Rent",
    description: "",
    frequency: "monthly",
    ...overrides,
  });

  it("creates one transaction per due occurrence and advances past now", async () => {
    const now = new Date("2026-09-26T00:00:00.000Z");
    const created = [];
    const updated = [];
    const fakes = {
      Recurring: {
        find: vi.fn(async () => [rule({ nextRunAt: new Date("2026-08-15T00:00:00.000Z") })]),
        updateOne: vi.fn(async (filter, update) => {
          updated.push(update);
          return {};
        }),
      },
      Transaction: vi.fn(function (data) {
        created.push(data);
        this.save = vi.fn(async () => this);
      }),
      now,
    };
    const count = await materializeDueRules(VALID_ID, fakes);
    // Aug 15 + Sep 15 both due by Sep 26.
    expect(count).toBe(2);
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({ category: "Rent", amount: 10 });
    expect(updated).toHaveLength(1);
    expect(new Date(updated[0].$set.nextRunAt) > now).toBe(true);
  });

  it("caps long absences at MAX_CATCH_UP_RUNS but still advances past now", async () => {
    const now = new Date("2026-09-26T00:00:00.000Z");
    const fakes = {
      Recurring: {
        find: vi.fn(async () => [
          rule({ frequency: "weekly", nextRunAt: new Date("2020-01-01T00:00:00.000Z") }),
        ]),
        updateOne: vi.fn(async () => ({})),
      },
      Transaction: vi.fn(function () {
        this.save = vi.fn(async () => this);
      }),
      now,
    };
    const count = await materializeDueRules(VALID_ID, fakes);
    expect(count).toBe(MAX_CATCH_UP_RUNS);
    const nextRunAt = new Date(fakes.Recurring.updateOne.mock.calls[0][1].$set.nextRunAt);
    expect(nextRunAt > now).toBe(true);
  });

  it("creates nothing when nothing is due", async () => {
    const fakes = {
      Recurring: { find: vi.fn(async () => []), updateOne: vi.fn() },
      Transaction: vi.fn(),
      now: new Date("2026-09-26T00:00:00.000Z"),
    };
    expect(await materializeDueRules(VALID_ID, fakes)).toBe(0);
    expect(fakes.Recurring.updateOne).not.toHaveBeenCalled();
  });
});

describe("recurring API routes", () => {
  const loadRoute = () => import("@/app/api/recurring/route");
  const loadIdRoute = () => import("@/app/api/recurring/[id]/route");

  it("GET requires auth", async () => {
    globalThis.__verifySessionImpl = vi.fn(async () => ({ user: null, status: 401 }));
    const { GET } = await loadRoute();
    expect((await GET()).status).toBe(401);
  });

  it("GET lists the user's rules", async () => {
    R().find.mockReturnValueOnce({
      sort: () => ({ lean: async () => [{ _id: "r1", category: "Rent" }] }),
    });
    const { GET } = await loadRoute();
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.rules).toHaveLength(1);
  });

  it("POST validates the body", async () => {
    const { POST } = await loadRoute();
    for (const body of [
      {},
      { type: "expense", amount: 5, category: "X", frequency: "monthly", dayOfMonth: 31 },
      { type: "expense", amount: -5, category: "X", frequency: "weekly", dayOfWeek: 1 },
      { type: "gift", amount: 5, category: "X", frequency: "weekly", dayOfWeek: 1 },
    ]) {
      expect((await POST(req("http://localhost/api/recurring", "POST", body))).status).toBe(400);
    }
  });

  it("POST creates a monthly rule with a computed first run", async () => {
    R().instanceSave = vi.fn(async function () {
      return this;
    });
    const { POST } = await loadRoute();
    const res = await POST(
      req("http://localhost/api/recurring", "POST", {
        type: "expense",
        amount: 100,
        category: "Rent",
        frequency: "monthly",
        dayOfMonth: 1,
      })
    );
    expect(res.status).toBe(201);
  });

  it("PATCH/DELETE 404 on foreign or missing rules", async () => {
    R().findOne.mockResolvedValue(null);
    const { PATCH, DELETE } = await loadIdRoute();
    const url = `http://localhost/api/recurring/${VALID_ID}`;
    const ctx = { params: Promise.resolve({ id: VALID_ID }) };
    expect((await PATCH(req(url, "PATCH", { amount: 5 }), ctx)).status).toBe(404);
    expect((await DELETE(req(url, "DELETE"), ctx)).status).toBe(404);
  });

  it("PATCH rejects bad amounts", async () => {
    R().findOne.mockResolvedValueOnce({ amount: 5, save: vi.fn(async function () { return this; }) });
    const { PATCH } = await loadIdRoute();
    const res = await PATCH(
      req(`http://localhost/api/recurring/${VALID_ID}`, "PATCH", { amount: 0 }),
      { params: Promise.resolve({ id: VALID_ID }) }
    );
    expect(res.status).toBe(400);
  });
});

describe("reports export", () => {
  it("neutralizes spreadsheet formula injections", () => {
    expect(sanitizeCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(sanitizeCsvCell("+123")).toBe("'+123");
    expect(sanitizeCsvCell("-5")).toBe("'-5");
    expect(sanitizeCsvCell("@user")).toBe("'@user");
    expect(sanitizeCsvCell("plain text")).toBe("plain text");
    expect(sanitizeCsvCell(42)).toBe("42");
  });

  it("GET requires auth", async () => {
    globalThis.__verifySessionImpl = vi.fn(async () => ({ user: null, status: 401 }));
    const { GET } = await import("@/app/api/reports/export/route");
    expect((await GET(req("http://localhost/api/reports/export"))).status).toBe(401);
  });

  it("GET exports transactions as CSV", async () => {
    T().find.mockReturnValueOnce({
      sort: () => ({
        limit: () => ({
          lean: async () => [
            { date: "2026-09-01T00:00:00.000Z", type: "expense", amount: 12.5, category: "Food", description: "=nope" },
          ],
        }),
      }),
    });
    const { GET } = await import("@/app/api/reports/export/route");
    const res = await GET(req("http://localhost/api/reports/export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const text = await res.text();
    expect(text.split("\n")[0]).toBe("date,type,amount,category,description");
    expect(text).toContain("'=nope");
  });

  it("GET rejects bad date bounds", async () => {
    const { GET } = await import("@/app/api/reports/export/route");
    const res = await GET(req("http://localhost/api/reports/export?start=garbage"));
    expect(res.status).toBe(400);
  });
});
