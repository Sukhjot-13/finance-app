// test/suites/rate-limit.suite.js — src/lib/rate-limit.js (fail-open contract)
import { describe, it, expect, beforeEach, vi } from "vitest";

const RL = globalThis.__models.rateLimit;

describe("rate-limit lib", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.__dbConnect = vi.fn(async () => ({}));
  });

  const loadLib = () => import("@/lib/rate-limit");

  it("recordHit pushes a timestamp with $slice cap and refreshes expiry", async () => {
    RL.updateOne.mockResolvedValueOnce({});
    const { recordHit } = await loadLib();

    await recordHit("key-1", 60000);

    expect(RL.updateOne).toHaveBeenCalledTimes(1);
    const [filter, update] = RL.updateOne.mock.calls[0];
    expect(filter).toEqual({ key: "key-1" });
    expect(update.$push.hits.$slice).toBe(-100);
    expect(update.$set.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("countRecentHits returns the aggregate count and embeds a window cutoff", async () => {
    RL.aggregate.mockResolvedValueOnce([{ n: 3 }]);
    const { countRecentHits } = await loadLib();

    await expect(countRecentHits("k", 60_000)).resolves.toBe(3);

    // pipeline shape: $match key → $project filtered size with Date cutoff
    const [pipeline] = RL.aggregate.mock.calls[0];
    expect(pipeline[0]).toEqual({ $match: { key: "k" } });
    const filter = pipeline[1].$project.n.$size.$filter;
    expect(filter.input).toBe("$hits");
    expect(filter.cond.$gt[0]).toBe("$$h");
    expect(filter.cond.$gt[1].getTime()).toBeCloseTo(Date.now() - 60_000, -3);
  });

  it("popLastHit pops from the END of the hits array (most recent)", async () => {
    RL.updateOne.mockResolvedValueOnce({});
    const { popLastHit } = await loadLib();

    await popLastHit("k");
    expect(RL.updateOne).toHaveBeenCalledWith({ key: "k" }, { $pop: { hits: 1 } });
  });

  it("resetKey deletes the whole key document", async () => {
    RL.deleteOne.mockResolvedValueOnce({});
    const { resetKey } = await loadLib();

    await resetKey("k");
    expect(RL.deleteOne).toHaveBeenCalledWith({ key: "k" });
  });

  it("FAILS OPEN: DB errors never throw and read as zero hits", async () => {
    RL.updateOne.mockRejectedValueOnce(new Error("db down"));
    RL.aggregate.mockRejectedValueOnce(new Error("db down"));
    const { recordHit, countRecentHits } = await loadLib();

    const manager = await import("@/lib/manager/server");
    const report = vi.spyOn(manager, "logServerError").mockImplementation(() => {});
    try {
      await expect(recordHit("k", 1000)).resolves.toBeUndefined();
      await expect(countRecentHits("k", 1000)).resolves.toBe(0);
      expect(report.mock.calls.map(([message]) => message)).toEqual([
        "Rate-limit recordHit failed", "Rate-limit countRecentHits failed",
      ]);
      expect(JSON.stringify(report.mock.calls)).not.toContain('"k"');
    } finally { report.mockRestore(); }
  });

  it("popLastHit/resetKey also fail open on DB errors", async () => {
    RL.updateOne.mockRejectedValueOnce(new Error("db down"));
    RL.deleteOne.mockRejectedValueOnce(new Error("db down"));
    const { popLastHit, resetKey } = await loadLib();

    await expect(popLastHit("k")).resolves.toBeUndefined();
    await expect(resetKey("k")).resolves.toBeUndefined();
  });

  it("getClientIp prefers request.ip and NEVER trusts a client header", async () => {
    const { getClientIp } = await loadLib();
    const req = (headers, ip) => ({ headers: new Headers(headers), ip });

    // request.ip comes from the framework's socket peer, not a header.
    expect(getClientIp(req({ "x-real-ip": "6.6.6.6" }, "5.5.5.5"))).toBe("5.5.5.5");

    // The x-real-ip PREFERENCE is gone: it is a plain request header and was
    // trivially rotated to reset both per-IP buckets.
    expect(getClientIp(req({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" }))).toBe("1.1.1.1");
    // without x-forwarded-for, x-real-ip is ignored entirely
    expect(getClientIp(req({ "x-real-ip": "9.9.9.9" }))).toBe("unknown");
    // LAST forwarded entry (edge-appended), never the first client-supplied one
    expect(getClientIp(req({ "x-forwarded-for": "spoofed, 2.2.2.2" }))).toBe("2.2.2.2");
    expect(getClientIp(req({ "x-forwarded-for": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(getClientIp(req({}))).toBe("unknown");
  });

  it("a rotated x-real-ip cannot reset the OTP send bucket", async () => {
    const { getClientIp } = await loadLib();
    const keys = new Set();
    for (const spoofed of ["1.1.1.1", "2.2.2.2", "3.3.3.3", "4.4.4.4", "5.5.5.5"]) {
      keys.add(getClientIp({ headers: new Headers({ "x-real-ip": spoofed }) }));
    }
    // Every request lands in the SAME "unknown" bucket, so the 20/hour
    // per-IP cap cannot be sidestepped by rotating the header.
    expect([...keys]).toEqual(["unknown"]);
  });

  it("recordHitAndCount allows up to max, denies beyond, and fails open", async () => {
    const { recordHitAndCount } = await loadLib();

    // at the cap → still allowed
    RL.updateOne.mockResolvedValueOnce({});
    RL.aggregate.mockResolvedValueOnce([{ n: 5 }]);
    await expect(recordHitAndCount("k", 60_000, 5)).resolves.toMatchObject({
      allowed: true,
      count: 5,
    });

    // one over → denied
    RL.updateOne.mockResolvedValueOnce({});
    RL.aggregate.mockResolvedValueOnce([{ n: 6 }]);
    await expect(recordHitAndCount("k", 60_000, 5)).resolves.toMatchObject({
      allowed: false,
      count: 6,
    });

    // DB down → fail open
    RL.updateOne.mockRejectedValueOnce(new Error("db down"));
    await expect(recordHitAndCount("k", 60_000, 5)).resolves.toMatchObject({
      allowed: true,
      count: 0,
    });
  });
});
