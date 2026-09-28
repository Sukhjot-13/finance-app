// test/suites/manager-integration.suite.js — src/lib/manager/index.js
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const MANAGER_ENV = {
  MANAGER_ENDPOINT: "http://127.0.0.1:3300",
  MANAGER_APP_ID: "finance-app",
  MANAGER_LOG_KEY: "mlk_test_key",
  MANAGER_ANALYTICS_KEY: "mak_test_key",
};

const MANAGER_CLIENT_ENV = {
  NEXT_PUBLIC_MANAGER_ENDPOINT: "http://127.0.0.1:3300",
  NEXT_PUBLIC_MANAGER_APP_ID: "finance-app",
  NEXT_PUBLIC_MANAGER_CLIENT_KEY: "mck_test_key",
  NEXT_PUBLIC_MANAGER_ANALYTICS_KEY: "mak_test_key",
};

const MANAGER_VARS = [
  "MANAGER_ENDPOINT",
  "MANAGER_APP_ID",
  "MANAGER_LOG_KEY",
  "MANAGER_ANALYTICS_KEY",
  "MANAGER_LOG_SOURCE",
  "NEXT_PUBLIC_MANAGER_ENDPOINT",
  "NEXT_PUBLIC_MANAGER_APP_ID",
  "NEXT_PUBLIC_MANAGER_CLIENT_KEY",
  "NEXT_PUBLIC_MANAGER_ANALYTICS_KEY",
];

const setEnv = (values) => {
  for (const key of MANAGER_VARS) delete process.env[key];
  for (const [key, value] of Object.entries(values ?? {})) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

const loadManager = async () => {
  vi.resetModules();
  delete globalThis.__managerServerLogger;
  return import("@/lib/manager");
};

describe("manager integration module", () => {
  beforeEach(() => setEnv({}));
  afterEach(() => {
    setEnv({});
    delete globalThis.__managerServerLogger;
  });

  it("is fully disabled (no-ops) when nothing is configured", async () => {
    const { managerConfig, getManagerLogger, logServerEvent, logServerError, managerTrackerScript } =
      await loadManager();

    expect(managerConfig.enabled).toBe(false);
    expect(() => logServerEvent("noop_event", { a: 1 })).not.toThrow();
    expect(() => logServerError("noop_error", new Error("x"))).not.toThrow();
    expect(managerTrackerScript()).toBeNull();

    const log = getManagerLogger();
    for (const level of ["trace", "debug", "info", "warn", "error", "fatal"]) {
      expect(() => log[level]("message", { a: 1 })).not.toThrow();
    }
    expect(() => log.child({ requestId: "r1" }).info("child")).not.toThrow();
    expect(log.timeEnd("timer")).toBe(0);
    await expect(log.flush()).resolves.toBeUndefined();
  });

  it("enables itself when endpoint, app id and key are present", async () => {
    setEnv(MANAGER_ENV);
    const { managerConfig } = await loadManager();
    expect(managerConfig.enabled).toBe(true);
    expect(managerConfig.appId).toBe("finance-app");
    expect(managerConfig.analyticsKey).toBe("mak_test_key");
  });

  it("keeps the client half disabled without the NEXT_PUBLIC_ block", async () => {
    setEnv(MANAGER_ENV);
    const { managerClientConfig, managerTrackerScript } = await loadManager();
    expect(managerClientConfig.enabled).toBe(false);
    expect(managerClientConfig.apiKey).toBeNull();
    expect(managerTrackerScript()).toBeNull();
  });

  it("enables the client half from the NEXT_PUBLIC_ block, not the server vars", async () => {
    setEnv({ ...MANAGER_ENV, ...MANAGER_CLIENT_ENV });
    const { managerClientConfig, managerTrackerScript } = await loadManager();
    expect(managerClientConfig.enabled).toBe(true);
    expect(managerClientConfig.apiKey).toBe("mck_test_key");
    expect(managerTrackerScript()).toEqual({
      src: "http://127.0.0.1:3300/t.js?v=1",
      appId: "finance-app",
      key: "mak_test_key",
    });
  });

  it("stays disabled when only the analytics key is set", async () => {
    setEnv({ MANAGER_ANALYTICS_KEY: "mak_test_key" });
    const { managerConfig } = await loadManager();
    expect(managerConfig.enabled).toBe(false);
  });

  it("treats blank values as unconfigured", async () => {
    setEnv({ ...MANAGER_ENV, MANAGER_LOG_KEY: "   " });
    const { managerConfig } = await loadManager();
    expect(managerConfig.enabled).toBe(false);
  });

  it("builds a versioned tracker script tag only when analytics is configured", async () => {
    setEnv(MANAGER_CLIENT_ENV);
    const { managerTrackerScript } = await loadManager();
    expect(managerTrackerScript()).toEqual({
      src: "http://127.0.0.1:3300/t.js?v=1",
      appId: "finance-app",
      key: "mak_test_key",
    });
  });

  it("omits the tracker when the analytics key is missing", async () => {
    setEnv({ ...MANAGER_CLIENT_ENV, NEXT_PUBLIC_MANAGER_ANALYTICS_KEY: undefined });
    const { managerTrackerScript } = await loadManager();
    expect(managerTrackerScript()).toBeNull();
  });

  it("managerLog is a safe no-op when unconfigured", async () => {
    const { managerLog } = await loadManager();
    expect(() => managerLog("info", "x", { a: 1 })).not.toThrow();
    expect(() => managerLog("nonsense_level", "x")).not.toThrow();
    expect(() => managerLog("error", "x", { error: new Error("boom") })).not.toThrow();
  });

  it("batches routine levels but flushes errors immediately (leading edge)", async () => {
    setEnv(MANAGER_ENV);
    const { managerLog } = await loadManager();
    const info = vi.fn();
    const error = vi.fn();
    const flush = vi.fn(async () => {});
    globalThis.__managerServerLogger = { info, error, flush };

    managerLog("info", "routine_1");
    managerLog("info", "routine_2");
    expect(flush).not.toHaveBeenCalled();

    managerLog("error", "urgent_1");
    expect(error).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledTimes(1);

    // A second error inside the gap must not start another request on its own.
    managerLog("error", "urgent_2");
    expect(flush).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(flush).toHaveBeenCalledTimes(2);
  });

  it("exposes the SDK drop count, and 0 when unconfigured", async () => {
    setEnv(MANAGER_ENV);
    const { getManagerDroppedCount } = await loadManager();
    expect(getManagerDroppedCount()).toBe(0);

    globalThis.__managerServerLogger = { droppedCount: () => 42 };
    expect(getManagerDroppedCount()).toBe(42);

    setEnv({});
    const unconfigured = await loadManager();
    expect(unconfigured.getManagerDroppedCount()).toBe(0);
  });

  it("falls back to info for an unknown level", async () => {
    setEnv(MANAGER_ENV);
    const { managerLog } = await loadManager();
    const info = vi.fn();
    globalThis.__managerServerLogger = { info, flush: vi.fn(async () => {}) };
    managerLog("not_a_level", "x");
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][0]).toBe("x");
  });

  it("shares one logger instance across module instances via globalThis", async () => {
    setEnv(MANAGER_ENV);
    const { startManagerLogger, getManagerLogger } = await loadManager();
    const first = startManagerLogger();
    const second = getManagerLogger();
    expect(second).toBe(first);
    expect(globalThis.__managerServerLogger).toBe(first);
  });

  it("creates a real SDK logger when configured", async () => {
    setEnv(MANAGER_ENV);
    const { startManagerLogger } = await loadManager();
    const log = startManagerLogger();
    for (const level of ["trace", "debug", "info", "warn", "error", "fatal"]) {
      expect(typeof log[level]).toBe("function");
    }
    expect(typeof log.child).toBe("function");
    expect(typeof log.flush).toBe("function");
    expect(typeof log.traceId).toBe("function");
  });
});
