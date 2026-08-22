// test/suites/server-utils.suite.js — src/lib/server-utils.js
import { describe, it, expect } from "vitest";
import { sendSuccess, sendError } from "@/lib/server-utils";

describe("sendSuccess", () => {
  it("wraps data as JSON with default status 200", async () => {
    const res = sendSuccess({ hello: "world" });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ hello: "world" });
  });

  it("honors an explicit status", async () => {
    const res = sendSuccess({ ok: true }, 201);
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});

describe("sendError", () => {
  it("wraps message under `error` with default status 500", async () => {
    const res = sendError("boom");
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "boom" });
  });

  it("honors explicit statuses (401/404/429)", async () => {
    for (const status of [401, 404, 429]) {
      const res = sendError("nope", status);
      expect(res.status).toBe(status);
    }
  });
});
