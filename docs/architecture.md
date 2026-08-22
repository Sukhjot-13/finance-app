# Finance App - Architecture Document

## Overview
A Next.js 16 personal finance tracking application with OTP-based authentication, transaction management, reporting, and data visualization. Uses MongoDB with Mongoose for data persistence and Brevo (Sendinblue) for email-based OTP delivery.

**Tech Stack:** Next.js 16, React 19, MongoDB/Mongoose, Tailwind CSS v4, Chart.js, Framer Motion, Lucide React, Brevo API, JWT (jsonwebtoken + jose), Vitest

---

## Project Structure

### Root Configuration Files

| File | Purpose |
|------|---------|
| `/package.json` | Project metadata, scripts (dev/build/start/lint/test), dependencies |
| `/next.config.mjs` | Next.js configuration (webpack fallbacks, baseline security headers; CSP is set per-request by the proxy) |
| `/vitest.config.mjs` | Vitest unit-test configuration (`@` alias → `./src`, node environment) |
| `/postcss.config.mjs` | PostCSS configuration for Tailwind CSS |
| `/eslint.config.mjs` | ESLint configuration |
| `/jsconfig.json` | JavaScript/Next.js path aliases (@/ maps to ./src) |
| `/README.md` | Project documentation |
| `/docs/architecture.md` | Project architecture documentation |
| `/docs/audit.md` | Audit status (2026-08-22 cycle fully closed — no open items; fix summary table) |
| `/docs/suggestions.md` | Suggestions / improvement / vulnerability log |

### Source Code (`/src/`)

#### App Layout & Entry Points

- **`src/app/layout.js`** - Root layout component. Sets up Inter font, global CSS, and base HTML structure.
  - `RootLayout()` - Renders `<html>` and `<body>` with Inter font and global styles. Defines metadata (title: "Finance Tracker"). Exports `dynamic = "force-dynamic"` — REQUIRED so the proxy-generated CSP nonce is stamped onto Next's inline bootstrap scripts in production builds (static prerendering cannot carry per-request nonces).

- **`src/app/page.js`** - Root page (entry point at `/`). Checks authentication and redirects.
  - `RootPage()` (async) - Calls `verifyAuth()`. If authenticated, redirects to `/dashboard`. Otherwise redirects to `/login`.

- **`src/app/globals.css`** - Global styles. Imports Tailwind CSS v4 (`@import "tailwindcss"`). Defines `@theme` block (currently commented out). Sets `box-sizing: border-box` globally.

#### Middleware (Proxy)

- **`src/proxy.js`** - Next.js Proxy (Middleware) for route protection AND Content-Security-Policy generation.
  - `buildCsp(nonce)` - Builds the strict CSP string: `script-src 'self' 'nonce-…' 'strict-dynamic'` (+ `'unsafe-eval'` in dev only), `style-src 'self' 'unsafe-inline'` (Chart.js/Framer Motion tuning), locked-down `img/font/connect/object/base-uri/form-action/frame-ancestors`.
  - `proxy()` - Auth routing: logged-in users hitting `/login` → `/dashboard`. Public paths: `/login`, `/api` (**NOTE: `/welcome` is deliberately NOT in either list** — new users arrive there with fresh cookies after OTP verify and must NOT be bounced; anonymous visitors are redirected to `/login` by the protected-path check). `/api/*` requests pass through untouched (routes self-auth). Page requests get a per-request CSP nonce: sets `x-nonce` + `Content-Security-Policy` on the REQUEST headers (so Next stamps the nonce onto its own scripts) and on the response. Config matcher: all paths except `_next/static`, `_next/image`, `favicon.ico`, any path with a file extension.

---

### Auth Module (`/src/app/(auth)/`)

- **`src/app/(auth)/login/page.js`** - Login page with OTP flow ("use client").
  - `LoginPage()` - Two-step form: Step 1 collects email, calls `/api/auth/otp/send` (surfaces the server's specific error messages, e.g. rate-limit). Step 2 collects OTP (numeric input, `autoComplete="one-time-code"`) with auto-submit at 6 digits, a **Resend code button with a 30s cooldown**, and "Use a different email". On success, redirects based on `isNewUser` (new → `/welcome`, returning → `/dashboard`). Auto-redirects on mount if already authenticated. State: `email`, `otp`, `step`, `loading`, `error`, `checkingSession`, `resendIn`. Uses raw `fetch()` deliberately — the `api()` wrapper's failed-refresh redirect to `/login` would loop on this page.

- **`src/app/(auth)/welcome/page.js`** - Welcome/onboarding page for new users ("use client").
  - `WelcomePage()` - Collects `accountName` (maxLength 60) via form, submits to `PUT /api/user` via `api()`. Includes a **Skip for now** button that goes straight to `/dashboard`. On success, redirects to `/dashboard`. State: `accountName`, `loading`, `error`.

---

### Main App Module (`/src/app/(main)/`)

- **`src/app/(main)/layout.js`** - Main app shell with sidebar, header, and user context ("use client").
  - `UserContext` - React Context exporting `{ user, setUser }`. Pages call `setUser` (e.g. profile save) so currency/name changes propagate app-wide without a reload.
  - `Sidebar()` - Nav sidebar (Dashboard/Transactions/Reports/Categories). Responsive overlay on mobile, animated via Framer Motion, active-route highlight.
  - `ProfileDropdown()` - User menu with Profile link and logout. Closes on **outside click and Escape**; button has `aria-haspopup`/`aria-expanded`. Shows `user.accountName`; calls `POST /api/auth/logout`.
  - `MainLayout()` - Fetches user via `GET /api/user`. On transient failure shows an inline **retry card** instead of redirecting (definitive auth failures are handled inside `api()` itself). Sidebar resize handling only reacts to *crossing* the desktop breakpoint (manual collapse within a mode is preserved); route changes close the mobile sidebar via React's render-time-adjustment pattern (no setState-in-effect).

- **`src/app/(main)/dashboard/page.js`** - Dashboard page ("use client").
  - `generateSliceColors(count)` - Curated palette plus golden-angle HSL fallback so any number of pie slices gets a distinct color.
  - `StatCard()`, `DashboardSkeleton()` - Reusable stat card and loading skeleton.
  - `DashboardPage()` - Fetches `GET /api/reports/dashboard?start=…&end=…` (client-local month window; END bound keeps future-dated txns out of "this month"). Mount effect uses promise-chain style (no synchronous setState); `refreshWithSkeleton()` re-shows skeletons on event refetches. Adding a transaction refreshes stats **and bumps `budgetVersion`** so budget bars update immediately. Pie chart via `SimpleChart`.

- **`src/app/(main)/transactions/page.js`** - Transactions page ("use client"). **Server-side filtered + paginated.**
  - `EditTransactionModal()` - Edit modal with Expense/Income toggle, category select or create (server error messages surfaced; caps: name ≤50, description ≤200, amount min 0.01), date normalized to local `YYYY-MM-DD` and saved as noon-local instant. Save calls `onSave(...)` which returns `{ ok } | { ok:false, message }` — failures render INSIDE the modal (`modalError`) since page banners would be hidden behind the overlay. Escape closes; body scroll locked while open.
  - `TransactionCard()` - Mobile card for one transaction with inline confirm-once delete.
  - `TransactionsPage()` - State: `transactions`, `pageInfo {page,totalPages,total}`, `page`, `filters`, debounced `debouncedSearch` (300ms), `categoryOptions` (fetched from `/api/categories`). Fetches `GET /api/transactions?page=&limit=&search=&type=&category=&from=&to=` (from/to are local instants). Filter updates snap back to page 1 (`updateFilter`). Desktop table (with Description column) / mobile cards; result count + Prev/Next pagination when `totalPages > 1`; empty-states distinguish "no transactions" vs "no filter matches".

- **`src/app/(main)/reports/page.js`** - Reports page ("use client").
  - `ReportsPage()` - Validates dates before submit (both present, start ≤ end) with friendly inline errors; sends raw strings + absolute `startInstant`/`endInstant` (browser-timezone). Summary cards + Bar chart + income list. Currency via `UserContext`.

- **`src/app/(main)/categories/page.js`** - Categories management ("use client").
  - `CategoriesPage()` - Lists custom categories with All/Expense/Income tabs, add form (maxLength 50), inline confirm-once delete, and an **inline rename UI** (pencil → input, Enter/Esc shortcuts) calling `PUT /api/categories/[id]`. Fetch failure renders an explicit error banner with Retry — never a misleading empty state. "Matches default" badge retained.

- **`src/app/(main)/profile/page.js`** - Profile settings ("use client").
  - `ProfilePage()` - Reads `{ user, setUser }` from context; refreshes from server on mount (transient failures just stop loading — no forced logout). Save propagates via `setUser((prev) => ({...prev, …}))`. accountName maxLength 60. Security section: two-step inline confirm "Log Out From All Devices" → `POST /api/auth/logout-all` then hard `window.location.href = "/login"`.

- Error boundaries `src/app/(main)/error.js` and `src/app/error.js` unchanged (recoverable cards with Try again).

---

### API Routes

#### Auth API

- **`src/app/api/auth/otp/send/route.js`** - Sends OTP via Brevo.
  - `getClientIp(request)` - x-forwarded-for/x-real-ip extraction.
  - `findUserByEmail(email)` - Lowercase lookup with exact-match legacy fallback.
  - Rate limiting is **MongoDB-backed sliding-window** (via `src/lib/rate-limit.js`): per-email 5/hour AND per-IP 20/hour (stops OTP-bombing many addresses). Slots are **refunded** if the email send fails.
  - `POST` - Validates email; checks both limits (429 uniform message); records hits; generates 6-digit CSPRNG OTP (`crypto.randomInt`), 10-min expiry, bcrypt-hashed via model hook. Preserves the previous pending OTP and restores it if the Brevo send throws. Handles the concurrent-signup unique-index race by refetching and retrying. Generic client errors only; `error.message` access guarded.

- **`src/app/api/auth/otp/verify/route.js`** - Verifies OTP and establishes session.
  - Brute-force lockout via Mongo-backed sliding window: ≥5 failures per email inside 15 minutes → uniform 429. Success clears the key (`resetKey`).
  - `DUMMY_HASH` - Real bcrypt hash compared against when no pending OTP exists, so response timing cannot reveal which emails have live codes.
  - `POST` - Uniform failure message everywhere; bcrypt compare ALWAYS runs. On success: clears OTP fields + failure history, generates access (15m) + refresh (30d) tokens, stores the refresh token as a **SHA-256 hash** (`hashToken`), purges expired sessions, sets httpOnly cookies (sameSite strict), returns `{ isNewUser, user }`.

- **`src/app/api/auth/refresh/route.js`** - Refreshes access token. Implements **rotation + grace window + reuse detection**:
  - JWT verified first (bad/expired → cookies cleared, 401).
  - Session looked up by SHA-256 hash (legacy plaintext entries still matched until expiry).
  - ACTIVE token → rotate: entry marked `rotatedAt = now`, new hashed token pushed, new refresh cookie set.
  - ROTATED token **within 60s grace** → concurrent tab/duplicate request: mints only a fresh access token; nothing else touched.
  - ROTATED token **past grace** → reuse treated as theft: ALL of the user's sessions revoked, cookies cleared, 401.
  - `dbConnect()` runs INSIDE try — DB outage returns retryable 500 without clearing cookies. Opportunistic prune of expired + rotated-past-grace entries.

- **`src/app/api/auth/logout/route.js`** - Removes this session's token from the DB by `$pull` matching `[hash, rawToken]` (raw kept for pre-hashing legacy sessions), then clears cookies regardless of DB outcome.

- **`src/app/api/auth/logout-all/route.js`** - Unchanged: empties `refreshTokens[]`; honest 500 on DB failure; cookies always cleared locally.

#### User API

- **`src/app/api/user/route.js`**
  - `GET` - Authenticated user data (`verifySession()`), excludes secrets.
  - `PUT` - Accepts `{ accountName, currency }`; validates accountName (string, trimmed, ≤60) AND currency (must be USD/INR → otherwise 400, not a mongoose enum 500). `$set`-only update.

#### Transactions API

- **`src/app/api/transactions/route.js`**
  - `escapeRegex(value)` - Escapes user input for `$regex`.
  - `parseInstant(value)` - Safe date parsing.
  - `GET` - **Server-side filtered + paginated**: `page` (default 1), `limit` (default 50, max 200), optional `type`, `category`, `search` (regex over description+category), `from`/`to` instants. Returns `{ transactions, total, page, pageSize, totalPages }` sorted date desc, createdAt desc.
  - `POST` - Validation unchanged (type/amount/category/date); stores client-sent noon-local instant as-is; persists `excludeFromBudget` deterministically.

- **`src/app/api/transactions/[id]/route.js`**
  - GET/PUT/DELETE scoped to owner via `findOne…({ _id, userId })`. Malformed ObjectIds now return **404** (`mongoose.isValidObjectId` guard) instead of cast-error 500s. PUT stores sent date as-is; `excludeFromBudget` spread on `!== undefined` so clearing persists.

#### Categories API

- **`src/app/api/categories/route.js`**
  - `GET` - Defaults + custom merged per type, plus `allCustom` with `_id`s.
  - `POST` - Requires name (trimmed, ≤50 chars) + type; duplicate → 409; `dbConnect` inside try.

- **`src/app/api/categories/[id]/route.js`**
  - `PUT` - **Rename with cascade**: renames the Category doc (duplicate → 409) then `Transaction.updateMany` + `Budget.updateMany` re-point old name → new name, so dropdowns/reports/budgets never reference ghost labels. ObjectId guard → 404.
  - `DELETE` - Deletes category, reassigns its transactions to default "Other", and **deletes budgets for that name**. ObjectId guard → 404.

#### Budgets API

- **`src/app/api/budgets/route.js`** - Month-scoped CRUD (`?month=YYYY-MM` validated by schema regex). POST upserts `{ userId, category, month }` (amount ≥1). All three handlers run `dbConnect` inside their try blocks.

#### Reports API

- **`src/app/api/reports/dashboard/route.js`** - Aggregations accept `start` AND `end` instants (client-local month bounds; falls back to server-computed month). Every monthly aggregation matches `$gte start, $lt end` — future-dated transactions can't inflate current month. Balance = all-time income − expenses; recent 5 transactions.

- **`src/app/api/reports/budget-progress/route.js`** - Same start/end windowing. Spending aggregation excludes `excludeFromBudget`; separate aggregation sums excluded spend for transparency. Returns `{ overall, progress, totalSpent, excludedSpent }`.

- **`src/app/api/reports/generate/route.js`** - Prefers browser-timezone `startInstant`/`endInstant`; validates formats (400) and rejects reversed ranges (400). Summary + expense/income breakdowns sorted desc.

---

### MongoDB Models

- **`src/models/user.model.js`**
  - Fields: email (unique, validated), accountName, otp (hashed, temp), otpExpires, role, currency (USD/INR), refreshTokens.
  - `RefreshTokenSchema` - `token` stores the **SHA-256 hash** of the JWT (never raw); `deviceInfo`, `ipAddress`, `createdAt`; `rotatedAt` (set when rotation supersedes the token — valid during the grace window, purged after, reuse past it = theft). TTL indexes don't work on subdocument arrays — pruning happens in code.
  - `pre("save")` hashes OTP when modified; `compareOtp()` method.

- **`src/models/transaction.model.js`** - userId (indexed), type enum, amount (>0), date, category (≤50), description (≤200), excludeFromBudget bool. Compound indexes `{userId,date:-1}` + `{userId,type,date:-1}` via `.index()`. `formattedAmount` virtual.

- **`src/models/category.model.js`** - userId, name (required, trimmed, **maxlength 50** — matches Transaction.category cap so every custom category is assignable), type enum. Unique `{userId,name,type}`.

- **`src/models/budget.model.js`** - userId, category, amount (≥1), month (`YYYY-MM` regex). Unique `{userId,category,month}`.

- **`src/models/ratelimit.model.js`** *(new)* - Backing store for auth rate limiting: `{ key (unique), hits [Date] ($slice-capped at 100), expiresAt }` with a **top-level TTL index** (`expireAfterSeconds: 0`) so MongoDB auto-purges expired docs (~60s sweeper). Shared across instances; survives restarts.

---

### Utility Libraries (`/src/lib/`)

- **`src/lib/mongodb.js`** - Singleton Mongoose connection (`bufferCommands:false`, pool 10, timeouts). Resets cached promise on failure.

- **`src/lib/auth.js`** - Authentication utilities.
  - Constants: `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET` (throw at import if missing), `REFRESH_TOKEN_TTL_MS` (30d), `REFRESH_ROTATION_GRACE_MS` (60s).
  - `hashToken(token)` - SHA-256 hex digest used to store/lookup refresh tokens.
  - `generateAccessToken(userId)` / `generateRefreshToken(userId)` (includes `jti`).
  - `verifyToken(token, secret)` - jsonwebtoken verify wrapper returning null on error.
  - `verifyAuth()` - Edge/server-component check via jose (root-page redirect only).
  - `verifySession()` - Full check for API routes: verifies access JWT, connects DB, confirms refresh token exists (by hash, legacy plaintext fallback). Returns `{user}` or `{user:null, error, status}` where status distinguishes definitive auth failures (401) from infrastructure trouble (503) — callers never turn a DB outage into a forced logout.
  - `purgeExpiredRefreshTokens(userId)` - Pulls entries older than TTL OR rotated-past-grace.

- **`src/lib/rate-limit.js`** *(new)* - MongoDB-backed sliding-window limiter. `recordHit(key, windowMs)` (pushes timestamp, $slice-capped), `countRecentHits(key, windowMs)` (aggregate $filter count), `popLastHit(key)` (refund quota), `resetKey(key)` (clear on success). Every helper **fails open** on DB errors so the limiter can never lock everyone out during an incident.

- **`src/lib/server-utils.js`** - `sendSuccess(data, status)` / `sendError(message, status)` JSON helpers.

- **`src/lib/utils.js`** - `formatCurrency` (en-IN for INR), `formatDate`, `formatDateForInput` (local getters). Covered by unit tests.

- **`src/lib/api.js`** - Fetch wrapper with automatic token refresh. Contract:
  - Each request retries **at most once** after a refresh (`options._authRetried` guard) — a second 401 is handed back, never looped/deadlocked (regression-tested).
  - Concurrent 401s queue behind ONE in-flight refresh (`isRefreshing` + `failedQueue`).
  - Refreshes are serialized ACROSS tabs via Web Locks (`navigator.locks.request("fintrack-auth-refresh")`) where supported.
  - Only a definitive refresh rejection (HTTP 401) redirects to `/login`. Network errors and 5xx are transient: they reject the request with an error for the caller's inline UI — no forced logout during backend blips.

- **`src/lib/constants.js`** - Default expense/income category lists.

---

### Components (`/src/components/`)

- **`src/components/AddTransactionDrawer.js`** - Slide-in drawer ("use client").
  - `SegmentedControl()` - Animated Expense/Income pill.
  - `AddTransactionDrawer({...})` - Type switch resets selection via `handleTypeChange` (event-driven, no effect). Amount min 0.01 step 0.01; description maxLength 200; new-category maxLength 50. Category creation surfaces the server's message (e.g. 409 duplicate), then switches back to the dropdown with the new value preselected (prevents double-create retries). Submits date as noon-local instant through `api()`. `handleClose` is a stable callback; **Escape closes and body scroll locks** while open. Form reset on close.

- **`src/components/SimpleChart.js`** - Lazy-loaded Chart.js Pie with loading/error/empty states. Unchanged.

- **`src/components/BudgetProgress.js`** - Dashboard budget bars. Sends `start`+`end`+`month` (client-local window). Color-coded progress (indigo/amber/red), overall + per-category sections, "(excl. X in one-time expenses)" note. Consumes `{ user }` from context.

- **`src/components/BudgetManager.js`** - Budget-setting drawer, rewritten:
  - Keeps `originalBudgets` snapshot from load; **Save deletes budgets whose fields were cleared** (clearing ≠ silently keeping the old limit).
  - Errors are VISIBLE (inline banner) for failed saves and removals; inputs live in a `<form>` so native validation runs; footer is sticky.
  - Over-budget warning text uses the user's currency via `formatCurrency` (no hardcoded `$`).

---

## Authentication Flow

1. **Login**: email → OTP generated with `crypto.randomInt` (CSPRNG), sent via Brevo. Limits (Mongo-backed, shared across instances): 5/hour/email + 20/hour/IP; slots refunded on send failure; previous pending OTP restored if the email fails.
2. **OTP Verify**: Mongo-backed lockout (5 failures / sliding 15min → uniform 429); bcrypt compare always runs (dummy-hash timing equalization); uniform failure messages (no enumeration).
3. **Session**: access (15m) + refresh (30d) httpOnly sameSite=strict cookies. Refresh tokens stored in the user document as **SHA-256 hashes**; expired entries pruned opportunistically on login/refresh.
4. **Verification**: all data routes use `verifySession()` (DB-backed revocation) with 401-vs-503 classification.
5. **Token Refresh**: automatic via `api()` (single-flight per tab, Web-Lock serialized across tabs). Rotation marks the old entry `rotatedAt` and stores a fresh hash; duplicates within the 60s grace window get an access token only; presenting a rotated token AFTER grace revokes every session (reuse detection).
6. **Logout**: single-session `$pull` by hash (legacy raw accepted); logout-all empties the array honestly.
7. **Proxy**: guards routes (anon → `/login`; authed away from `/login` only) and injects the per-request CSP nonce.

## Security Headers

Baseline headers in `next.config.mjs` (XFO/nosniff/referrer/permissions/HSTS). **Strict CSP is now enforced** per-request by `src/proxy.js`: `default-src 'self'`, `script-src 'self' 'nonce-{per-request}' 'strict-dynamic'` (dev adds `'unsafe-eval'`), `style-src 'self' 'unsafe-inline'` (Framer Motion/Chart.js styling), tight img/font/connect/object/base/form/frame directives. Root layout exports `dynamic = "force-dynamic"` because nonce stamping requires dynamic rendering (verified on Turbopack and webpack production builds).

## Currency Support
USD and INR, stored per user; formatting via `UserContext` everywhere (context updates propagate instantly after profile saves). INR uses `en-IN` lakh grouping.

## Data Visualization
Dashboard pie (lazy-loaded `SimpleChart`) and reports bar chart; slice colors generated for any category count; loading/error/empty states throughout.

## Key Design Decisions
- **No Password Authentication**: OTP-only via email (Brevo).
- **Dual Token System + rotation**: short-lived access + rotating refresh with grace window and reuse detection; tokens hashed at rest.
- **Database-Backed Sessions**: revocable everywhere via `verifySession()`.
- **MongoDB-backed rate limiting**: shared across instances/restarts, fails open.
- **Strict CSP**: nonce-per-request through the proxy; dynamic rendering required.
- **Timezone Handling**: noon-local instants stored as-is; clients send absolute month windows (`start`/`end`); server never applies its own offset. End-bounds keep future-dated transactions out of "current month".
- **Error Hygiene**: generic client messages; validation feedback (400s) where input-specific; 503 for transient infra so clients don't log users out.
- **Server-side pagination**: transactions endpoint pages/filters server-side (max 200/page); client debounces search.
- **Tests**: Vitest unit suite covering utils, token hashing/generation roundtrip, and the api() refresh contract (incl. deadlock regression).

---

## Environment Variables

Define all of these in a `.env.local` file at the project root. (No new variables were introduced in the latest cycle.)

| Variable | Purpose | Referenced In |
|----------|---------|---------------|
| `MONGODB_URI` | MongoDB connection string (database: `fintrack_db`) — also backs the rate-limit collection | `src/lib/mongodb.js` |
| `BREVO_API_KEY` | Brevo (Sendinblue) API key for sending OTP emails | `src/app/api/auth/otp/send/route.js` |
| `EMAIL_FROM` | Verified sender email for Brevo | `src/app/api/auth/otp/send/route.js` |
| `ACCESS_TOKEN_SECRET` | JWT secret for access tokens (15min expiry) | `src/lib/auth.js` |
| `REFRESH_TOKEN_SECRET` | JWT secret for refresh tokens (30d expiry, rotated on use) | `src/lib/auth.js`, refresh route |
| `JWT_SECRET` | Additional JWT secret (reserved) | — |
| `NODE_ENV` | Environment mode (`development` adds `'unsafe-eval'` to CSP script-src; controls cookie security) | proxy, auth routes |

### Generating JWT Secrets
```bash
openssl rand -base64 32
```
Run 3 times — one for each of `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, and `JWT_SECRET`.

### Setup Brevo
1. Sign up at [Brevo](https://www.brevo.com/) (formerly Sendinblue)
2. Settings > API Keys → Create new API key → Set as `BREVO_API_KEY`
3. Settings > Senders & IP → Verify a sender email → Set as `EMAIL_FROM`

### Setup MongoDB
1. Create a MongoDB Atlas account or use local MongoDB
2. Create database `fintrack_db`, get connection string, set as `MONGODB_URI`

### Tests
```bash
npm test        # vitest run (22 unit tests)
npm run lint    # eslint . (clean)
```
