// test/suites/api-auth.suite.js — OTP send/verify, refresh rotation, logouts
import { describe, it, expect, beforeEach, vi } from "vitest";
import bcrypt from "bcryptjs";

const RL = () => globalThis.__models.rateLimit;
const U = () => globalThis.__models.user;

// ---- helpers ---------------------------------------------------------

const loadSend = () => import("@/app/api/auth/otp/send/route");
const loadVerify = () => import("@/app/api/auth/otp/verify/route");
const loadRefresh = () => import("@/app/api/auth/refresh/route");
const loadLogout = () => import("@/app/api/auth/logout/route");
const loadLogoutAll = () => import("@/app/api/auth/logout-all/route");

const jsonReq = (url, body) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

/** Stable cookie jar wired into the next/headers delegate. */
const installJar = (initial = {}) => {
  const jar = { ...initial };
  const store = {
    get: (name) => (name in jar ? { value: jar[name] } : undefined),
    set: vi.fn((k, v) => {
      jar[k] = v;
    }),
    delete: vi.fn((k) => {
      delete jar[k];
    }),
  };
  globalThis.__cookiesStore = vi.fn(() => store);
  return { jar, store };
};

const resetRateLimits = () => {
  // Defaults from makeModel survive mockClear; re-add them explicitly since
  // some tests replace implementations outright.
  RL().aggregate.mockReset();
  RL().aggregate.mockResolvedValue([]);
  RL().updateOne.mockReset();
  RL().updateOne.mockResolvedValue({});
  RL().deleteOne.mockReset();
  RL().deleteOne.mockResolvedValue({});
};

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.__dbConnect = vi.fn(async () => ({}));
  globalThis.__brevoClient.sendTransacEmail = vi.fn(async () => ({}));
  resetRateLimits();
  U().findOne.mockReset();
  U().findOne.mockResolvedValue(null);
  U().updateOne.mockReset();
  U().updateOne.mockResolvedValue({});
});

// ------------------------------------------------------------------ send

describe("POST /api/auth/otp/send", () => {
  const post = async (body) => {
    const { POST } = await loadSend();
    return POST(jsonReq("http://localhost/api/auth/otp/send", JSON.stringify(body)));
  };

  it("rejects missing and malformed emails before any side effects", async () => {
    for (const email of [undefined, "", "not-an-email", "a@b"]) {
      const res = await post({ email });
      expect(res.status).toBe(400);
      expect(U().findOne).not.toHaveBeenCalled();
      expect(RL().aggregate).not.toHaveBeenCalled();
    }
  });

  it("enforces the per-email sliding window with a uniform 429", async () => {
    RL().aggregate.mockResolvedValueOnce([{ n: 5 }]);
    const res = await post({ email: "A@B.com" });
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toMatchObject({
      message: /Too many OTP requests/,
    });
    expect(U().findOne).not.toHaveBeenCalled(); // cheap rejection
  });

  it("enforces the per-IP window too", async () => {
    RL().aggregate
      .mockResolvedValueOnce([{ n: 0 }]) // email count ok
      .mockResolvedValueOnce([{ n: 20 }]); // IP count maxed
    const res = await post({ email: "a@b.com" });
    expect(res.status).toBe(429);
  });

  it("records both hits, hashes nothing client-visible, sends HTML + TEXT email (U5)", async () => {
    U().findOne.mockResolvedValueOnce({
      email: "a@b.com",
      otp: "old-hash",
      otpExpires: new Date(Date.now() + 1000),
      save: vi.fn(async function () {
        return this;
      }),
    });

    const res = await post({ email: "a@b.com" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toMatch(/OTP sent successfully/);

    // per-email AND per-IP slots consumed
    expect(RL().updateOne).toHaveBeenCalledTimes(2);

    // email payload contains both parts with a 6-digit code
    const emailArg = globalThis.__brevoClient.sendTransacEmail.mock.calls[0][0];
    expect(emailArg.htmlContent).toMatch(/\b\d{6}\b/);
    expect(emailArg.textContent).toMatch(/login code is \d{6}/);
    expect(emailArg.to).toEqual([{ email: "a@b.com" }]);
  });

  it("creates brand-new users lowercased (case-variant logins collapse)", async () => {
    U().findOne.mockResolvedValue(null);
    const res = await post({ email: "New.User@Example.COM" });
    expect(res.status).toBe(200);
    const ctx = U().instanceSave.mock.contexts.at(-1);
    expect(ctx.email).toBe("new.user@example.com");
  });

  it("handles the concurrent-signup unique-index race (E11000 → refetch)", async () => {
    const existing = { email: "race@example.com", save: vi.fn(async function () { return this; }) };
    U().findOne
      .mockResolvedValueOnce(null) // initial lookup misses
      .mockResolvedValueOnce(existing); // refetch after the race
    U().instanceSave.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: 11000 }));

    const res = await post({ email: "race@example.com" });

    expect(res.status).toBe(200);
    expect(U().findOne).toHaveBeenCalledTimes(2);
    expect(existing.save).toHaveBeenCalledTimes(1);
  });

  it("on Brevo failure: restores the pending OTP, refunds BOTH slots, generic 500", async () => {
    const doc = {
      email: "fail@example.com",
      otp: "previous-hash",
      otpExpires: new Date(Date.now() + 1000),
      save: vi.fn(async function () {
        return this;
      }),
    };
    U().findOne.mockResolvedValueOnce(doc);
    globalThis.__brevoClient.sendTransacEmail.mockRejectedValueOnce(
      new Error("smtp down")
    );

    const res = await post({ email: "fail@example.com" });

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      message: /Failed to send OTP/,
    });
    // two saves: set new OTP, then restore the previous one
    expect(doc.save).toHaveBeenCalledTimes(2);
    expect(doc.otp).toBe("previous-hash");
    // refunds: last two updateOne calls are $pop operations
    const pops = RL().updateOne.mock.calls.filter(
      ([, update]) => update.$pop
    );
    expect(pops).toHaveLength(2);
  });
});

// ---------------------------------------------------------------- verify

describe("POST /api/auth/otp/verify", () => {
  let STORED_HASH;

  beforeAll(async () => {
    STORED_HASH = await bcrypt.hash("654321", 10);
  });

  const makeUser = (overrides = {}) => ({
    _id: "uid1",
    email: "a@b.c",
    accountName: null,
    onboarded: false,
    otp: STORED_HASH,
    otpExpires: new Date(Date.now() + 10 * 60 * 1000),
    refreshTokens: { push: vi.fn() },
    save: vi.fn(async function () {
      return this;
    }),
    ...overrides,
  });

  const verifyWith = async (body, { jarInitial = {} } = {}) => {
    const { jar, store } = installJar(jarInitial);
    const { POST } = await loadVerify();
    const res = await POST(
      jsonReq("http://localhost/api/auth/otp/verify", JSON.stringify(body))
    );
    return { res, jar, store };
  };

  it("returns a controlled 400 on malformed JSON bodies (M2)", async () => {
    const { POST } = await loadVerify();
    const res = await POST(
      jsonReq("http://localhost/api/auth/otp/verify", "{this is not json")
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: /Invalid request body/,
    });
  });

  it("requires both fields", async () => {
    const { res } = await verifyWith({ email: "a@b.c" });
    expect(res.status).toBe(400);
  });

  it("locks out after repeated failures (uniform 429)", async () => {
    RL().aggregate.mockResolvedValueOnce([{ n: 5 }]);
    const { res } = await verifyWith({ email: "a@b.c", otp: "000000" });
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toMatchObject({
      error: /Too many failed attempts/,
    });
  });

  it("locks out by IP after repeated failures from that IP (uniform 429)", async () => {
    RL().aggregate
      .mockResolvedValueOnce([]) // email hits: 0
      .mockResolvedValueOnce([{ n: 25 }]); // ip hits: 25
    const { res } = await verifyWith({ email: "target@b.c", otp: "000000" });
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toMatchObject({
      error: /Too many failed attempts/,
    });
  });

  it("gives one UNIFORM failure message for unknown emails (timing-equalized)", async () => {
    U().findOne.mockResolvedValueOnce(null);
    const { res } = await verifyWith({ email: "ghost@nowhere.com", otp: "111111" });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Invalid or expired code. Please request a new one.",
    });
    // a failed attempt is recorded
    const recorded = RL().updateOne.mock.calls.some(([, u]) => u.$push);
    expect(recorded).toBe(true);
  });

  it.each([
    ["wrong code", "000000", {}],
    ["expired code", "654321", { otpExpires: new Date(Date.now() - 1000) }],
    ["missing expiry", "654321", { otpExpires: null }],
  ])("%s → same uniform message", async (_label, otp, overrides) => {
    U().findOne.mockResolvedValueOnce(makeUser(overrides));
    const { res } = await verifyWith({ email: "a@b.c", otp });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Invalid or expired code. Please request a new one.",
    });
  });

  it("success: clears OTP, stores HASHED refresh token, resets lockout, sets cookies", async () => {
    const user = makeUser({ accountName: "Named" });
    U().findOne.mockResolvedValueOnce(user);

    const { res, jar } = await verifyWith({ email: "a@b.c", otp: "654321" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(user.save).toHaveBeenCalledTimes(1);
    expect(user.otp).toBeUndefined();
    expect(user.otpExpires).toBeUndefined();

    // refresh token persisted ONLY as its SHA-256 hash
    const pushed = user.refreshTokens.push.mock.calls[0][0].token;
    expect(pushed).toMatch(/^[a-f0-9]{64}$/);
    expect(pushed).not.toContain(".");
    expect(pushed).toBe((await import("@/lib/auth")).hashToken(jar.refreshToken));

    // lockout history wiped on success
    expect(RL().deleteOne).toHaveBeenCalled();
    // both session cookies issued
    expect(jar.accessToken).toBeTruthy();
    expect(jar.refreshToken).toBeTruthy();
    expect(body.isNewUser).toBe(false);
  });

  it("(B3) fresh user without name/onboarding → isNewUser TRUE", async () => {
    U().findOne.mockResolvedValueOnce(makeUser());
    const { res } = await verifyWith({ email: "a@b.c", otp: "654321" });
    await expect(res.json()).resolves.toMatchObject({ isNewUser: true });
  });

  it("(B3) skipped users (no name but onboarded) are NOT re-prompted", async () => {
    U().findOne.mockResolvedValueOnce(makeUser({ onboarded: true }));
    const { res } = await verifyWith({ email: "a@b.c", otp: "654321" });
    await expect(res.json()).resolves.toMatchObject({ isNewUser: false });
  });
});

// --------------------------------------------------------------- refresh

describe("POST /api/auth/refresh (rotation + grace + reuse detection)", () => {
  let realAuth;

  beforeAll(async () => {
    realAuth = await import("@/lib/auth");
  });

  const makeSessionUser = (tokenHash, rotatedAt = null) => ({
    _id: "uid1",
    refreshTokens: [{ token: tokenHash, rotatedAt }],
  });

  // Installs exactly the cookies given (undefined raw = NO cookie), wires
  // optional user lookup + DB-failure modes, then fires one POST /refresh.
  const refreshAs = async ({ raw, userDoc, dbFail = false } = {}) => {
    const { jar, store } = installJar(
      raw === undefined ? {} : { refreshToken: raw }
    );
    if (userDoc) U().findOne.mockResolvedValueOnce(userDoc);
    if (dbFail) {
      globalThis.__dbConnect = vi.fn(async () => {
        throw new Error("down");
      });
    }

    const { POST } = await loadRefresh();
    const res = await POST(
      new Request("http://localhost/api/auth/refresh", { method: "POST" })
    );
    return { res, jar, store };
  };

  it("401s immediately without a cookie (no DB touch)", async () => {
    const dbConnect = globalThis.__dbConnect;
    const { res } = await refreshAs({});
    expect(res.status).toBe(401);
    expect(dbConnect).not.toHaveBeenCalled();
  });

  it("garbage token → definitive failure: cookies cleared, 401", async () => {
    const { res, store } = await refreshAs({ raw: "garbage" });
    expect(res.status).toBe(401);
    expect(store.delete).toHaveBeenCalledWith("refreshToken");
    expect(store.delete).toHaveBeenCalledWith("accessToken");
  });

  it("valid JWT but revoked/unknown token → cleared cookies, 401", async () => {
    const raw = realAuth.generateRefreshToken("uid1");
    const { res, store } = await refreshAs({ raw }); // no userDoc → not found
    expect(res.status).toBe(401);
    expect(store.delete).toHaveBeenCalledWith("refreshToken");
  });

  it("ACTIVE token rotates: old marked rotated, new HASHED token stored + cooked", async () => {
    const raw = realAuth.generateRefreshToken("uid1");
    const { res, jar } = await refreshAs({
      raw,
      userDoc: makeSessionUser(realAuth.hashToken(raw)),
    });

    expect(res.status).toBe(200);

    // 1) old entry flagged with rotatedAt (elemMatch targets exactly it)
    const markCall = U().updateOne.mock.calls.find(
      ([, u]) => u.$set && "refreshTokens.$.rotatedAt" in u.$set
    );
    expect(markCall).toBeDefined();
    expect(markCall[0].refreshTokens.$elemMatch.token).toBe(
      realAuth.hashToken(raw)
    );

    // 2) a NEW hashed token joined the array — never the raw JWT
    const pushCall = U().updateOne.mock.calls.find(([, u]) => u.$push)?.[1];
    expect(pushCall.$push.refreshTokens.token).toMatch(/^[a-f0-9]{64}$/);
    // and it corresponds to the freshly issued cookie
    expect(pushCall.$push.refreshTokens.token).toBe(
      realAuth.hashToken(jar.refreshToken)
    );
    expect(jar.refreshToken).not.toBe(raw); // actually rotated

    // 3) fresh access token too
    expect(jar.accessToken).toBeTruthy();
  });

  it("ROTATED token within the grace window → access-only mint (multi-tab safe)", async () => {
    const raw = realAuth.generateRefreshToken("uid1");
    const { res, jar } = await refreshAs({
      raw,
      userDoc: makeSessionUser(realAuth.hashToken(raw), new Date(Date.now() - 30_000)),
    });

    expect(res.status).toBe(200);
    // NO rotation happened: no $push, no rotatedAt writes
    expect(U().updateOne.mock.calls.some(([, u]) => u.$push)).toBe(false);
    expect(
      U().updateOne.mock.calls.some(
        ([, u]) =>
          "refreshTokens.$.rotatedAt" in ((u && u.$set) || {})
      )
    ).toBe(false);
    // access token still refreshed so the waiting tab can proceed
    expect(jar.accessToken).toBeTruthy();
  });

  it("ROTATED token PAST grace = theft: every session revoked, cookies cleared", async () => {
    const raw = realAuth.generateRefreshToken("uid1");
    const { res, store } = await refreshAs({
      raw,
      userDoc: makeSessionUser(realAuth.hashToken(raw), new Date(Date.now() - 6 * 60_000)),
    });

    expect(res.status).toBe(401);
    const revoke = U().updateOne.mock.calls.find(([, u]) =>
      Array.isArray(u.$set?.refreshTokens)
    );
    expect(revoke?.[1].$set.refreshTokens).toEqual([]);
    expect(store.delete).toHaveBeenCalledWith("refreshToken");
    expect(store.delete).toHaveBeenCalledWith("accessToken");
  });

  it("transient DB outage → retryable 500 WITHOUT clearing cookies", async () => {
    const raw = realAuth.generateRefreshToken("uid1"); // valid JWT first
    const { res, store } = await refreshAs({ raw, dbFail: true });

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({
      error: /Could not refresh session/,
    });
    expect(store.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- logout

describe("POST /api/auth/logout", () => {
  const realAuthPromise = import("@/lib/auth");

  it("pulls this session by hash OR legacy raw, always clears cookies", async () => {
    const realAuth = await realAuthPromise;
    const raw = realAuth.generateRefreshToken("uid1");
    const { store } = (() => {
      const s = installJar({ refreshToken: raw, accessToken: "acc" });
      return { store: s.store };
    })();

    const { POST } = await loadLogout();
    const res = await POST(new Request("http://localhost/api/auth/logout", { method: "POST" }));

    expect(res.status).toBe(200);
    const [filter, update] = U().updateOne.mock.calls[0];
    expect(filter._id).toBe("uid1");
    expect(update.$pull.refreshTokens.token.$in).toEqual([
      realAuth.hashToken(raw),
      raw,
    ]);
    expect(store.delete).toHaveBeenCalledWith("accessToken");
    expect(store.delete).toHaveBeenCalledWith("refreshToken");
  });

  it("still clears cookies when the DB explodes (logout must never trap)", async () => {
    installJar({ refreshToken: "x.y.z" });
    U().updateOne.mockRejectedValueOnce(new Error("db down"));

    const { POST } = await loadLogout();
    const res = await POST(new Request("http://localhost/api/auth/logout", { method: "POST" }));
    expect(res.status).toBe(200);
  });

  it("works with no cookie at all", async () => {
    const { store } = installJar({});
    const { POST } = await loadLogout();
    const res = await POST(new Request("http://localhost/api/auth/logout", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(store.delete).toHaveBeenCalledTimes(2);
    expect(U().updateOne).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/logout-all", () => {
  it("requires a refresh cookie", async () => {
    installJar({});
    const { POST } = await loadLogoutAll();
    const res = await POST(new Request("http://localhost/api/auth/logout-all", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("empties every session and clears local cookies", async () => {
    // route verifyToken()s the cookie → must be a REAL JWT
    const realAuth = await import("@/lib/auth");
    const raw = realAuth.generateRefreshToken("uid1");
    installJar({ refreshToken: raw, accessToken: "a" });

    const { POST } = await loadLogoutAll();
    const res = await POST(new Request("http://localhost/api/auth/logout-all", { method: "POST" }));

    expect(res.status).toBe(200);
    const [filter, update] = U().updateOne.mock.calls[0];
    expect(filter._id).toBe("uid1");
    expect(update.$set.refreshTokens).toEqual([]);
  });

  it("is HONEST on DB failure (500) but still logs THIS device out", async () => {
    const realAuth = await import("@/lib/auth");
    const raw = realAuth.generateRefreshToken("uid1");
    const { store } = installJar({ refreshToken: raw, accessToken: "a" });
    U().updateOne.mockRejectedValueOnce(new Error("db down"));

    const { POST } = await loadLogoutAll();
    const res = await POST(new Request("http://localhost/api/auth/logout-all", { method: "POST" }));

    expect(res.status).toBe(500);
    expect(store.delete).toHaveBeenCalledWith("accessToken");
    expect(store.delete).toHaveBeenCalledWith("refreshToken");
  });
});
