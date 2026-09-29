"use client";

/**
 * Boots the Manager browser logger and injects the analytics tracker.
 * Renders nothing. Mounted once in the root layout.
 *
 * Three rules this component exists to enforce:
 *
 *   1. ONE logger per browser window. `initLogger` installs console
 *      interception, `error`/`unhandledrejection` listeners and a `fetch`
 *      wrapper. A second instance would double every listener and every upload,
 *      so the instance is cached on `window.__managerClientLogger` and the
 *      effect is a no-op if one already exists. This is what makes the provider
 *      safe under React Strict Mode's double-mount, Fast Refresh, and repeated
 *      provider mounts.
 *
 *   2. Analytics is INDEPENDENT of browser logging. It is gated on its own
 *      `mak_` key, so analytics still loads on a deployment that has no client
 *      log key (and logging still works without analytics). The two halves must
 *      not share a guard.
 *
 *   3. The analytics key travels in a `data-key` attribute, never in the URL.
 *      A key in a query string leaks via history, referrers and server logs.
 */
import { useEffect } from "react";

import { managerClientConfig, managerTrackerScript } from "./config.js";
import { initLogger } from "./logger.js";
import { REDACT_KEYS } from "./server-options.js";
/** Window-level singleton slots, deliberately on `window` and not module scope. */
const LOGGER_SLOT = "__managerClientLogger";
const TRACKER_ID = "manager-tracker";

export default function ManagerProvider() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    startClientLogger();
    injectTracker();
  }, []);

  return null;
}

/**
 * Creates the browser logger at most once per window.
 * Returns the existing instance, or null when logging is not configured.
 */
function startClientLogger() {
  if (!managerClientConfig.logsEnabled) return null;
  if (window[LOGGER_SLOT]) return window[LOGGER_SLOT];

  try {
    const log = initLogger({
      endpoint: managerClientConfig.endpoint,
      appId: managerClientConfig.appId,
      apiKey: managerClientConfig.apiKey,
      environment:
        process.env.NODE_ENV === "production" ? "production" : "development",
      release: process.env.NEXT_PUBLIC_RELEASE || "web",
      captureConsole: ["warn", "error"],
      captureGlobalErrors: true,
      captureFetch: true,
      redactKeys: REDACT_KEYS,
    });
    window[LOGGER_SLOT] = log;
    log.info("manager_logger_started", { source: "client" });
    return log;
  } catch {
    /* observability must never break the app */
    return null;
  }
}

/**
 * Injects the tracker `<script>` at most once per document.
 *
 * `document.getElementById` is the dedupe check, so a second mount (Strict
 * Mode, Fast Refresh) cannot add a duplicate tag. `head` rather than `body`:
 * the tracker is async and should not be appended after the app's own markup.
 */
function injectTracker() {
  const tracker = managerTrackerScript();
  if (!tracker) return;
  if (document.getElementById(TRACKER_ID)) return;

  try {
    const script = document.createElement("script");
    script.id = TRACKER_ID;
    script.async = true;
    script.src = tracker.src;
    script.dataset.app = tracker.appId;
    script.dataset.key = tracker.key;
    document.head.appendChild(script);
  } catch {
    /* a blocked or failed tracker load must not break the app */
  }
}
