// test/suites/api-categories.suite.js — src/app/api/categories/*
import { describe, it, expect, beforeEach, vi } from "vitest";

const loadRoute = () => import("@/app/api/categories/route");
const loadIdRoute = () => import("@/app/api/categories/[id]/route");

const C = () => globalThis.__models.category;
const T = () => globalThis.__models.transaction;
const B = () => globalThis.__models.budget;

const VALID_ID = "64b64b64b64b64b64b64b64b";
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

describe("GET /api/categories", () => {
  it("merges defaults with custom names, deduped per type", async () => {
    C().find.mockResolvedValueOnce([
      { name: "Food", type: "expense" }, // duplicate of a default
      { name: "Crypto", type: "expense" },
      { name: "Consulting", type: "income" },
    ]);
    const { GET } = await loadRoute();

    const res = await GET(req("http://localhost/api/categories"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.expense).toContain("Food");
    expect(body.expense.filter((n) => n === "Food")).toHaveLength(1);
    expect(body.expense).toContain("Crypto");
    expect(body.income).toContain("Consulting");
    // allCustom keeps the raw docs (with ids) for the management page
    expect(body.allCustom).toHaveLength(3);
  });
});

describe("POST /api/categories", () => {
  const post = async (body) => {
    const { POST } = await loadRoute();
    return POST(req("http://localhost/api/categories", "POST", body));
  };

  it("requires name and type", async () => {
    for (const body of [{}, { name: "X" }, { name: "   ", type: "expense" }]) {
      const res = await post(body);
      expect(res.status).toBe(400);
    }
  });

  it("caps names at 50 chars", async () => {
    const res = await post({ name: "x".repeat(51), type: "expense" });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ message: /50 characters/ });
  });

  it("maps duplicates to 409", async () => {
    C().instanceSave.mockRejectedValueOnce(
      Object.assign(new Error("dup"), { code: 11000 })
    );
    const res = await post({ name: "Food", type: "expense" });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      message: "Category already exists",
    });
  });

  it("creates trimmed categories scoped to the owner", async () => {
    const res = await post({ name: "  Coffee Fund  ", type: "expense" });

    expect(res.status).toBe(201);
    const ctx = C().instanceSave.mock.contexts.at(-1);
    expect(ctx.name).toBe("Coffee Fund");
    expect(ctx.userId).toBe("64b64b64b64b64b64b64b64b");
    expect(ctx.type).toBe("expense");
  });
});

describe("PUT /api/categories/[id] — rename cascade (M3)", () => {
  const makeCategory = (name) => ({
    _id: VALID_ID,
    name,
    save: vi.fn(async function () {
      return this;
    }),
  });

  it("404s malformed ObjectIds before touching the DB", async () => {
    const { PUT } = await loadIdRoute();
    const res = await PUT(req("http://localhost/x", "PUT", { name: "N" }), {
      params: Promise.resolve({ id: "bad-id" }),
    });
    expect(res.status).toBe(404);
    expect(C().findOne).not.toHaveBeenCalled();
  });

  it("no-ops when the name is unchanged (skips cascades)", async () => {
    C().findOne.mockResolvedValueOnce(makeCategory("Same"));
    const { PUT } = await loadIdRoute();

    const res = await PUT(
      req(`http://localhost/api/categories/${VALID_ID}`, "PUT", { name: "Same" }),
      { params: Promise.resolve({ id: VALID_ID }) }
    );

    expect(res.status).toBe(200);
    expect(T().updateMany).not.toHaveBeenCalled();
    expect(B().updateMany).not.toHaveBeenCalled();
  });

  it("renames the doc AND re-points transactions + budgets old→new", async () => {
    const cat = makeCategory("OldName");
    C().findOne.mockResolvedValueOnce(cat);
    const { PUT } = await loadIdRoute();

    const res = await PUT(
      req(`http://localhost/api/categories/${VALID_ID}`, "PUT", { name: "NewName" }),
      { params: Promise.resolve({ id: VALID_ID }) }
    );

    expect(res.status).toBe(200);
    expect(T().updateMany).toHaveBeenCalledWith(
      { userId: "64b64b64b64b64b64b64b64b", category: "OldName" },
      { $set: { category: "NewName" } }
    );
    expect(B().updateMany).toHaveBeenCalledWith(
      { userId: "64b64b64b64b64b64b64b64b", category: "OldName" },
      { $set: { category: "NewName" } }
    );
    const json = await res.json();
    expect(json.name).toBe("NewName");
  });

  it("maps duplicate renames to 409 without cascading", async () => {
    const cat = makeCategory("OldName");
    cat.save.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: 11000 }));
    C().findOne.mockResolvedValueOnce(cat);
    const { PUT } = await loadIdRoute();

    const res = await PUT(
      req(`http://localhost/api/categories/${VALID_ID}`, "PUT", { name: "Taken" }),
      { params: Promise.resolve({ id: VALID_ID }) }
    );

    expect(res.status).toBe(409);
    expect(T().updateMany).not.toHaveBeenCalled();
  });

  it("rolls the rename back if the cascade write fails (standalone fallback)", async () => {
    const cat = makeCategory("OldName");
    C().findOne.mockResolvedValueOnce(cat);
    T().updateMany.mockResolvedValueOnce({});
    B().updateMany.mockRejectedValueOnce(new Error("write failed"));
    const { PUT } = await loadIdRoute();

    const res = await PUT(
      req(`http://localhost/api/categories/${VALID_ID}`, "PUT", { name: "NewName" }),
      { params: Promise.resolve({ id: VALID_ID }) }
    );

    // Route surfaces the failure...
    expect(res.status).toBe(500);
    // ...and restored the category doc so nothing references a ghost label.
    expect(cat.save).toHaveBeenCalledTimes(2);
    expect(cat.name).toBe("OldName");
  });

  it("rejects empty or oversized names", async () => {
    const { PUT } = await loadIdRoute();
    for (const name of ["", "   ", null, "x".repeat(51)]) {
      const res = await PUT(
        req(`http://localhost/api/categories/${VALID_ID}`, "PUT", { name }),
        { params: Promise.resolve({ id: VALID_ID }) }
      );
      expect(res.status).toBe(400);
    }
  });
});

describe("DELETE /api/categories/[id]", () => {
  it("reassigns transactions to Other and deletes that budget", async () => {
    C().findOneAndDelete.mockResolvedValueOnce({ _id: VALID_ID, name: "Dining" });
    const { DELETE } = await loadIdRoute();

    const res = await DELETE(req(`http://localhost/api/categories/${VALID_ID}`, "DELETE"), {
      params: Promise.resolve({ id: VALID_ID }),
    });

    expect(res.status).toBe(200);
    expect(T().updateMany).toHaveBeenCalledWith(
      { userId: "64b64b64b64b64b64b64b64b", category: "Dining" },
      { $set: { category: "Other" } }
    );
    expect(B().deleteMany).toHaveBeenCalledWith({
      userId: "64b64b64b64b64b64b64b64b",
      category: "Dining",
    });
  });

  it("404s missing/foreign categories without side effects", async () => {
    C().findOneAndDelete.mockResolvedValueOnce(null);
    const { DELETE } = await loadIdRoute();
    const res = await DELETE(req(`http://localhost/api/categories/${VALID_ID}`, "DELETE"), {
      params: Promise.resolve({ id: VALID_ID }),
    });
    expect(res.status).toBe(404);
    expect(T().updateMany).not.toHaveBeenCalled();
    expect(B().deleteMany).not.toHaveBeenCalled();
  });
});
