// src/lib/__tests__/api.test.js
//
// Covers the token-refresh contract of lib/api.js:
// - each request retries AT MOST once after a refresh (no deadlocks)
// - concurrent 401s share a single refresh
// - only a definitive 401 from /api/auth/refresh redirects to /login;
//   transient failures (500/network) surface as errors instead.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const jsonResponse = (status, body = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("api()", () => {
  beforeEach(() => {
    vi.resetModules();
    // Minimal browser shims — node has no window/fetch by default here.
    global.window = { location: { href: "" } };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete global.window;
    delete global.fetch;
  });

  const loadApi = async () => (await import("@/lib/api")).default;

  it("passes through successful responses without refreshing", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(200)));
    const api = await loadApi();

    const res = await api("/api/data");

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.window.location.href).toBe("");
  });

  it("retries once after a successful refresh", async () => {
    const calls = [];
    let originalCalls = 0;
    global.fetch = vi.fn((url) => {
      calls.push(url);
      if (url === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse(200));
      }
      originalCalls += 1;
      return Promise.resolve(
        originalCalls === 1 ? jsonResponse(401) : jsonResponse(200)
      );
    });
    const api = await loadApi();

    const res = await api("/api/data");

    expect(res.status).toBe(200);
    expect(originalCalls).toBe(2);
    expect(calls.filter((u) => u === "/api/auth/refresh")).toHaveLength(1);
  });

  it("does NOT redirect when refresh fails transiently (500)", async () => {
    let originalCalls = 0;
    global.fetch = vi.fn((url) => {
      if (url === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse(500));
      }
      originalCalls += 1;
      return Promise.resolve(jsonResponse(401));
    });
    const api = await loadApi();

    await expect(api("/api/data")).rejects.toThrow(
      "Could not refresh session"
    );

    // Original attempted exactly once; user NOT bounced to /login.
    expect(originalCalls).toBe(1);
    expect(global.window.location.href).toBe("");
  });

  it("redirects to /login ONLY when refresh is definitively rejected (401)", async () => {
    global.fetch = vi.fn((url) => {
      if (url === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse(401));
      }
      return Promise.resolve(jsonResponse(401));
    });
    const api = await loadApi();

    await expect(api("/api/data")).rejects.toThrow("Session expired");
    expect(global.window.location.href).toBe("/login");
  });

  it("returns the 401 instead of hanging when the retried request 401s again", async () => {
    // Regression test for the queue deadlock: previously, a retry that got
    // another 401 would queue behind itself forever.
    let originalCalls = 0;
    global.fetch = vi.fn((url) => {
      if (url === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse(200));
      }
      originalCalls += 1;
      return Promise.resolve(jsonResponse(401)); // always 401
    });
    const api = await loadApi();

    const res = await api("/api/data", {});

    expect(res.status).toBe(401); // handed back, not hung
    expect(originalCalls).toBe(2); // initial + exactly one retry
  });

  it("queues concurrent 401s behind a single refresh", async () => {
    const calls = [];
    let originalCalls = 0;
    let resolveRefresh;
    global.fetch = vi.fn((url) => {
      calls.push(url);
      if (url === "/api/auth/refresh") {
        return new Promise((resolve) => {
          resolveRefresh = resolve;
        });
      }
      originalCalls += 1;
      return Promise.resolve(
        originalCalls <= 2 ? jsonResponse(401) : jsonResponse(200)
      );
    });
    const api = await loadApi();

    const p1 = api("/api/data");
    const p2 = api("/api/data");

    // Let both requests receive their 401s before releasing the refresh.
    await new Promise((resolve) => setTimeout(resolve, 0));
    resolveRefresh(jsonResponse(200));

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(calls.filter((u) => u === "/api/auth/refresh")).toHaveLength(1);
  });
});
