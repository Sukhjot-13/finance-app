// test/suites/recurring.suite.js — src/lib/recurring.js + /api/recurring/* + /api/reports/export
import { describe, it, expect, beforeEach, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  advanceRuleDate,
  firstRunDate,
  materializeDueRules,
  MAX_CATCH_UP_RUNS,
} from "@/lib/recurring";
import { sanitizeCsvCell, toCsvRow } from "@/app/api/reports/export/route";
import {
  coerceAmount,
  fromMinorUnits,
  isReservedCategoryName,
  RESERVED_CATEGORY_NAMES,
  toMinorUnits,
  AMOUNT_MINOR_EXPR,
} from "@/lib/money";

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

describe("money helpers", () => {
  it("coerceAmount rejects every non-finite / overflow form", () => {
    for (const bad of [
      "Infinity",
      "-Infinity",
      "1e400",
      "-1e400",
      "NaN",
      NaN,
      Infinity,
      -Infinity,
      0,
      -5,
      "",
      "   ",
      null,
      undefined,
      {},
      1e13, // above MAX_AMOUNT
    ]) {
      expect(coerceAmount(bad)).toBeNull();
    }
  });

  it("coerceAmount accepts positive decimals and numeric strings", () => {
    expect(coerceAmount(5)).toBe(5);
    expect(coerceAmount("42.50")).toBe(42.5);
    expect(coerceAmount(0.01)).toBe(0.01);
    expect(coerceAmount("1e3")).toBe(1000);
    expect(typeof coerceAmount("42.50")).toBe("number");
  });

  it("0.1 + 0.2 in minor units is exactly 0.3", () => {
    const total = toMinorUnits(0.1) + toMinorUnits(0.2);
    expect(total).toBe(30);
    expect(fromMinorUnits(total)).toBe(0.3);
    expect(String(fromMinorUnits(total))).toBe("0.3");
    // the float version is what we are avoiding
    expect(0.1 + 0.2).toBe(0.30000000000000004);
  });

  it("rounds half-up at the write boundary", () => {
    expect(toMinorUnits(12.345)).toBe(1235);
    expect(toMinorUnits("99.999")).toBe(10000);
    expect(toMinorUnits(Infinity)).toBe(0);
    expect(fromMinorUnits(undefined)).toBe(0);
  });

  it("the aggregation expression prefers amountMinor and rounds the legacy float", () => {
    const json = JSON.stringify(AMOUNT_MINOR_EXPR);
    expect(json).toContain("$amountMinor");
    expect(json).toContain("$amount");
    expect(AMOUNT_MINOR_EXPR.$round[1]).toBe(0);
  });

  it("flags every reserved category name", () => {
    for (const name of [
      "__proto__",
      "constructor",
      "prototype",
      "toString",
      "valueOf",
      "hasOwnProperty",
    ]) {
      expect(isReservedCategoryName(name)).toBe(true);
      expect(RESERVED_CATEGORY_NAMES).toContain(name);
    }
    for (const name of ["Food", "Rent", " constructor ", "", null, 7]) {
      if (name === " constructor ") continue; // trimmed match is still reserved
      expect(isReservedCategoryName(name)).toBe(false);
    }
    expect(isReservedCategoryName(" constructor ")).toBe(true);
  });
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

describe("recurring date math is timezone-independent", () => {
  // The engine previously mixed UTC (firstRunDate) with LOCAL setters
  // (advanceRuleDate), so a server west of UTC resolved runs to the previous
  // day-of-month and — because the drifted value was written back as the new
  // nextRunAt — the error was permanent. Run the REAL module source under
  // several timezones and assert the UTC day-of-month never moves.
  const runUnderTz = (tz) => {
    const file = path.resolve(import.meta.dirname, "../../src/lib/recurring.js");
    // Strip the ESM plumbing so the REAL source text can be evaluated in a
    // child process whose TZ we control (the suite itself is a single
    // long-lived process with one fixed timezone).
    const src = readFileSync(file, "utf8")
      .replace(/^import[^\n]*\n/gm, "")
      .replace(/^export\s+/gm, "");
    const loader = `
      const src = ${JSON.stringify(src)};
      const mod = new Function(src + "\\nreturn { advanceRuleDate, firstRunDate };")();
      const out = [];
      for (const iso of ["2026-01-31T00:00:00.000Z","2026-03-15T00:00:00.000Z","2026-10-31T00:00:00.000Z"]) {
        const d = new Date(iso);
        out.push({
          iso,
          monthly: mod.advanceRuleDate(d, "monthly").toISOString(),
          weekly: mod.advanceRuleDate(d, "weekly").toISOString(),
        });
      }
      const seeded = mod.firstRunDate({ frequency: "monthly", dayOfMonth: 15 }, new Date("2026-09-20T10:00:00.000Z"));
      process.stdout.write(JSON.stringify({ out, seeded: seeded.toISOString() }));
    `;
    const stdout = execFileSync(process.execPath, ["-e", loader], {
      env: { ...process.env, TZ: tz },
      encoding: "utf8",
    });
    return JSON.parse(stdout);
  };

  const ZONES = [
    "America/Los_Angeles",
    "Asia/Kolkata",
    "Pacific/Kiritimati",
    "UTC",
  ];

  it.each(ZONES)("produces identical UTC instants under TZ=%s", (tz) => {
    const { out, seeded } = runUnderTz(tz);

    expect(seeded).toBe("2026-10-15T00:00:00.000Z");

    // A LOCAL setter resolves 2026-03-15 midnight UTC to 2026-03-14 in
    // America/Los_Angeles, permanently losing a day per step.
    const march = out.find((r) => r.iso.startsWith("2026-03-15"));
    expect(march.monthly).toBe("2026-04-15T00:00:00.000Z");
    expect(march.weekly).toBe("2026-03-22T00:00:00.000Z");

    // Month-end is a pure overflow rule (dayOfMonth is capped at 28 so it
    // cannot actually occur), asserted so the TZ-independence is explicit.
    const jan = out.find((r) => r.iso.startsWith("2026-01-31"));
    expect(jan.monthly).toBe("2026-03-03T00:00:00.000Z");
    const oct = out.find((r) => r.iso.startsWith("2026-10-31"));
    expect(oct.monthly).toBe("2026-12-01T00:00:00.000Z");
  });

  it("repeated weekly steps never drift off the UTC day", () => {
    for (const tz of ZONES) {
      const { out } = runUnderTz(tz);
      const seed = out.find((r) => r.iso.startsWith("2026-03-15"));
      expect(seed.weekly).toBe("2026-03-22T00:00:00.000Z");
    }
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

  /** Fake model set whose findOneAndUpdate honours the nextRunAt guard. */
  const makeFakes = ({ rules, now, saveImpl }) => {
    const state = new Map(rules.map((r) => [r._id, { ...r }]));
    const created = [];
    const attempted = [];
    const persisted = new Set();
    const fakes = {
      created, attempted,
      state,
      Recurring: {
        find: vi.fn(async () => [...state.values()].filter(r => r.nextRunAt <= now).map(r => ({ ...r }))),
        findOneAndUpdate: vi.fn(async (filter, update) => {
          const current = state.get(filter._id);
          if (!current) return null;
          // The real atomic guard: only match when nextRunAt is unchanged.
          if (
            new Date(current.nextRunAt).getTime() !==
            new Date(filter.nextRunAt).getTime()
          ) {
            return null;
          }
          Object.assign(current, update.$set);
          return { ...current };
        }),
        updateOne: vi.fn(async () => ({})),
      },
      Transaction: vi.fn(function (data) {
        attempted.push(data);
        Object.assign(this, data);
        this.save = vi.fn(async () => {
          const key = `${data.recurringRuleId}:${data.scheduledFor.toISOString()}`;
          if (persisted.has(key)) throw Object.assign(new Error("duplicate occurrence"), {
            code: 11000, keyPattern: { recurringRuleId: 1, scheduledFor: 1 },
          });
          const result = saveImpl ? await saveImpl.call(this) : this;
          persisted.add(key);
          created.push(data);
          return result;
        });
      }),
      now,
    };
    return fakes;
  };

  it("creates one transaction per due occurrence and advances past now", async () => {
    const now = new Date("2026-09-26T00:00:00.000Z");
    const fakes = makeFakes({
      rules: [rule({ nextRunAt: new Date("2026-08-15T00:00:00.000Z") })],
      now,
    });

    const count = await materializeDueRules(VALID_ID, fakes);

    // Aug 15 + Sep 15 both due by Sep 26.
    expect(count).toBe(2);
    expect(fakes.created).toHaveLength(2);
    expect(fakes.created[0]).toMatchObject({
      category: "Rent",
      amount: 10,
      amountMinor: 1000,
      currency: "USD",
      recurringRuleId: "rule-1",
    });
    // Conditional schedule commit after all writes, never an unconditional $set.
    const [commitFilter, commitUpdate] =
      fakes.Recurring.findOneAndUpdate.mock.calls[0];
    expect(commitFilter).toEqual({
      _id: "rule-1",
      nextRunAt: new Date("2026-08-15T00:00:00.000Z"),
    });
    expect(new Date(commitUpdate.$set.nextRunAt) > now).toBe(true);
  });

  it("stamps each occurrence with a distinct scheduledFor", async () => {
    const now = new Date("2026-09-26T00:00:00.000Z");
    const fakes = makeFakes({
      rules: [rule({ nextRunAt: new Date("2026-08-15T00:00:00.000Z") })],
      now,
    });
    await materializeDueRules(VALID_ID, fakes);
    const scheduled = fakes.created.map((c) => c.scheduledFor.toISOString());
    expect(scheduled).toEqual([
      "2026-08-15T00:00:00.000Z",
      "2026-09-15T00:00:00.000Z",
    ]);
    expect(new Set(scheduled).size).toBe(2);
  });

  it("a second completed pass inserts nothing", async () => {
    const now = new Date("2026-09-26T00:00:00.000Z");
    const fakes = makeFakes({
      rules: [rule({ nextRunAt: new Date("2026-08-15T00:00:00.000Z") })],
      now,
    });

    // The second pass reads the future schedule committed by the first.
    const first = await materializeDueRules(VALID_ID, fakes);
    const second = await materializeDueRules(VALID_ID, fakes);

    expect(first).toBe(2);
    // The rule's nextRunAt is now in the future, so the second pass plans
    // zero occurrences and never attempts another schedule commit.
    expect(second).toBe(0);
    expect(fakes.created).toHaveLength(2);
  });

  it("a stale schedule commit does not erase durable occurrences", async () => {
    const now = new Date("2026-09-26T00:00:00.000Z");
    const fakes = makeFakes({ rules: [rule({ nextRunAt: new Date("2026-08-15T00:00:00.000Z") })], now });
    fakes.Recurring.findOneAndUpdate.mockResolvedValue(null);
    expect(await materializeDueRules(VALID_ID, fakes)).toBe(2);
    expect(fakes.created).toHaveLength(2);
    expect(fakes.Recurring.updateOne).not.toHaveBeenCalled();
  });

  it("treats E11000 on insert as 'already materialized', not an error", async () => {
    const now = new Date("2026-09-26T00:00:00.000Z");
    let saves = 0;
    const fakes = makeFakes({
      rules: [rule({ nextRunAt: new Date("2026-08-15T00:00:00.000Z") })],
      now,
      // The unique (recurringRuleId, scheduledFor) index rejects the SECOND
      // occurrence as a duplicate of a row a racing process already wrote.
      saveImpl: vi.fn(async function () {
        saves += 1;
        if (saves === 2) {
          throw Object.assign(new Error("E11000 duplicate key"), { code: 11000, keyPattern: { recurringRuleId: 1, scheduledFor: 1 } });
        }
        return this;
      }),
    });

    const count = await materializeDueRules(VALID_ID, fakes);
    expect(count).toBe(1);
    expect(fakes.attempted).toHaveLength(2);
  });

  it("re-throws a non-duplicate insert failure", async () => {
    const now = new Date("2026-09-26T00:00:00.000Z");
    const fakes = makeFakes({
      rules: [rule({ nextRunAt: new Date("2026-08-15T00:00:00.000Z") })],
      now,
      saveImpl: vi.fn(async function () {
        throw new Error("disk on fire");
      }),
    });
    await expect(materializeDueRules(VALID_ID, fakes)).rejects.toThrow("disk on fire");
    expect(fakes.state.get("rule-1").nextRunAt).toEqual(new Date("2026-08-15T00:00:00.000Z"));
    expect(fakes.Recurring.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("does not swallow duplicate-key failures from an unrelated index", async () => {
    const fakes = makeFakes({
      rules: [rule({ nextRunAt: new Date("2026-08-15T00:00:00.000Z") })],
      now: new Date("2026-09-26T00:00:00.000Z"),
      saveImpl: async () => { throw Object.assign(new Error("other unique index"), { code: 11000, keyPattern: { description: 1 } }); },
    });
    await expect(materializeDueRules(VALID_ID, fakes)).rejects.toThrow("other unique index");
    expect(fakes.Recurring.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("caps long absences at MAX_CATCH_UP_RUNS but still advances past now", async () => {
    const now = new Date("2026-09-26T00:00:00.000Z");
    const fakes = makeFakes({
      rules: [rule({ frequency: "weekly", nextRunAt: new Date("2020-01-01T00:00:00.000Z") })],
      now,
    });
    const count = await materializeDueRules(VALID_ID, fakes);
    expect(count).toBe(MAX_CATCH_UP_RUNS);
    const nextRunAt = new Date(
      fakes.Recurring.findOneAndUpdate.mock.calls[0][1].$set.nextRunAt
    );
    expect(nextRunAt > now).toBe(true);
  });

  it("creates nothing when nothing is due", async () => {
    const fakes = {
      Recurring: { find: vi.fn(async () => []), findOneAndUpdate: vi.fn(), updateOne: vi.fn() },
      Transaction: vi.fn(),
      now: new Date("2026-09-26T00:00:00.000Z"),
    };
    expect(await materializeDueRules(VALID_ID, fakes)).toBe(0);
    expect(fakes.Recurring.findOneAndUpdate).not.toHaveBeenCalled();
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
      { type: "expense", amount: "Infinity", category: "X", frequency: "weekly", dayOfWeek: 1 },
      { type: "expense", amount: "1e400", category: "X", frequency: "weekly", dayOfWeek: 1 },
      { type: "expense", amount: "-Infinity", category: "X", frequency: "weekly", dayOfWeek: 1 },
    ]) {
      expect((await POST(req("http://localhost/api/recurring", "POST", body))).status).toBe(400);
    }
  });

  it("POST stores integer minor units alongside the float", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      req("http://localhost/api/recurring", "POST", {
        type: "expense",
        amount: "10.25",
        category: "Rent",
        frequency: "monthly",
        dayOfMonth: 1,
      })
    );
    expect(res.status).toBe(201);
    const ctx = R().instanceSave.mock.contexts.at(-1);
    expect(ctx.amount).toBe(10.25);
    expect(ctx.amountMinor).toBe(1025);
  });

  it("POST 400s a literal null body (no TypeError 500)", async () => {
    const { POST } = await loadRoute();
    const res = await POST(
      new Request("http://localhost/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "null",
      })
    );
    expect(res.status).toBe(400);
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
    const { PATCH } = await loadIdRoute();
    const ctx = { params: Promise.resolve({ id: VALID_ID }) };
    const url = `http://localhost/api/recurring/${VALID_ID}`;
    for (const amount of [0, -1, "abc", "Infinity", "1e400", "-Infinity"]) {
      R().findOne.mockResolvedValueOnce({
        amount: 5,
        save: vi.fn(async function () { return this; }),
      });
      const res = await PATCH(req(url, "PATCH", { amount }), ctx);
      expect(res.status).toBe(400);
    }
  });

  it("PATCH 400s a literal null body (no TypeError 500)", async () => {
    const { PATCH } = await loadIdRoute();
    const res = await PATCH(
      new Request(`http://localhost/api/recurring/${VALID_ID}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: "null",
      }),
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

  it("a BARE CR can never produce a second row (x\\r=1+1)", () => {
    // Reproduced with the shipped functions: the old quoting rule did not
    // treat CR as structural and the prefix guard only fired on a LEADING CR,
    // so this exported unquoted and Excel split it into an executing row.
    expect(sanitizeCsvCell("x\r=1+1")).toBe("x =1+1");
    const row = toCsvRow(["2026-01-01T00:00:00.000Z", "expense", "12.50", "USD", "Food", "x\r=1+1"]);
    expect(row).not.toContain("\r");
    expect(row).not.toContain("\n");
    expect(row.split(",").at(-1)).toBe("x =1+1");
  });

  it("collapses every CR/LF form to a single line", () => {
    for (const raw of ["=1+1\r", "=1+1\n", "=1+1\r\n", "=1+1\r\r=cmd", "=1+1\n\r=cmd"]) {
      const out = sanitizeCsvCell(raw);
      expect(/[\r\n]/.test(out)).toBe(false);
      // the formula guard still fires
      expect(out.startsWith("'")).toBe(true);
    }
    // Embedded newlines collapse to a space, never a new row.
    expect(sanitizeCsvCell("line1\nline2")).toBe("line1 line2");
    expect(sanitizeCsvCell("line1\rline2")).toBe("line1 line2");
  });

  it("quotes structural characters and leaves plain values unquoted", () => {
    expect(toCsvRow(["plain", "12.50"])).toBe("plain,12.50");
    expect(toCsvRow(["a,b"])).toBe('"a,b"');
    expect(toCsvRow(['say "hi"'])).toBe('"say ""hi"""');
    // CR/LF are gone after sanitizing, so nothing structural remains
    expect(toCsvRow(["x\r=1+1"])).toBe("x =1+1");
    expect(toCsvRow(["=1+1"])).toBe("'=1+1");
    expect(toCsvRow(["+1+1"])).toBe("'+1+1");
    expect(toCsvRow(["-1+1"])).toBe("'-1+1");
    expect(toCsvRow(["@SUM(A1)"])).toBe("'@SUM(A1)");
  });

  it("GET requires auth", async () => {
    globalThis.__verifySessionImpl = vi.fn(async () => ({ user: null, status: 401 }));
    const { GET } = await import("@/app/api/reports/export/route");
    expect((await GET(req("http://localhost/api/reports/export"))).status).toBe(401);
  });

  it("GET exports transactions as CSV from integer minor units", async () => {
    T().find.mockReturnValueOnce({
      sort: () => ({
        limit: () => ({
          lean: async () => [
            {
              date: "2026-09-01T00:00:00.000Z",
              type: "expense",
              amount: 12.5,
              amountMinor: 1250,
              currency: "USD",
              category: "Food",
              description: "=nope",
            },
          ],
        }),
      }),
    });
    const { GET } = await import("@/app/api/reports/export/route");
    const res = await GET(req("http://localhost/api/reports/export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const text = await res.text();
    expect(text.split("\n")[0]).toBe("date,type,amount,currency,category,description");
    expect(text).toContain("'=nope");
    expect(text).toContain("12.50");
  });

  it("GET emits exactly one line per transaction for a CR-bearing description", async () => {
    T().find.mockReturnValueOnce({
      sort: () => ({
        limit: () => ({
          lean: async () => [
            { date: "2026-09-01T00:00:00.000Z", type: "expense", amountMinor: 100, category: "Food", description: "x\r=1+1" },
            { date: "2026-09-02T00:00:00.000Z", type: "expense", amountMinor: 200, category: "Food", description: "=cmd|' /C calc'!A0" },
          ],
        }),
      }),
    });
    const { GET } = await import("@/app/api/reports/export/route");
    const text = await (await GET(req("http://localhost/api/reports/export"))).text();
    const lines = text.split("\n");
    // header + 2 rows, and no row starts with a live formula
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("x =1+1");
    expect(lines[2].startsWith("2026-09-02")).toBe(true);
  });

  it("GET rejects bad date bounds", async () => {
    const { GET } = await import("@/app/api/reports/export/route");
    const res = await GET(req("http://localhost/api/reports/export?start=garbage"));
    expect(res.status).toBe(400);
  });
});
