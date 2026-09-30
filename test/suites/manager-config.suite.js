// test/suites/manager-config.suite.js — config resolution, the browser
// provider, and the module boundary that keeps server-only code out of the
// browser bundle.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const SERVER_ENV = {
  MANAGER_ENDPOINT: "http://127.0.0.1:3300",
  MANAGER_APP_ID: "finance-app",
  MANAGER_LOG_KEY: "mlk_server_key",
  MANAGER_ANALYTICS_KEY: "mak_analytics_key",
};

const CLIENT_ENV = {
  NEXT_PUBLIC_MANAGER_ENDPOINT: "http://127.0.0.1:3300",
  NEXT_PUBLIC_MANAGER_APP_ID: "finance-app",
  NEXT_PUBLIC_MANAGER_CLIENT_KEY: "mck_client_key",
  NEXT_PUBLIC_MANAGER_ANALYTICS_KEY: "mak_analytics_key",
};

const MANAGER_VARS = Object.keys({ ...SERVER_ENV, ...CLIENT_ENV });

const setEnv = (values) => {
  for (const key of MANAGER_VARS) delete process.env[key];
  for (const [key, value] of Object.entries(values ?? {})) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

const loadConfig = async () => {
  vi.resetModules();
  return import("@/lib/manager/config");
};

describe("manager config", () => {
  beforeEach(() => setEnv({}));
  afterEach(() => setEnv({}));

  it("stays fully disabled when nothing is configured", async () => {
    const { managerConfig, managerClientConfig, managerTrackerScript } =
      await loadConfig();
    expect(managerConfig.enabled).toBe(false);
    expect(managerClientConfig.logsEnabled).toBe(false);
    expect(managerClientConfig.apiKey).toBeNull();
    expect(managerTrackerScript()).toBeNull();
  });

  it("enables the server half from endpoint + app id + server key", async () => {
    setEnv(SERVER_ENV);
    const { managerConfig } = await loadConfig();
    expect(managerConfig).toMatchObject({
      enabled: true,
      endpoint: "http://127.0.0.1:3300",
      appId: "finance-app",
      apiKey: "mlk_server_key",
    });
  });

  it("requires the server key: endpoint + app id alone stay disabled", async () => {
    setEnv({ MANAGER_ENDPOINT: "http://127.0.0.1:3300", MANAGER_APP_ID: "finance-app" });
    const { managerConfig } = await loadConfig();
    expect(managerConfig.enabled).toBe(false);
  });

  it("treats blank/whitespace values as unconfigured", async () => {
    setEnv({ ...SERVER_ENV, MANAGER_LOG_KEY: "   " });
    expect((await loadConfig()).managerConfig.enabled).toBe(false);

    setEnv({ ...CLIENT_ENV, NEXT_PUBLIC_MANAGER_ENDPOINT: "" });
    expect((await loadConfig()).managerClientConfig.logsEnabled).toBe(false);
  });

  it("reads the browser block from NEXT_PUBLIC_ vars, never the server ones", async () => {
    setEnv(SERVER_ENV); // no NEXT_PUBLIC_ block at all
    const { managerClientConfig } = await loadConfig();
    expect(managerClientConfig.logsEnabled).toBe(false);
    expect(managerClientConfig.apiKey).toBeNull();
  });

  it("gives the browser the client key, never the server key", async () => {
    setEnv({ ...SERVER_ENV, ...CLIENT_ENV });
    const { managerConfig, managerClientConfig } = await loadConfig();
    expect(managerConfig.apiKey).toBe("mlk_server_key");
    expect(managerClientConfig.apiKey).toBe("mck_client_key");
    // Manager derives an entry's source from the key kind, and shipping the
    // server key to a browser would leak it.
    expect(managerClientConfig.apiKey).not.toBe(managerConfig.apiKey);
  });

  it("keeps analytics independent of the client log key", async () => {
    setEnv({
      NEXT_PUBLIC_MANAGER_ENDPOINT: "http://127.0.0.1:3300",
      NEXT_PUBLIC_MANAGER_APP_ID: "finance-app",
      NEXT_PUBLIC_MANAGER_ANALYTICS_KEY: "mak_analytics_key",
    });
    const { managerClientConfig, managerTrackerScript } = await loadConfig();
    // No mck_ key => browser LOGS are off …
    expect(managerClientConfig.logsEnabled).toBe(false);
    // … but analytics is still fully configured and must still load.
    expect(managerClientConfig.analyticsKey).toBe("mak_analytics_key");
    expect(managerTrackerScript()).toEqual({
      src: "http://127.0.0.1:3300/t.js?v=1",
      appId: "finance-app",
      key: "mak_analytics_key",
    });
  });

  it("builds the tracker with the key in data-*, never in the URL", async () => {
    setEnv(CLIENT_ENV);
    const { managerTrackerScript } = await loadConfig();
    const tracker = managerTrackerScript();
    expect(tracker.src).toBe("http://127.0.0.1:3300/t.js?v=1");
    expect(tracker.src).not.toContain("mak_analytics_key");
    expect(tracker.key).toBe("mak_analytics_key");
  });

  it("normalizes a trailing slash on the endpoint", async () => {
    setEnv({ ...CLIENT_ENV, NEXT_PUBLIC_MANAGER_ENDPOINT: "https://m.example.com/" });
    expect((await loadConfig()).managerTrackerScript().src).toBe(
      "https://m.example.com/t.js?v=1"
    );
  });

  it("omits the tracker when the analytics key is missing", async () => {
    setEnv({ ...CLIENT_ENV, NEXT_PUBLIC_MANAGER_ANALYTICS_KEY: undefined });
    expect((await loadConfig()).managerTrackerScript()).toBeNull();
  });

  it("uses only STATIC process.env member expressions for client values", () => {
    // A dynamic `process.env[name]` read is NOT inlined by Next.js into the
    // client bundle — it compiles to an index into an empty object — so browser
    // config would silently be undefined in production. This is the exact bug
    // the module split exists to prevent.
    const source = readFileSync(
      path.resolve(import.meta.dirname, "../../src/lib/manager/config.js"),
      "utf8"
    );
    const clientSection = source.slice(
      source.indexOf("export const managerClientConfig")
    );
    expect(clientSection).not.toMatch(/process\.env\s*\[/);
    // Every browser-visible variable must appear as a literal member access.
    for (const name of Object.keys(CLIENT_ENV)) {
      expect(clientSection).toContain(`process.env.${name}`);
    }
  });
});

describe("browser provider", () => {
  const sdkShutdowns = new Set();
  let realFetch;
  beforeEach(() => {
    setEnv({});
    localStorage.removeItem("manager.logger.queue");
    realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      Response.json({ accepted: 0, rejected: 0 })
    );
    delete window.__managerClientLogger;
    document.getElementById("manager-tracker")?.remove();
    document.head.innerHTML = "";
  });
  afterEach(() => {
    // resetModules creates separate SDK registries: close every mounted graph.
    for (const shutdown of sdkShutdowns) shutdown();
    sdkShutdowns.clear();
    localStorage.removeItem("manager.logger.queue");
    globalThis.fetch = realFetch;
    setEnv({});
    delete window.__managerClientLogger;
    document.getElementById("manager-tracker")?.remove();
  });

  const mount = async () => {
    vi.resetModules();
    const { default: ManagerProvider } = await import(
      "@/lib/manager/ManagerProvider"
    );
    const { shutdownLoggers } = await import("@/lib/manager/logger");
    sdkShutdowns.add(shutdownLoggers);
    const { render } = await import("@testing-library/react");
    const { createElement } = await import("react");
    return render(createElement(ManagerProvider));
  };

  it("starts exactly ONE browser logger however many times it mounts", async () => {
    setEnv(CLIENT_ENV);
    const { unmount } = await mount();
    const first = window.__managerClientLogger;
    expect(first).toBeTruthy();

    // Strict Mode / Fast Refresh / a repeated provider mount must not create a
    // second instance: that would double every console listener and every
    // upload.
    unmount();
    await mount();
    expect(window.__managerClientLogger).toBe(first);

    await mount();
    expect(window.__managerClientLogger).toBe(first);
  });

  it("installs the analytics tracker exactly once", async () => {
    setEnv(CLIENT_ENV);
    await mount();
    expect(document.querySelectorAll("#manager-tracker")).toHaveLength(1);

    await mount();
    await mount();
    expect(document.querySelectorAll("#manager-tracker")).toHaveLength(1);
  });

  it("carries the app id and analytics key as data attributes", async () => {
    setEnv(CLIENT_ENV);
    await mount();
    const script = document.getElementById("manager-tracker");
    expect(script.src).toBe("http://127.0.0.1:3300/t.js?v=1");
    expect(script.dataset.app).toBe("finance-app");
    expect(script.dataset.key).toBe("mak_analytics_key");
    expect(script.async).toBe(true);
  });

  it("still injects analytics when the client log key is absent", async () => {
    setEnv({
      NEXT_PUBLIC_MANAGER_ENDPOINT: "http://127.0.0.1:3300",
      NEXT_PUBLIC_MANAGER_APP_ID: "finance-app",
      NEXT_PUBLIC_MANAGER_ANALYTICS_KEY: "mak_analytics_key",
    });
    await mount();
    expect(window.__managerClientLogger).toBeUndefined();
    expect(document.getElementById("manager-tracker")).toBeTruthy();
  });

  it("still starts the logger when no analytics key is configured", async () => {
    setEnv({ ...CLIENT_ENV, NEXT_PUBLIC_MANAGER_ANALYTICS_KEY: undefined });
    await mount();
    expect(window.__managerClientLogger).toBeTruthy();
    expect(document.getElementById("manager-tracker")).toBeNull();
  });

  it("renders nothing and does nothing when Manager is unconfigured", async () => {
    await mount();
    expect(window.__managerClientLogger).toBeUndefined();
    expect(document.getElementById("manager-tracker")).toBeNull();
  });
});

/** Every .js file under a directory, recursively. */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && entry.name.endsWith(".js") ? [full] : [];
  });
}

describe("manager module boundary", () => {
  const read = (relative) =>
    readFileSync(path.resolve(import.meta.dirname, relative), "utf8");

  /**
   * Only real import/re-export statements, so prose that merely names a module
   * is not mistaken for a dependency.
   */
  const importsOf = (source) =>
    source.match(/^(import|export)\b[^;]*;/gm)?.join("\n") ?? "";

  it("keeps server-only imports out of the browser provider", () => {
    const imports = importsOf(read("../../src/lib/manager/ManagerProvider.jsx"));
    expect(imports).not.toMatch(/next\/server/);
    expect(imports).not.toMatch(/node:async_hooks/);
    expect(imports).not.toMatch(/\.\/server\.js/);
    expect(imports).not.toMatch(/from "\.\/index"/);
    // …and it reads its config from the shared, dependency-free module.
    expect(imports).toContain('from "./config.js"');
  });

  it("keeps the shared config module free of server and SDK imports", () => {
    const imports = importsOf(read("../../src/lib/manager/config.js"));
    expect(imports).not.toMatch(/next\/server|node:async_hooks|\.\/logger\.js|\.\/server\.js/);
  });

  it("keeps the shared facade importable from plain Node", () => {
    // `index.js` must stay dependency-free so scripts (and a client module) can
    // import it without dragging `next/server` / `node:async_hooks` along.
    const imports = importsOf(read("../../src/lib/manager/index.js"));
    expect(imports).toContain('from "./config.js"');
    expect(imports).not.toMatch(/next\/server|node:async_hooks|\.\/server\.js|\.\/logger\.js/);
  });

  it("keeps the server-only module out of every client-bound module", () => {
    // `server.js` imports next/server + node:async_hooks. Any client-bound file
    // that reaches it would break the browser build.
    for (const file of [
      "../../src/lib/manager/config.js",
      "../../src/lib/manager/index.js",
      "../../src/lib/manager/ManagerProvider.jsx",
      "../../src/app/error.js",
      "../../src/app/(main)/error.js",
      "../../src/lib/api.js",
    ]) {
      const source = read(file);
      expect(importsOf(source), file).not.toMatch(/manager\/server|next\/server|node:async_hooks/);
    }
  });

  it("routes every API route through the server module, not the facade", () => {
    // Regression: importing the server helpers through the shared facade used
    // to make the facade pull in `next/server`, which broke plain-Node scripts
    // and risked leaking server-only code into a client bundle.
    const routesDir = path.resolve(import.meta.dirname, "../../src/app/api");
    const offenders = [];
    for (const file of walk(routesDir)) {
      const source = readFileSync(file, "utf8");
      if (/from "@\/lib\/manager"/.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("keeps captureProcessErrors off so Next.js owns process error handling", () => {
    const server = read("../../src/lib/manager/server.js");
    expect(server).toContain("captureProcessErrors: false");
  });

  it("ships the SDK byte-for-byte as Manager serves it (no local edits)", () => {
    // The vendored SDK is a GENERATED file. A hand-patched copy silently loses
    // upstream fixes — which is exactly what had happened here. The only thing
    // a consumer may ever do is re-download it.
    const sdk = read("../../src/lib/manager/logger.js");
    expect(sdk).toContain("GENERATED FILE");
    // The upstream fixes this repo had forked away from.
    expect(sdk).toContain("function sameOrigin(");
    expect(sdk).toContain("const record = { ...(typeof init === \"object\"");
    expect(sdk).toContain("const key = `${entry.traceId}:${fingerprint(");
    expect(sdk).toContain("? meta.error");
  });

  it("tells you how to refresh the SDK when it goes stale", () => {
    const readme = read("../../README.md");
    expect(readme).toMatch(/x-manager-key/);
    expect(readme).toMatch(/api\/sdk\/logger/);
    // A key in a URL leaks through history, referrers and access logs.
    expect(readme).not.toMatch(/[?&]key=/);
  });
});
