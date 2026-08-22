// test/suites/auth-lib.suite.js — src/lib/auth.js
//
// The runner's vi.mock("@/lib/auth") spreads the ACTUAL module and only
// delegates verifySession — so these tests restore the real verifySession
// via vi.importActual and drive it through mocked cookies/DB.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import jwt from "jsonwebtoken";

let auth;
let realVerifySession;

beforeAll(async () => {
  auth = await import("@/lib/auth");
  const actual = await vi.importActual("@/lib/auth");
  realVerifySession = actual.verifySession;
  globalThis.__verifySessionImpl = actual.verifySession; // passthrough for others
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  // Restore the delegating default so later suites are unaffected.
  globalThis.__verifySessionImpl = (...args) => realVerifySession(...args);
});

describe("hashToken", () => {
  it("produces a SHA-256 hex digest (64 chars)", () => {
    expect(auth.hashToken("some-token")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic for identical input", () => {
    expect(auth.hashToken("abc")).toBe(auth.hashToken("abc"));
  });

  it("differs for different input", () => {
    expect(auth.hashToken("abc")).not.toBe(auth.hashToken("abd"));
  });
});

describe("token generation roundtrip", () => {
  it("access token verifies with jsonwebtoken and carries userId", () => {
    const token = auth.generateAccessToken("user-123");
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    expect(decoded.userId).toBe("user-123");
  });

  it("refresh token includes a jti and verifies against the refresh secret", () => {
    const token = auth.generateRefreshToken("user-123");
    const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
    expect(decoded.userId).toBe("user-123");
    expect(typeof decoded.jti).toBe("string");
  });

  it("hash of a generated refresh token is stable and never leaks raw", () => {
    const token = auth.generateRefreshToken("user-abc");
    expect(auth.hashToken(token)).toBe(auth.hashToken(token));
    expect(auth.hashToken(token)).not.toBe(token);
  });
});

describe("verifyToken", () => {
  it("returns null on garbage instead of throwing", () => {
    expect(auth.verifyToken("garbage", process.env.ACCESS_TOKEN_SECRET)).toBeNull();
  });

  it("decodes valid tokens", () => {
    const token = auth.generateAccessToken("64b64b64b64b64b64b64b64b");
    expect(auth.verifyToken(token, process.env.ACCESS_TOKEN_SECRET).userId).toBe("64b64b64b64b64b64b64b64b");
  });
});

describe("purgeExpiredRefreshTokens", () => {
  it("pulls entries older than TTL or rotated past grace", async () => {
    const User = globalThis.__models.user;
    User.updateOne.mockResolvedValueOnce({});

    await auth.purgeExpiredRefreshTokens("64b64b64b64b64b64b64b64b");

    expect(User.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = User.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: "64b64b64b64b64b64b64b64b" });
    const pull = update.$pull.refreshTokens.$or;
    expect(pull[0].createdAt.$lt.getTime()).toBeCloseTo(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
      -3
    );
    expect(pull[1].rotatedAt).toEqual({
      $exists: true,
      $ne: null,
      $lt: expect.any(Date),
    });
    expect(pull[1].rotatedAt.$lt.getTime()).toBeCloseTo(
      Date.now() - 60 * 1000,
      -3
    );
  });
});

describe("verifySession (real implementation)", () => {
  const setupCookies = (tokens) => {
    globalThis.__cookiesStore = vi.fn(() => ({
      get: (name) => (tokens[name] ? { value: tokens[name] } : undefined),
      set: vi.fn(),
      delete: vi.fn(),
    }));
  };

  it("401 when either cookie is missing", async () => {
    setupCookies({});
    await expect(realVerifySession()).resolves.toMatchObject({
      user: null,
      status: 401,
    });
  });

  it("401 on an invalid/expired ACCESS token without touching DB", async () => {
    setupCookies({ accessToken: "bad-token", refreshToken: "r" });
    const result = await realVerifySession();
    expect(result.status).toBe(401);
    expect(globalThis.__dbConnect).not.toHaveBeenCalled();
  });

  it("returns the user id when access + hashed refresh both match", async () => {
    const userId = "64b64b64b64b64b64b64b64b";
    const access = jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET);
    const refresh = auth.generateRefreshToken(userId);
    setupCookies({ accessToken: access, refreshToken: refresh });

    globalThis.__models.user.findOne.mockImplementationOnce(
      async ({ $or }) => {
        // Simulate: DB stores hash(refresh) — second $or arm matches hashes.
        expect($or[0]["refreshTokens.token"]).toBe(auth.hashToken(refresh));
        return { _id: userId };
      }
    );

    const result = await realVerifySession();
    expect(result.user._id).toBe(userId);
    expect(result.status).toBeUndefined();
  });

  it("401 when refresh token not found in DB (revoked session)", async () => {
    const userId = "64b64b64b64b64b64b64b64b";
    const access = jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET);
    setupCookies({ accessToken: access, refreshToken: "revoked" });
    globalThis.__models.user.findOne.mockResolvedValueOnce(null);

    await expect(realVerifySession()).resolves.toMatchObject({
      user: null,
      status: 401,
    });
  });

  it("503 (not 401) when the DB errors transiently", async () => {
    const userId = "64b64b64b64b64b64b64b64b";
    const access = jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET);
    setupCookies({ accessToken: access, refreshToken: "r" });
    const originalDbConnect = globalThis.__dbConnect;
    globalThis.__dbConnect = vi.fn(async () => {
      throw new Error("connection timed out");
    });

    try {
      const result = await realVerifySession();
      expect(result.status).toBe(503);
      expect(result.user).toBeNull();
    } finally {
      // Never leak the throwing connector into later suites.
      globalThis.__dbConnect = originalDbConnect;
    }
  });

  it("accepts legacy plaintext refresh entries via the $or fallback", async () => {
    const userId = "64b64b64b64b64b64b64b64b";
    const access = jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET);
    setupCookies({ accessToken: access, refreshToken: "legacy-raw-token" });
    globalThis.__models.user.findOne.mockImplementationOnce(
      async ({ $or }) => {
        expect($or[1]["refreshTokens.token"]).toBe("legacy-raw-token");
        return { _id: userId };
      }
    );
    await expect(realVerifySession()).resolves.toMatchObject({
      user: { _id: userId },
    });
  });
});
