// test/suites/api-user.suite.js — src/app/api/user/route.js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeQueryBuilder } from "../helpers/mocks.js";

const loadRoute = () => import("@/app/api/user/route");

const req = (method, body) =>
  new Request("http://localhost/api/user", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });

describe("GET /api/user", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.__verifySessionImpl = vi.fn(async () => ({ user: { _id: "64b64b64b64b64b64b64b64b" } }));
  });

  it("returns the user without secrets", async () => {
    // findById().select().lean() chain → must return a builder.
    globalThis.__models.user.findById.mockReturnValueOnce(
      makeQueryBuilder({ email: "a@b.c", accountName: "Me", currency: "INR" })
    );
    const { GET } = await loadRoute();

    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      email: "a@b.c",
      accountName: "Me",
      currency: "INR",
    });
  });

  it("404s when the user record vanished", async () => {
    globalThis.__models.user.findById.mockReturnValueOnce(makeQueryBuilder(null));
    const { GET } = await loadRoute();
    await expect(GET(req("GET")).then((r) => r.status)).resolves.toBe(404);
  });

  it("passes verifySession status through (503 stays retryable)", async () => {
    globalThis.__verifySessionImpl = vi.fn(async () => ({
      user: null,
      error: "Service temporarily unavailable",
      status: 503,
    }));
    const { GET } = await loadRoute();
    await expect(GET(req("GET")).then((r) => r.status)).resolves.toBe(503);
  });
});

describe("PUT /api/user", () => {
  let updatedDoc;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.__verifySessionImpl = vi.fn(async () => ({ user: { _id: "64b64b64b64b64b64b64b64b" } }));
    // Deterministic (queue-free): findByIdAndUpdate().select() resolves to
    // whatever `updatedDoc` currently holds.
    updatedDoc = {};
    globalThis.__models.user.findByIdAndUpdate.mockReset();
    globalThis.__models.user.findByIdAndUpdate.mockImplementation(() =>
      makeQueryBuilder(updatedDoc)
    );
  });

  it("rejects account names over 60 chars", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(req("PUT", { accountName: "x".repeat(61) }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ message: /60 characters/ });
  });

  it("rejects invalid currencies with a 400 (not a mongoose enum 500)", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(req("PUT", { currency: "GBP" }));
    expect(res.status).toBe(400);
  });

  it("400 when there is nothing to update", async () => {
    const { PUT } = await loadRoute();
    const res = await PUT(req("PUT", {}));
    expect(res.status).toBe(400);
  });

  it("auto-completes onboarding when a non-empty name is saved (B3)", async () => {
    const { PUT } = await loadRoute();

    const res = await PUT(req("PUT", { accountName: "My Finances" }));

    expect(res.status).toBe(200);
    const [, update] = globalThis.__models.user.findByIdAndUpdate.mock.calls[0];
    expect(update.$set.accountName).toBe("My Finances");
    expect(update.$set.onboarded).toBe(true);
  });

  it("accepts an explicit onboarded flag (welcome Skip path)", async () => {
    const { PUT } = await loadRoute();

    const res = await PUT(req("PUT", { onboarded: true }));

    expect(res.status).toBe(200);
    const [, update] = globalThis.__models.user.findByIdAndUpdate.mock.calls[0];
    expect(update.$set.onboarded).toBe(true);
  });

  it("never allows revoking onboarding", async () => {
    const { PUT } = await loadRoute();

    const res = await PUT(req("PUT", { onboarded: false }));
    // onboarded:false isn't a field update → falls into "no fields" unless
    // other fields present; either way $set must never contain false.
    for (const [, update] of globalThis.__models.user.findByIdAndUpdate.mock.calls) {
      expect(update?.$set?.onboarded).not.toBe(false);
    }
    expect([200, 400]).toContain(res.status);
  });

  it("trims account names and updates currency together", async () => {
    const { PUT } = await loadRoute();

    await PUT(req("PUT", { accountName: "  Trimmed  ", currency: "INR" }));

    const [, update] = globalThis.__models.user.findByIdAndUpdate.mock.calls[0];
    expect(update.$set.accountName).toBe("Trimmed");
    expect(update.$set.currency).toBe("INR");
  });

  it("404 if update target disappeared", async () => {
    updatedDoc = null;
    const { PUT } = await loadRoute();
    const res = await PUT(req("PUT", { accountName: "x" }));
    expect(res.status).toBe(404);
  });
});
