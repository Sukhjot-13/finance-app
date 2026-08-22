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

    await expect(recordHit("k", 1000)).resolves.toBeUndefined();
    await expect(countRecentHits("k", 1000)).resolves.toBe(0);
  });

  it("popLastHit/resetKey also fail open on DB errors", async () => {
    RL.updateOne.mockRejectedValueOnce(new Error("db down"));
    RL.deleteOne.mockRejectedValueOnce(new Error("db down"));
    const { popLastHit, resetKey } = await loadLib();

    await expect(popLastHit("k")).resolves.toBeUndefined();
    await expect(resetKey("k")).resolves.toBeUndefined();
  });
});
