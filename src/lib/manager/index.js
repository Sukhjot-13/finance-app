/**
 * Manager integration — public entry point.
 *
 * Configure (Vercel or .env.local):
 *   MANAGER_ENDPOINT      https://manager.example.com   (Manager's OWN origin)
 *   MANAGER_APP_ID        finance-app
 *   MANAGER_LOG_KEY       mlk_…   (server only — never NEXT_PUBLIC_, never HTML)
 *   MANAGER_ANALYTICS_KEY mak_…   (tracker)
 *
 *   NEXT_PUBLIC_MANAGER_ENDPOINT      https://manager.example.com
 *   NEXT_PUBLIC_MANAGER_APP_ID        finance-app
 *   NEXT_PUBLIC_MANAGER_CLIENT_KEY    mck_…  (browser — NOT the server key)
 *   NEXT_PUBLIC_MANAGER_ANALYTICS_KEY mak_…
 *
 * With none of these set the whole integration is a set of no-ops: the app
 * keeps working and no Manager traffic is generated, so local development, CI
 * and previews are never broken by (or dependent on) the observability service.
 *
 * Module map — import the narrowest one you need:
 *   config.js            env reads only; safe in server AND client code
 *   server.js            server-only: logger lifecycle, withManagerLogs, ALS
 *   ManagerProvider.jsx  browser: client logger + analytics tracker
 *   logger.js            the vendored SDK (GENERATED — do not hand-edit)
 *
 * This file is the shared facade and is safe to import from EITHER side: it
 * re-exports only `config.js`, which has no imports at all. The server helpers
 * live behind `./server.js`, which pulls in `next/server` and
 * `node:async_hooks` — so server code must import them by their full path
 * (`@/lib/manager/server`), never through here. Keeping that split is what
 * stops a client module from dragging `next/server` into the browser bundle,
 * and it keeps the SDK reachable from plain-Node scripts.
 *
 * See README.md § "Manager integration" for the full contract.
 */
export {
  managerConfig,
  managerClientConfig,
  managerTrackerScript,
} from "./config.js";
