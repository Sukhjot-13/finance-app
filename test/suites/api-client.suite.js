// test/suites/api-client.suite.js — src/lib/api.js refresh contract
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const jsonResponse = (status, body = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("api() wrapper", () => {
  let originalWindow;

  beforeEach(() => {
    vi.resetModules();
    // Swap in a minimal window shim for redirect assertions, restoring the
    // real one afterwards (jsdom's window must survive for later suites).
    originalWindow = global.window;
    global.window = { location: { href: "" } };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.window = originalWindow;
    delete global.fetch;
  });

  const loadApi = async () => (await vi.importActual("@/lib/api")).default;

  it("passes through successful responses without refreshing", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(200)));
    const api = await loadApi();

    const res = await api("/api/data");

    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.window.location.href).toBe("");
  });

  it("retries once after a successful refresh", async () => {
    let originalCalls = 0;
    global.fetch = vi.fn((url) => {
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

    await expect(api("/api/data")).rejects.toThrow("Could not refresh session");
    expect(originalCalls).toBe(1);
    expect(global.window.location.href).toBe("");
  });

  it("redirects to /login ONLY on definitive refresh rejection (401)", async () => {
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(401)));
    const api = await loadApi();

    await expect(api("/api/data")).rejects.toThrow("Session expired");
    expect(global.window.location.href).toBe("/login");
  });

  it("returns the 401 instead of hanging when retried request 401s again", async () => {
    let originalCalls = 0;
    global.fetch = vi.fn((url) => {
      if (url === "/api/auth/refresh") {
        return Promise.resolve(jsonResponse(200));
      }
      originalCalls += 1;
      return Promise.resolve(jsonResponse(401));
    });
    const api = await loadApi();

    const res = await api("/api/data");

    expect(res.status).toBe(401);
    expect(originalCalls).toBe(2);
  });

  it("queues concurrent 401s behind a single refresh", async () => {
    let originalCalls = 0;
    let resolveRefresh;
    global.fetch = vi.fn((url) => {
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
    await new Promise((resolve) => setTimeout(resolve, 0));
    resolveRefresh(jsonResponse(200));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });

  it("treats network errors during refresh as transient (no redirect)", async () => {
    let originalCalls = 0;
    global.fetch = vi.fn((url) => {
      if (url === "/api/auth/refresh") {
        return Promise.reject(new Error("network down"));
      }
      originalCalls += 1;
      return Promise.resolve(jsonResponse(401));
    });
    const api = await loadApi();

    await expect(api("/api/data")).rejects.toThrow(
      "Network error while refreshing session"
    );
    expect(global.window.location.href).toBe("");
  });
});
