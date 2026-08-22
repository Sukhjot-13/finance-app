// test/suites/api-transactions.suite.js — src/app/api/transactions/*
import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeQueryBuilder } from "../helpers/mocks.js";

const loadRoute = () => import("@/app/api/transactions/route");
const loadIdRoute = () => import("@/app/api/transactions/[id]/route");

const T = () => globalThis.__models.transaction;

const req = (url, method = "GET", body) =>
  new Request(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.__verifySessionImpl = vi.fn(async () => ({ user: { _id: "64b64b64b64b64b64b64b64b" } }));
});

describe("GET /api/transactions", () => {
  const get = async (qs = "") => {
    const { GET } = await loadRoute();
    return GET(req(`http://localhost/api/transactions${qs}`));
  };

  it("returns paginated shape sorted by date desc", async () => {
    T().find.mockReturnValueOnce(makeQueryBuilder([{ _id: "t1" }]));
    T().countDocuments.mockResolvedValueOnce(120);

    const res = await get("?page=2&limit=50");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      total: 120,
      page: 2,
      pageSize: 50,
      totalPages: 3,
      transactions: [{ _id: "t1" }],
    });
    // skip = (page-1)*limit — asserted on the builder the ROUTE used
    const routeBuilder = T().find.mock.results[0].value;
    expect(routeBuilder.skip).toHaveBeenCalledWith(50);
  });

  it("clamps page ≥ 1 and limit into [1,200]", async () => {
    T().countDocuments.mockResolvedValueOnce(0);
    await get("?page=-5&limit=99999");

    const routeBuilder = T().find.mock.results.at(-1).value;
    expect(routeBuilder.skip).toHaveBeenCalledWith(0); // page clamped to 1
    expect(routeBuilder.limit).toHaveBeenCalledWith(200); // limit clamped down
  });

  it("filters by type only when valid", async () => {
    T().countDocuments.mockResolvedValueOnce(0);
    await get("?type=bogus"); // ignored

    let query = T().find.mock.calls.at(-1)[0];
    expect(query.type).toBeUndefined();

    await get("?type=income");
    query = T().find.mock.calls.at(-1)[0];
    expect(query.type).toBe("income");
  });

  it("matches category exactly (trimmed)", async () => {
    T().countDocuments.mockResolvedValueOnce(0);
    await get("?category=%20Food%20");
    expect(T().find.mock.calls.at(-1)[0].category).toBe("Food");
  });

  it("escapes regex metacharacters in search (ReDoS/injection safe)", async () => {
    T().countDocuments.mockResolvedValueOnce(0);
    await get("?search=" + encodeURIComponent("a.*b(c)"));

    const query = T().find.mock.calls.at(-1)[0];
    const pattern = query.$or[0].description;
    expect(pattern.source).toBe("a\\.\\*b\\(c\\)");
    expect(pattern.flags).toContain("i");
  });

  it("bounds dates with $gte/$lte instants", async () => {
    T().countDocuments.mockResolvedValueOnce(0);
    await get(
      "?from=2026-08-01T00:00:00Z&to=2026-08-31T23:59:59Z"
    );

    const q = T().find.mock.calls.at(-1)[0].date;
    expect(q.$gte).toEqual(new Date("2026-08-01T00:00:00Z"));
    expect(q.$lte).toEqual(new Date("2026-08-31T23:59:59Z"));
  });

  it("ignores garbage date filters instead of crashing", async () => {
    T().countDocuments.mockResolvedValueOnce(0);
    const res = await get("?from=nonsense&to=alsononsense");
    expect(res.status).toBe(200);
    expect(T().find.mock.calls.at(-1)[0].date).toBeUndefined();
  });

  it("surfaces verifySession status verbatim (503 stays retryable)", async () => {
    globalThis.__verifySessionImpl = vi.fn(async () => ({
      user: null,
      error: "Service temporarily unavailable",
      status: 503,
    }));
    const res = await get();
    expect(res.status).toBe(503);
  });
});

describe("POST /api/transactions", () => {
  const post = async (body) => {
    const { POST } = await loadRoute();
    return POST(req("http://localhost/api/transactions", "POST", body));
  };

  it.each([
    [{ amount: 5, category: "Food", date: "2026-08-01" }, /type must be/i],
    [{ type: "expense", amount: 0, category: "Food", date: "2026-08-01" }, /positive number/i],
    [{ type: "expense", amount: -1, category: "Food", date: "2026-08-01" }, /positive number/i],
    [{ type: "expense", amount: 5, date: "2026-08-01" }, /Category is required/i],
    [{ type: "expense", amount: 5, category: "Food", date: "not-a-date" }, /Valid date/i],
  ])("400s invalid payloads: %j", async (body, pattern) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ message: pattern });
  });

  it("persists the transaction exactly as sent (noon-local stored as-is)", async () => {
    const noonInstant = new Date("2026-08-04T17:00:00.000Z"); // 12:00 UTC-5
    const res = await post({
      type: "expense",
      amount: "42.50", // numeric strings coerce
      category: " Food ",
      date: noonInstant.toISOString(),
      description: "  Lunch  ",
      excludeFromBudget: false,
    });

    expect(res.status).toBe(201);
    const ctx = T().instanceSave.mock.contexts.at(-1);
    expect(ctx.userId).toBe("64b64b64b64b64b64b64b64b");
    expect(ctx.amount).toBe(42.5);
    expect(ctx.category).toBe("Food");
    expect(ctx.description).toBe("Lunch");
    expect(ctx.date.toISOString()).toBe(noonInstant.toISOString());
    // Deterministic flag even when client omits/sends falsy:
    expect(ctx.excludeFromBudget).toBe(false);
  });

  it("coerces missing excludeFromBudget to a deterministic false", async () => {
    await post({
      type: "income",
      amount: 10,
      category: "Salary",
      date: new Date().toISOString(),
    });
    expect(T().instanceSave.mock.contexts.at(-1).excludeFromBudget).toBe(false);
  });

  it("maps mongoose ValidationErrors to 400", async () => {
    T().instanceSave.mockRejectedValueOnce(
      Object.assign(new Error("Validation failed"), { name: "ValidationError" })
    );
    const res = await post({
      type: "expense",
      amount: 5,
      category: "Food",
      date: new Date().toISOString(),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ message: "Validation error" });
  });
});

describe("/api/transactions/[id]", () => {
  const idRouteTests = () => {
    const VALID = "64b64b64b64b64b64b64b64b";
    const INVALID = "not-an-id";

    describe("ObjectId guards", () => {
      it("GET/PUT/DELETE malformed ids → 404 (never cast-error 500)", async () => {
        const { GET, PUT, DELETE } = await loadIdRoute();
        for (const handler of [GET, PUT, DELETE]) {
          const res = await handler(req("http://localhost/x"), {
            params: Promise.resolve({ id: INVALID }),
          });
          expect(res.status).toBe(404);
        }
      });
    });

    describe("PUT partial update semantics", () => {
      beforeEach(() => {
        globalThis.__verifySessionImpl = vi.fn(async () => ({ user: { _id: "64b64b64b64b64b64b64b64b" } }));
      });

      it("persists excludeFromBudget=false (undefined-check, not truthiness)", async () => {
        T().findOneAndUpdate.mockResolvedValueOnce({});
        const { PUT } = await loadIdRoute();

        await PUT(
          req("http://localhost/api/t/" + VALID, "PUT", { excludeFromBudget: false }),
          { params: Promise.resolve({ id: VALID }) }
        );

        const update = T().findOneAndUpdate.mock.calls[0][1]; // flat spread, no $set
        expect(update.excludeFromBudget).toBe(false);
        expect(update).not.toHaveProperty("userId");
      });

      it("drops fields that are absent/invalid instead of clobbering", async () => {
        T().findOneAndUpdate.mockResolvedValueOnce({});
        const { PUT } = await loadIdRoute();

        await PUT(
          req("http://localhost/api/t/" + VALID, "PUT", {
            description: "", // empty string IS a meaningful clear → set
            date: "garbage", // invalid → omitted
          }),
          { params: Promise.resolve({ id: VALID }) }
        );

        const update = T().findOneAndUpdate.mock.calls[0][1];
        expect(update.description).toBe("");
        expect(update).not.toHaveProperty("date");
      });

      it("scopes by owner and 404s someone else's row", async () => {
        T().findOneAndUpdate.mockResolvedValueOnce(null);
        const { PUT } = await loadIdRoute();
        const res = await PUT(
          req("http://localhost/api/t/" + VALID, "PUT", {}),
          { params: Promise.resolve({ id: VALID }) }
        );
        expect(res.status).toBe(404);
        expect(T().findOneAndUpdate.mock.calls[0][0]).toEqual({
          _id: VALID,
          userId: "64b64b64b64b64b64b64b64b",
        });
      });
    });

    describe("DELETE", () => {
      it("404 when already gone or foreign", async () => {
        T().findOneAndDelete.mockResolvedValueOnce(null);
        const { DELETE } = await loadIdRoute();
        const res = await DELETE(req("http://localhost/api/t/" + VALID), {
          params: Promise.resolve({ id: VALID }),
        });
        expect(res.status).toBe(404);
      });

      it("deletes own rows", async () => {
        T().findOneAndDelete.mockResolvedValueOnce({ _id: VALID });
        const { DELETE } = await loadIdRoute();
        const res = await DELETE(req("http://localhost/api/t/" + VALID), {
          params: Promise.resolve({ id: VALID }),
        });
        expect(res.status).toBe(200);
      });
    });
  };

  idRouteTests();
});
