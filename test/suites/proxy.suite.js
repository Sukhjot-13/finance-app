// test/suites/proxy.suite.js — src/proxy.js routing + CSP
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const loadProxy = () => import("@/proxy");

const makeReq = (path, { cookies = {} } = {}) => {
  const req = new NextRequest(`http://localhost${path}`);
  for (const [k, v] of Object.entries(cookies)) {
    req.cookies.set(k, v);
  }
  return req;
};

describe("proxy() routing", () => {
  let mod;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mod = await loadProxy();
  });

  it("redirects logged-in users away from /login → /dashboard", async () => {
    const res = await mod.proxy(makeReq("/login", { cookies: { refreshToken: "r" } }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/dashboard");
  });

  it("redirects anonymous users from protected pages → /login", async () => {
    const res = await mod.proxy(makeReq("/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("does NOT bounce logged-in users off /welcome (onboarding fix)", async () => {
    const res = await mod.proxy(
      makeReq("/welcome", { cookies: { refreshToken: "r" } })
    );
    expect(res.status).not.toBe(307);
  });

  it("anonymous /welcome is redirected to /login by the public-path check", async () => {
    const res = await mod.proxy(makeReq("/welcome"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("passes page requests through WITH a per-request CSP nonce header", async () => {
    const res1 = await mod.proxy(makeReq("/login"));
    const res2 = await mod.proxy(makeReq("/login"));

    const csp1 = res1.headers.get("content-security-policy");
    const csp2 = res2.headers.get("content-security-policy");

    expect(csp1).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    // Nonce is per-request:
    expect(csp1).not.toBe(csp2);
    // Locked-down directives present:
    expect(csp1).toContain("object-src 'none'");
    expect(csp1).toContain("frame-ancestors 'none'");
    expect(csp1).toContain("base-uri 'self'");
    expect(csp1).toContain("form-action 'self'");
  });

  it("dev CSP adds unsafe-eval; prod does not", async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "development";
      vi.resetModules();
      const devMod = await loadProxy();
      const devCsp = (await devMod.proxy(makeReq("/login"))).headers
        .get("content-security-policy");
      expect(devCsp).toContain("'unsafe-eval'");

      process.env.NODE_ENV = "production";
      vi.resetModules();
      const prodMod = await loadProxy();
      const prodCsp = (await prodMod.proxy(makeReq("/login"))).headers
        .get("content-security-policy");
      expect(prodCsp).not.toContain("'unsafe-eval'");
    } finally {
      process.env.NODE_ENV = originalEnv;
      vi.resetModules();
      mod = await loadProxy();
    }
  });

  it("lets /api routes through untouched (no CSP work)", async () => {
    const res = await mod.proxy(makeReq("/api/user"));
    expect(res.headers.get("content-security-policy")).toBeNull();
  });

  it("config matcher skips static assets and extensioned files", async () => {
    const pattern = new RegExp(mod.config.matcher[0]);
    expect(pattern.test("_next/static/chunk.js")).toBe(false);
    expect(pattern.test("favicon.ico")).toBe(false);
    expect(pattern.test("/a.svg")).toBe(false);
    expect(pattern.test("/dashboard")).toBe(true);
    expect(pattern.test("/api/transactions")).toBe(true);
  });
});
