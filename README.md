# FinTrack - Personal Finance Tracker

FinTrack is a full-stack web application designed to help users manage their personal finances. It provides a clean, intuitive interface for tracking income and expenses, viewing detailed reports, and gaining insights into spending habits. The application features a secure, OTP-based authentication system and is built with a modern tech stack including Next.js, MongoDB, and Tailwind CSS.

---

## ✨ Features

- **Secure Authentication**: Passwordless, one-time password (OTP) login sent via email.
- **Dashboard Overview**: At-a-glance view of current balance, monthly income, and monthly expenses.
- **Transaction Management**: Easily add, view, edit, and delete income and expense transactions. Edit transactions with a full-featured modal, including the ability to change the description.
- **Dynamic Categories**: Pre-defined categories for income/expenses with the ability to add custom ones on the fly from the transaction creation form.
- **Financial Reports**: Generate and view detailed financial reports for custom date ranges.
- **User Profile Management**: Users can update their account name and preferred currency.
- **Responsive Design**: Fully responsive interface that works on desktops, tablets, and mobile devices.

---

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

Make sure you have the following software installed on your machine:

- [Node.js](https://nodejs.org/en/) (v22.12+; v24 recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [MongoDB](https://www.mongodb.com/try/download/community) (or a MongoDB Atlas account)

### Installation

1.  **Clone the repository:**

    ```bash
    git clone [https://github.com/your-username/finance-app.git](https://github.com/your-username/finance-app.git)
    cd finance-app
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    # or
    yarn install
    ```

3.  **Set up environment variables:**
    Create a file named `.env.local` in the root of the project and add the necessary environment variables listed in the section below.

4.  **Run the development server:**
    ```bash
    npm run dev
    # or
    yarn dev
    ```
    Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

---

## 🔑 Environment Variables

Copy [`.env.example`](.env.example) to `.env.local` locally, or set these in
Finance's hosted project environment. Give this app its own MongoDB database and
independent signing secrets. All values below are placeholders.

### Required for normal app use

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection including Finance's database name, e.g. `fintrack_db`; also stores rate-limit records. |
| `ACCESS_TOKEN_SECRET` | Access-token signing secret, at least 32 characters. |
| `REFRESH_TOKEN_SECRET` | Different refresh-token signing secret, at least 32 characters. Also supply at build time for protected-page proxy checks. |
| `BREVO_API_KEY` | Brevo transactional email key for OTP login. |
| `EMAIL_FROM` | Verified Brevo sender email address. Finance uses this name; Resume Builder uses `BREVO_SENDER_EMAIL`. |

Generate the two signing secrets separately with `openssl rand -hex 32`.
`JWT_SECRET` is unused and is not needed.

```dotenv
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER/fintrack_db?retryWrites=true&w=majority
ACCESS_TOKEN_SECRET=REPLACE_WITH_RANDOM_ACCESS_SECRET
REFRESH_TOKEN_SECRET=REPLACE_WITH_DIFFERENT_REFRESH_SECRET
BREVO_API_KEY=REPLACE_WITH_BREVO_KEY
EMAIL_FROM=noreply@example.com
```

No permissions/roles seed is needed for a fresh Finance database. Users, financial
records and indexes are created through the normal application/model lifecycle.

### Optional: Manager (centralized logging + analytics)

FinTrack can send its server error logs and page analytics to **Manager**, a personal
project control center. With no `MANAGER_*` variables set nothing changes: the
integration is a set of no-ops, so local development, CI and previews are unaffected.

| Variable | Required for | Value |
|---|---|---|
| `MANAGER_ENDPOINT` | server logs | base URL of the **Manager** deployment — not this app's own port |
| `MANAGER_APP_ID` | server logs | project slug in Manager |
| `MANAGER_LOG_KEY` | server logs | `mlk_…` **server** key — server-only, never a `NEXT_PUBLIC_` value |
| `NEXT_PUBLIC_MANAGER_ENDPOINT` | browser logs + analytics | same value as `MANAGER_ENDPOINT` |
| `NEXT_PUBLIC_MANAGER_APP_ID` | browser logs + analytics | same value as `MANAGER_APP_ID` |
| `NEXT_PUBLIC_MANAGER_CLIENT_KEY` | browser logs | `mck_…` **client** key |
| `NEXT_PUBLIC_MANAGER_ANALYTICS_KEY` | analytics | `mak_…` analytics key |
| `MANAGER_ANALYTICS_KEY` | `manager:check` | same `mak_…` key as the public analytics value; the browser tracker reads `NEXT_PUBLIC_MANAGER_ANALYTICS_KEY` |

There is no `MANAGER_LOG_SOURCE`: Manager derives each entry's `source` from the key
kind, so the key you use already decides whether a row is a `server` or `client` row.
(`mak_…` keys write analytics events only and can never write logs.)

**`NEXT_PUBLIC_*` values are inlined at BUILD time.** Changing one requires a rebuild, not
just a restart — a restart alone leaves the old value compiled into the bundle.

**The `NEXT_PUBLIC_` block is required for the browser half, not optional.** Next.js
only inlines *statically written* `process.env.NEXT_PUBLIC_FOO` member expressions into
the client bundle. Two traps, both verified against a production build of this repo:
`process.env` in browser code is an empty object, and a *dynamic* lookup
(`process.env[name]`, i.e. any `env(name)` helper) compiles to a runtime index into that
same empty object — equally dead. So every browser value in `src/lib/manager/config.js` is
written out statically.

Use the project's **client** key (`mck_…`) there. Reusing `mlk_…` would leak the server
key to every visitor; Manager derives an entry's `source` from the key kind, so browser
entries must carry the client key.

`MANAGER_ENDPOINT` is Manager's own base URL (`http://127.0.0.1:3300` when you run
Manager on port 3300). Manager's regular dev command defaults to 3000, so run it with
`npm run dev -- --port 3300` in the Manager folder when Finance uses port 3000.
Point the integration at that Manager origin, not Finance's origin.

### Other optional settings and local tools

| Variable | Purpose / default |
|---|---|
| `CAPACITOR_SERVER_URL` | Native iOS wrapper's target site; defaults to `https://fintrack.vistaenvision.com`. Supply when syncing/building a wrapper for another deployment. |
| `NEXT_PUBLIC_RELEASE` | Browser log release label; defaults to `web`. |
| `GIT_SHA` | Server log release label if `VERCEL_GIT_COMMIT_SHA` is unavailable; defaults to `dev`. |
| `MANAGER_CLIENT_KEY` | Checker-only alternative to `NEXT_PUBLIC_MANAGER_CLIENT_KEY`; the browser itself needs the public variable. |
| `APP_ORIGIN` | Checker's Finance origin; defaults to `http://127.0.0.1:3000`. |
| `APP_COOKIE` | Checker-only real test session cookie, enabling authenticated checks; absent means those checks are skipped. |
| `APP_ORIGIN_DEGRADED` | Optional checker target with an unreachable Manager endpoint for outage testing. |
| `MANAGER_MODULE` | Measurement script's integration-module override; defaults to `../src/lib/manager/index.js`. |
| `MEASURE_CHUNK` | Measurement entries per paced chunk; defaults to `20`. |
| `MEASURE_GAP_MS` | Measurement delay between chunks; defaults to `100` ms. |

`NODE_ENV` and `VERCEL_GIT_COMMIT_SHA` are framework/platform-managed, not additional
secrets. Standalone checker/measurement/migration scripts read shell variables and do
not load `.env.local` themselves; supply the relevant variables explicitly in the shell.

For all three channels, create the `finance-app` project in Manager and generate its
own server/client/analytics keys, then set:

```dotenv
MANAGER_ENDPOINT=https://your-manager-host
MANAGER_APP_ID=finance-app
MANAGER_LOG_KEY=mlk_REPLACE_ME
MANAGER_ANALYTICS_KEY=mak_REPLACE_ME
NEXT_PUBLIC_MANAGER_ENDPOINT=https://your-manager-host
NEXT_PUBLIC_MANAGER_APP_ID=finance-app
NEXT_PUBLIC_MANAGER_CLIENT_KEY=mck_REPLACE_ME
NEXT_PUBLIC_MANAGER_ANALYTICS_KEY=mak_REPLACE_ME
```

Restart locally or redeploy after server configuration changes. Rebuild/redeploy for
public variable changes. Separate databases and signing secrets should be used for
Manager, Finance and Resume Builder; no server keys belong in browser configuration.

### Module layout

| Module | Safe in | Responsibility |
|---|---|---|
| `src/lib/manager/config.js` | server **and** browser | Reads `MANAGER_*` / `NEXT_PUBLIC_MANAGER_*`. Zero imports, so nothing server-only can leak into the client bundle. |
| `src/lib/manager/server.js` | **server only** | Logger lifecycle, `withManagerLogs`, trace adoption, request context, flushing. Imports `next/server` and `node:async_hooks`. |
| `src/lib/manager/server-options.js` | server **and** browser | The shared `flushIntervalMs` / `redactKeys` values, so a plain-Node script can reproduce the server logger's configuration. |
| `src/lib/manager/index.js` | either | Facade re-exporting `config.js` only. Server helpers are **not** re-exported here — import them from `@/lib/manager/server` so the browser half can never pull in `next/server`. |
| `src/lib/manager/ManagerProvider.jsx` | **browser only** | Starts the browser logger once per window and injects the analytics tracker. Mounted in `src/app/layout.js`. |
| `src/lib/manager/logger.js` | either | The vendored SDK. **Generated — never hand-edit.** |

### What gets wired up

**Server.** Every route handler export is wrapped with `withManagerLogs(...)` in
`src/app/api/**/route.js` (17 files, 30 verbs). The wrapper:

- gives the request a **child** logger carrying the trace adopted from the incoming
  `x-trace-id` (or a fresh one). It never calls `setContext`/`newTrace` on the shared
  root, so two concurrent requests cannot overwrite each other's trace;
- records one `request_completed` entry with the status the handler actually produced,
  classified as `response` / `redirect` / `export` / `threw` — so successful responses,
  early returns, redirects and CSV exports are all visible, not just failures;
- records an uncaught exception as `unhandled_route_error` **with its stack**, then
  re-throws it, so the app's own error-response policy is unchanged;
- schedules `after(() => root.flush())` so delivery completes after the response on
  every exit path.

Handled failures stay where they already were: the route's own `catch` calls
`logServerError(...)` / `managerLog("warn", ...)`, which now ride the request's logger
and therefore inherit its trace. `console.*` output is unchanged — no app-wide logging
layer was introduced, and there is still no logger of the app's own.

**Browser.** The SDK captures explicit logs, `console.warn` / `console.error`, uncaught
errors, unhandled rejections and same-origin `fetch` outcomes. The instance is cached on
`window.__managerClientLogger`, so Strict Mode, Fast Refresh and repeated provider mounts
cannot install duplicate listeners or duplicate uploads. React error boundaries report
explicitly (`src/app/error.js`, `src/app/(main)/error.js`) because a boundary error never
reaches `window.onerror`.

**Analytics.** One `<script>` tag with `id="manager-tracker"`, injected into `<head>` at
most once. It is gated on its own `mak_` key, so **analytics works with no client log
key**, and browser logging works with no analytics key. `src/proxy.js` adds the Manager
origin to the CSP `connect-src` (log/event uploads) and to `script-src` (the tracker),
so the strict per-request-nonce policy does not silently block either.

### Trace correlation

The browser SDK stamps `x-trace-id` on **same-origin** fetches only — adding it to a
third-party call would force a CORS preflight. The server adopts that header through
`traceIdForHeaders` and scopes it to a request-local child logger, which is also stored in
a Node `AsyncLocalStorage` so deeper code (`lib/recurring.js`, helpers) logs under the
same trace without threading a logger through every call. A client error and the server
line that answered it therefore appear together in Manager under one trace.

`getRequestTraceId()` returns the id this app created. Do **not** use
`childLogger.traceId()` for that: in the vendored SDK a `withTrace()` child *emits* under
its own trace but its `traceId()` accessor reads the shared root's.

### Refreshing the vendored SDK

The SDK is generated by Manager and does **not** update itself. Re-download it whenever
Manager is upgraded; never patch the file by hand (a hand-patched copy silently loses
upstream fixes — see `docs/suggestions.md`).

```bash
# The key travels in a HEADER, never in a URL (a URL leaks via history/referrers/logs).
curl -fsSL -H "x-manager-key: $MANAGER_LOG_KEY" \
  "$MANAGER_ENDPOINT/api/sdk/logger?format=js" -o src/lib/manager/logger.js
npm test && npm run build
```

`test/suites/manager-config.suite.js` fails if the vendored file stops matching what
Manager serves, so a stale SDK is caught in CI rather than in production.

### Verifying the wiring

```bash
npm run manager:check
```

`scripts/check-manager-integration.mjs` runs 21 checks against a live Manager and (if
`APP_ORIGIN` is set) a running FinTrack:

| Group | What it proves |
|---|---|
| 1 | the right key kind works at the intended endpoint — and only there |
| 2 | analytics cannot write logs; server and client keys cannot write events; unknown keys get a generic `401` |
| 3 | rejection is **counted** (`accepted`/`rejected`), and stale/future timestamps, bad levels and client-sent Manager-owned fields are all refused |
| 4 | the SDK download is authenticated by header only, and an analytics key cannot fetch it |
| 5 | Finance responds correctly and accepts a trace header; independently inspect stored Manager rows to prove delivery and trace adoption |
| 6 | with `APP_ORIGIN_DEGRADED` pointing at an instance whose `MANAGER_ENDPOINT` is unreachable, the app still serves and does not block |

```bash
APP_ORIGIN=http://127.0.0.1:3000 APP_COOKIE="accessToken=…; refreshToken=…" npm run manager:check
```

Without `APP_COOKIE` the authenticated probes are reported as **skipped**, not passed.

### Delivery behaviour

Log methods **enqueue**; `await log.error(...)` does not flush. Delivery therefore has two
independent parts:

- **Batching.** The SDK's `flushIntervalMs` is 250ms, so a burst of N lines becomes one
  HTTP request instead of N. The window is short on purpose: a serverless runtime can
  freeze timers once the response is sent.
- **Request-completion flushing.** `withManagerLogs` schedules `after(() => root.flush())`,
  which is what actually guarantees delivery. A timer alone is not enough.

For code **outside** a request (scripts, workers, cron jobs) there is no `after()`, so
flush explicitly before exit:

```js
import { getManagerLogger } from "@/lib/manager/server";
const log = getManagerLogger();
try {
  await runJob();
} finally {
  await log.flush();
}
```

Measured with `node scripts/measure-log-delivery.mjs 200` (200 entries, one in ten at
`error`):

```
ingest requests    : 10
entries delivered  : 200
entries/request    : 20.0
sdk dropped        : 0
```

`getManagerDroppedCount()` reports entries this client discarded (its own rate limit or
queue overflow). The SDK raises the same condition as a `warn` entry named
`manager_sdk_dropped_entries`, so client-side loss shows up in the log viewer instead of
vanishing.

### Troubleshooting

| Symptom | Check |
|---|---|
| Nothing arrives from the browser | `NEXT_PUBLIC_*` is inlined at **build** time — rebuild after changing it. Then: the `mck_` key, the `#manager-tracker`/logger actually initialising, and the CSP `connect-src` containing the Manager origin. |
| Server logs missing after a successful response | the route is wrapped in `withManagerLogs` (so `after()` runs on every exit), and `MANAGER_LOG_KEY` is the `mlk_` server key. |
| Analytics missing while logs work | the `mak_` key alone is enough; confirm `#manager-tracker` exists, `/t.js` returns 200, and no blocker/CSP error is in the console. |
| HTTP 200 but no rows | read `accepted` / `rejected`, check the timestamps are current, the key's project, and the viewer's source/level/trace filters. |
| HTTP 401 | the endpoint is Manager's **origin** (not `/api/ingest/logs`), and the key kind matches. |
| HTTP 429 | honour `Retry-After`; the SDK already retries with bounded exponential backoff. |
| Duplicate browser messages | more than one SDK instance — check there is exactly one `ManagerProvider` and one `window.__managerClientLogger`. |
| Traces do not join up | the request must be **same-origin**; the server adopts `x-trace-id` only from that header. |
| Old behaviour after an SDK fix | re-download `src/lib/manager/logger.js` from the updated Manager and rebuild. |

Notes:

- On the iOS (Capacitor) build, `NEXT_PUBLIC_MANAGER_ENDPOINT` must be a host the phone
  can actually reach — `127.0.0.1` on a device is the device itself, not your machine.
- Process-level `uncaughtException` capture is intentionally **off**; Next.js owns
  process error handling. Report errors from your error boundary instead.
- The integration never throws into a request: if Manager is unreachable, the app
  behaves as if logging were disabled.

---

## ⚙️ API Endpoints

Here is a detailed list of all the API endpoints available in the application.

### Auth

| Method | Endpoint               | Description                                         | Request Body                             | Response                                                                    |
| :----- | :--------------------- | :-------------------------------------------------- | :--------------------------------------- | :-------------------------------------------------------------------------- |
| `POST` | `/api/auth/otp/send`   | Sends a one-time password to the user's email.      | `{ "email": "string" }`                  | `200 OK` - OTP sent successfully.                                           |
| `POST` | `/api/auth/otp/verify` | Verifies the OTP and logs the user in.              | `{ "email": "string", "otp": "string" }` | `200 OK` - Login successful. Sets `accessToken` and `refreshToken` cookies. |
| `POST` | `/api/auth/refresh`    | Refreshes the access token using the refresh token. | (None)                                   | `200 OK` - Sets a new `accessToken` cookie.                                 |
| `POST` | `/api/auth/logout`     | Logs the user out from the current device.          | (None)                                   | `200 OK` - Clears auth cookies.                                             |
| `POST` | `/api/auth/logout-all` | Logs the user out from all devices.                 | (None)                                   | `200 OK` - Clears auth cookies and all refresh tokens from the database.    |

### User

| Method | Endpoint    | Description                               | Request Body                                        | Response                      |
| :----- | :---------- | :---------------------------------------- | :-------------------------------------------------- | :---------------------------- |
| `GET`  | `/api/user` | Fetches the authenticated user's profile. | (None)                                              | `200 OK` - User data.         |
| `PUT`  | `/api/user` | Updates the user's profile information.   | `{ "accountName": "string", "currency": "string" }` | `200 OK` - Updated user data. |

### Transactions

| Method   | Endpoint                 | Description                        | Request Body                                                                                              | Response                                              |
| :------- | :----------------------- | :--------------------------------- | :-------------------------------------------------------------------------------------------------------- | :---------------------------------------------------- |
| `GET`    | `/api/transactions`      | Get all transactions for the user. | (None)                                                                                                    | `200 OK` - An array of transaction objects.           |
| `POST`   | `/api/transactions`      | Create a new transaction.          | `{ "type": "string", "amount": "number", "category": "string", "date": "date", "description": "string" }` | `201 Created` - The newly created transaction object. |
| `GET`    | `/api/transactions/[id]` | Get a single transaction by ID.    | (None)                                                                                                    | `200 OK` - The transaction object.                    |
| `PUT`    | `/api/transactions/[id]` | Update a transaction by ID.        | (Transaction object fields)                                                                               | `200 OK` - The updated transaction object.            |
| `DELETE` | `/api/transactions/[id]` | Delete a transaction by ID.        | (None)                                                                                                    | `200 OK` - Success message.                           |

### Categories

| Method | Endpoint          | Description                                     | Request Body                             | Response                                           |
| :----- | :---------------- | :---------------------------------------------- | :--------------------------------------- | :------------------------------------------------- |
| `GET`  | `/api/categories` | Get default and custom categories for the user. | (None)                                   | `200 OK` - `{ "expense": [...], "income": [...] }` |
| `POST` | `/api/categories` | Create a new custom category.                   | `{ "name": "string", "type": "string" }` | `201 Created` - The newly created category object. |

### Reports

| Method | Endpoint                 | Description                                  | Request Body                                 | Response                           |
| :----- | :----------------------- | :------------------------------------------- | :------------------------------------------- | :--------------------------------- |
| `GET`  | `/api/reports/dashboard` | Get aggregated data for the main dashboard.  | (None)                                       | `200 OK` - Dashboard data object.  |
| `POST` | `/api/reports/generate`  | Generate a detailed report for a date range. | `{ "startDate": "date", "endDate": "date" }` | `200 OK` - Detailed report object. |

---

## 🛠️ Technologies Used

- **Frontend**: [React](https://reactjs.org/), [Next.js](https://nextjs.org/), [Tailwind CSS](https://tailwindcss.com/)
- **Backend**: Next.js (API Routes), [Mongoose](https://mongoosejs.com/)
- **Database**: [MongoDB](https://www.mongodb.com/)
- **Authentication**: JWT (JSON Web Tokens), OTP via Email
- **Styling & UI**: [Framer Motion](https://www.framer.com/motion/) (Animations), [Lucide React](https://lucide.dev/) (Icons), [Chart.js](https://www.chartjs.org/) (Charts)
- **Email Service**: [Brevo (Sendinblue)](https://www.brevo.com/)

---

## 📁 Project Structure

The project follows the standard Next.js `app` directory structure.

```
finance-app/
├── public/                  # Static assets
├── src/
│   ├── app/
│   │   ├── (auth)/          # Auth-related pages (login, welcome)
│   │   ├── (main)/          # Main application pages (dashboard, etc.)
│   │   ├── api/             # API routes
│   │   ├── layout.js        # Root layout
│   │   └── page.js          # Root page
│   ├── components/          # Reusable React components
│   ├── lib/                 # Helper functions, API client, auth logic, constants
│   └── models/              # Mongoose models for MongoDB
├── .env.local               # Environment variables (untracked)
├── next.config.js           # Next.js configuration
└── tailwind.config.js       # Tailwind CSS configuration
```

---

## Contributing

Contributions are welcome! Please feel free to submit a pull request.

### Development

To get started with development, you'll need to have Node.js and MongoDB installed. Then, follow the installation instructions in the "Getting Started" section.

### Linting

This project uses ESLint for linting. To run the linter, use the following command:

```bash
npm run lint
```

### Independent verification regressions

`npm test` includes an isolated real MongoDB suite for recurring occurrence indexes,
concurrent runs, partial write failures and interrupted retries. The test database is
created and destroyed automatically; it never uses your financial `MONGODB_URI`.
The first run may download MongoDB's test binary. Recurring schedules now advance only
after durable writes, so a failed write can be retried without losing or duplicating
transactions. Dashboard and rate-limiter fallback errors are also sent to Manager.

Runtime/security dependencies are refreshed in the lockfile. The `xcode.uuid` override
keeps Capacitor's existing UUID-v4 usage on a patched compatible implementation.
