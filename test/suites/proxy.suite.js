// test/suites/proxy.suite.js — src/proxy.js routing + CSP
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { generateRefreshToken } from "@/lib/auth";

const loadProxy = () => import("@/proxy");

/** A genuinely signed refresh-session JWT (the proxy now verifies it). */
const realSession = () => generateRefreshToken("64b64b64b64b64b64b64b64b");

const makeReq = (path, { cookies = {} } = {}) => {
  const req = new NextRequest(`http://localhost${path}`);
  for (const [k, v] of Object.entries(cookies)) {
    req.cookies.set(k, v);
  }
  return req;
};

describe("proxy() routing", () => {
  let mod;
  let session;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    mod = await loadProxy();
    session = realSession();
  });

  it("redirects logged-in users away from /login → /dashboard", async () => {
    const res = await mod.proxy(makeReq("/login", { cookies: { refreshToken: session } }));
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
      makeReq("/welcome", { cookies: { refreshToken: session } })
    );
    expect(res.status).not.toBe(307);
  });

  it("anonymous /welcome is redirected to /login by the public-path check", async () => {
    const res = await mod.proxy(makeReq("/welcome"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("FAILS CLOSED on a forged or garbage session cookie", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const wrongKey = jwt.sign({ userId: "x" }, "a-completely-different-secret-32ch", {
      expiresIn: "1h",
    });

    for (const forged of [
      "anything",
      "not.a.jwt",
      wrongKey,
      `${session}tampered`,
      // unsigned "alg: none" attempt
      `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(
        '{"userId":"x"}'
      ).toString("base64url")}.`,
    ]) {
      const res = await mod.proxy(
        makeReq("/dashboard", { cookies: { refreshToken: forged } })
      );
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/login");
    }
  });

  it("fails closed on an EXPIRED session cookie", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const expired = jwt.sign({ userId: "x" }, process.env.REFRESH_TOKEN_SECRET, {
      expiresIn: "-1h",
    });
    const res = await mod.proxy(
      makeReq("/transactions", { cookies: { refreshToken: expired } })
    );
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("a valid session is allowed through protected pages", async () => {
    for (const path of ["/dashboard", "/transactions", "/profile", "/reports", "/categories"]) {
      const res = await mod.proxy(makeReq(path, { cookies: { refreshToken: session } }));
      expect(res.status).not.toBe(307);
    }
  });

  it("does NOT treat /api-prefixed look-alikes as public (prefix bypass)", async () => {
    // The old `pathname.startsWith("/api")` made all of these public.
    for (const path of ["/api-docs", "/apifoo", "/apix/../dashboard", "/api-docs/secret"]) {
      const res = await mod.proxy(makeReq(path));
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost/login");
    }
  });

  it("does NOT treat /login-prefixed look-alikes as public", async () => {
    const res = await mod.proxy(makeReq("/login-x"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login");
  });

  it("still treats the exact paths and their subtrees as public", async () => {
    for (const path of ["/login", "/api", "/api/user", "/api/reports/export"]) {
      const res = await mod.proxy(makeReq(path));
      expect(res.status).not.toBe(307);
    }
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
