// src/lib/__tests__/auth.test.js
import { describe, it, expect, beforeAll, vi } from "vitest";

// lib/auth.js reads secrets at import time and imports next/headers — both
// must be satisfied before the module loads.
process.env.ACCESS_TOKEN_SECRET = "test-access-secret-for-vitest-0123456789";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-for-vitest-fedcba9876";

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ get: () => undefined })),
}));

let auth;

beforeAll(async () => {
  auth = await import("@/lib/auth");
});

describe("hashToken", () => {
  it("produces a SHA-256 hex digest (64 chars)", () => {
    const hash = auth.hashToken("some-token");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for identical input", () => {
    expect(auth.hashToken("abc")).toBe(auth.hashToken("abc"));
  });

  it("differs for different input", () => {
    expect(auth.hashToken("abc")).not.toBe(auth.hashToken("abd"));
  });
});

describe("token generation roundtrip", () => {
  it("access token verifies with jsonwebtoken and carries userId", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const token = auth.generateAccessToken("user-123");
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    expect(decoded.userId).toBe("user-123");
  });

  it("refresh token includes a jti and verifies against the refresh secret", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const token = auth.generateRefreshToken("user-123");
    const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    expect(decoded.userId).toBe("user-123");
    expect(typeof decoded.jti).toBe("string");
  });

  it("hash of a generated refresh token is stable for DB storage", () => {
    const token = auth.generateRefreshToken("user-abc");
    expect(auth.hashToken(token)).toBe(auth.hashToken(token));
    // The raw token itself must NOT equal its hash (it is really hashed).
    expect(auth.hashToken(token)).not.toBe(token);
  });
});
