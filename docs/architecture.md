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
| `/vitest.config.mjs` | Vitest config: **single-entry runner** (`test/run-all.test.js` only), jsdom environment, `@` alias → `./src`, plus a tiny esbuild plugin that lets JSX inside `src/**/*.js` transform for component tests |
| `/postcss.config.mjs` | PostCSS configuration for Tailwind CSS |
| `/eslint.config.mjs` | ESLint configuration |
| `/jsconfig.json` | JavaScript/Next.js path aliases (@/ maps to ./src) |
| `/README.md` | Project documentation |
| `/docs/architecture.md` | Project architecture documentation |
| `/docs/audit.md` | Audit status (both 2026-08-22 cycles closed — no open items; standing verification + intentional-behavior notes only) |
| `/docs/suggestions.md` | Suggestions / improvement / vulnerability log (open items only — completed ones removed, history in git) |

### Test Suite (`/test/`)

`npm test` executes ONE vitest entry (`test/run-all.test.js`) which imports every suite below — the whole site's tests run in one go.

| File | Covers |
|------|--------|
| `/test/run-all.test.js` | Single entry: sets test env vars, registers ALL shared module mocks (delegating factories → `globalThis.*`), imports every suite |
| `/test/helpers/setup.js` | Stable globalThis mock singletons (models registry, dbConnect, cookies store, api mock, router, Brevo client) + DOM stubs (ResizeObserver/matchMedia) |
| `/test/helpers/mocks.js` | `makeQueryBuilder()` chainable awaitable stub; `makeModel()` constructable mongoose-model-shaped mock with spied statics; registry factory |
| `/test/suites/utils.suite.js` | `lib/utils`: formatCurrency USD/INR/null/negative, formatDate, formatDateForInput local parts/padding/rejections |
| `/test/suites/auth-lib.suite.js` | `lib/auth`: hashToken SHA-256 properties, access/refresh token roundtrip (+jti), verifyToken garbage→null, purgeExpiredRefreshTokens $pull cutoffs, REAL verifySession branches (missing tokens 401, bad access 401 w/o DB, success via hash + legacy-plaintext $or arms, revoked 401, transient DB 503) |
| `/test/suites/api-client.suite.js` | `lib/api` refresh contract: pass-through, retry-once, transient 500/network ≠ logout, definitive 401 → /login, deadlock regression (retried 401 returned not hung), concurrent single-flight queue |
| `/test/suites/server-utils.suite.js` | sendSuccess/sendError shapes + statuses |
| `/test/suites/rate-limit.suite.js` | recordHit $push/$slice/expiry, countRecentHits pipeline shape + cutoff, popLastHit $pop, resetKey deleteOne, FAILS OPEN on DB errors |
| `/test/suites/dialog-a11y.suite.jsx` | `useDialogA11y`: scroll lock/restore, focus-in ([data-autofocus]) + focus restore, Escape closes once, Tab/Shift+Tab wrap, inert when closed |
| `/test/suites/proxy.suite.js` | Routing matrix (authed /login→dashboard, anon protected→login, /welcome never bounced), per-request CSP nonce headers, dev unsafe-eval vs prod, API passthrough, config matcher exclusions |
| `/test/suites/models.suite.js` | Real schemas via importActual: Transaction validators/virtual/indexes/exclude default; Category required/unique index/cap/enum; Budget month regex/amount≥1/unique index; OTP compare contract |
| `/test/suites/api-auth.suite.js` | otp/send (validation, both rate-limit windows, HTML+TEXT email U5, lowercase new users, E11000 race retry, Brevo failure → restore+refund+500); otp/verify (malformed JSON 400 M2, missing fields, lockout 429, uniform failures incl. expired/wrong/no-pending, success clears OTP + hashed refresh push + cookie issue, isNewUser B3 matrix); refresh (no-cookie 401 no-DB, garbage clears cookies, revoked 401, ACTIVE rotation marks+pushes hash+rotates cookie, grace-window access-only, past-grace revoke-all, DB-outage 500 keeps cookies); logout ($pull hash+raw, cookies always cleared incl. DB error); logout-all (401s, empties array, honest 500) |
| `/test/suites/api-user.suite.js` | GET (sans secrets, 404, 503 passthrough); PUT (60-char cap, currency 400, empty-body 400, B3 auto-onboard on name save, explicit onboarded flag, never revocable, trim, combined update, 404) |
| `/test/suites/api-transactions.suite.js` | GET pagination/clamps/type/category/search regex-escaping/date bounds/garbage dates/status passthrough; POST validations, as-sent noon instant persistence, excludeFromBudget coercion, ValidationError→400; [id] ObjectId guards, PUT flat-spread partial semantics (false persists, invalid date dropped, owner-scoped 404), DELETE 404/200 |
| `/test/suites/api-categories.suite.js` | GET merge/dedupe/allCustom; POST required/cap/409/create-scoped; PUT rename (ObjectId 404 pre-DB, no-op fast path, cascade old→new to transactions+budgets, duplicate→409 without cascade, rollback on cascade failure, name validation); DELETE reassign Other + budget cleanup + 404-no-side-effects |
| `/test/suites/api-budgets.suite.js` | GET month default/verbatim; POST M4 strict guards (missing fields, YYYY-MM both paths, non-finite/sub-1 amounts, numeric-string coercion, trimmed category, 50-char cap, dup→409); DELETE required param/owner scope |
| `/test/suites/api-reports.suite.js` | dashboard aggregates with $gte/$lt client bounds + balance math + server-month fallback + zero-fill; budget-progress overall/category blend, capped percentage, overBudget flags, excluded spend, month fallback; generate instants preferred, reversed-range 400, summary math, sorted breakdowns |
| `/test/suites/budget-components.suite.jsx` | BudgetProgress success bars/exclusion note, error banner + Retry recovery (B1), null when nothing to show; BudgetManager prefilled inputs, load-error banner + Retry hiding save (B2), Escape close (U2), dialog semantics (U3), clear-on-save deletes budgets server-side |
| `/test/suites/overlay-components.suite.jsx` | AddTransactionDrawer dialog semantics + autofocus, Escape close, type-switch category reset guard, add-new-category reveal (50-cap), noon-local submit payload; EditTransactionModal semantics, modalError inline on save failure, sends ONLY editable fields |
| `/test/suites/page-components.suite.jsx` | ProfileDropdown two-step logout confirm + cancel (U1); WelcomePage skip PUTs onboarded + navigates, save completes onboarding in one call, inline server errors (B3); LoginPage 30s resend cooldown countdown/auto-submit at 6 digits (digits filtered)/different-email reset; TransactionsPage page-clamp after deleting last row of page 2 (B4) |

**Test conventions:** all suites compose into one file, so shared modules are mocked ONCE in `run-all.test.js` via identical delegating factories reading `globalThis.*` handlers that each suite configures in its own `beforeEach`. Model chains (`.find().sort().lean()`) must be mocked with `makeQueryBuilder` builders (never bare promises). Component tests use jsdom + @testing-library/react.

### Source Code (`/src/`)

#### App Layout & Entry Points

- **`src/app/layout.js`** - Root layout component. Sets up Inter font, global CSS, and base HTML structure.
  - `RootLayout()` - Renders `<html>` and `<body>` with Inter font and global styles. Defines metadata (title: "Finance Tracker"). Exports `dynamic = "force-dynamic"` — REQUIRED so the proxy-generated CSP nonce is stamped onto Next's inline bootstrap scripts in production builds (static prerendering cannot carry per-request nonces).

- **`src/app/page.js`** - Root page (entry point at `/`). Checks authentication and redirects.
  - `RootPage()` (async) - Calls `verifyAuth()`. If authenticated, redirects to `/dashboard`. Otherwise renders `SessionGate` — it no longer hard-redirects to `/login`, because an expired 15-minute access cookie does NOT mean the 30-day refresh session is dead.

- **`src/app/session-gate.js`** *(new)* - Client-side fallback for the root page.
  - `SessionGate()` - Rendered when server-side `verifyAuth()` fails. Attempts ONE silent `POST /api/auth/refresh`: success → `/dashboard`, failure/network error → `/login`. Shows the bouncing-pig loading screen while deciding. Prevents returning users from being forced into OTP re-logins when only the short-lived access token lapsed.

- **`src/app/globals.css`** - Global styles. Imports Tailwind CSS v4 (`@import "tailwindcss"`). Defines `@theme` block (currently commented out). Sets `box-sizing: border-box` globally.

#### Middleware (Proxy)

- **`src/proxy.js`** - Next.js Proxy (Middleware) for route protection AND Content-Security-Policy generation.
  - `buildCsp(nonce)` - Builds the strict CSP string: `script-src 'self' 'nonce-…' 'strict-dynamic'` (+ `'unsafe-eval'` in dev only), `style-src 'self' 'unsafe-inline'` (Chart.js/Framer Motion tuning), locked-down `img/font/connect/object/base-uri/form-action/frame-ancestors`.
  - `proxy()` - Auth routing: logged-in users hitting `/login` → `/dashboard`. Public paths: `/login`, `/api` (**NOTE: `/welcome` is deliberately NOT in either list** — new users arrive there with fresh cookies after OTP verify and must NOT be bounced; anonymous visitors are redirected to `/login` by the protected-path check). `/api/*` requests pass through untouched (routes self-auth). Page requests get a per-request CSP nonce: sets `x-nonce` + `Content-Security-Policy` on the REQUEST headers (so Next stamps the nonce onto its own scripts) and on the response. Config matcher: all paths except `_next/static`, `_next/image`, `favicon.ico`, any path with a file extension.

---

### Auth Module (`/src/app/(auth)/`)

- **`src/app/(auth)/login/page.js`** - Login page with OTP flow ("use client").
  - `LoginPage()` - Two-step form: Step 1 collects email, calls `/api/auth/otp/send` (surfaces the server's specific error messages, e.g. rate-limit). Step 2 collects OTP (numeric input, `autoComplete="one-time-code"`) with auto-submit at 6 digits, a **Resend code button with a 30s cooldown**, and "Use a different email". On success, redirects based on `isNewUser` (new → `/welcome`, returning → `/dashboard`). Auto-redirects on mount if already authenticated — the mount check calls `/api/user` and on a 401 attempts ONE silent `/api/auth/refresh` before re-checking, so users with a live refresh cookie are sent to `/dashboard` instead of being shown the OTP form. State: `email`, `otp`, `step`, `loading`, `error`, `checkingSession`, `resendIn`. Uses raw `fetch()` deliberately — the `api()` wrapper's failed-refresh redirect to `/login` would loop on this page.

- **`src/app/(auth)/welcome/page.js`** - Welcome/onboarding page for new users ("use client").
  - `WelcomePage()` - Collects `accountName` (maxLength 60) via form, submits to `PUT /api/user` with `{ accountName, onboarded: true }`. Includes a **Skip for now** button that PUTs `{ onboarded: true }` first (so skipped users are never re-prompted) then goes to `/dashboard`. On success, redirects to `/dashboard`. State: `accountName`, `loading`, `error`.

---

### Main App Module (`/src/app/(main)/`)

- **`src/app/(main)/layout.js`** - Main app shell with sidebar, header, and user context ("use client").
  - `UserContext` - React Context exporting `{ user, setUser }`. Pages call `setUser` (e.g. profile save) so currency/name changes propagate app-wide without a reload.
  - `Sidebar()` - Nav sidebar (Dashboard/Transactions/Reports/Categories). Responsive overlay on mobile, animated via Framer Motion, active-route highlight.
  - `ProfileDropdown()` - User menu with Profile link and **two-step logout confirmation** (Logout → "Log out of FinTrack on this device?" → Yes/Cancel — a stray click can no longer log the user out). Closes on outside click and Escape; button has `aria-haspopup`/`aria-expanded`; items carry `role="menu"/"menuitem"`. Shows `user.accountName`; confirmed logout calls `POST /api/auth/logout`.
  - `MainLayout()` - Fetches user via `GET /api/user`. On transient failure shows an inline **retry card** instead of redirecting (definitive auth failures are handled inside `api()` itself). Sidebar resize handling only reacts to *crossing* the desktop breakpoint (manual collapse within a mode is preserved); route changes close the mobile sidebar via React's render-time-adjustment pattern (no setState-in-effect).

- **`src/app/(main)/dashboard/page.js`** - Dashboard page ("use client").
  - `generateSliceColors(count)` - Curated palette plus golden-angle HSL fallback so any number of pie slices gets a distinct color.
  - `StatCard()`, `DashboardSkeleton()` - Reusable stat card and loading skeleton.
  - `DashboardPage()` - Single `fetchData()` (useCallback, seq-guarded so only the latest fetch writes state) computes the client-local month window **per call**; mount effect fetches AND re-fetches on `visibilitychange` when the tab becomes visible (a tab left open across a month boundary self-corrects). `refreshWithSkeleton()` re-shows skeletons on event refetches. Adding a transaction refreshes stats **and bumps `budgetVersion`**. Pie chart via `SimpleChart`.

- **`src/app/(main)/transactions/page.js`** - Transactions page ("use client"). **Server-side filtered + paginated.**
  - `EditTransactionModal()` (exported for tests) - Edit modal wired to the shared `useDialogA11y` hook (Escape, focus trap, scroll lock, `role="dialog"` + `aria-modal`), amount field has `data-autofocus`. Category select or create (server error messages surfaced; caps: name ≤50, description ≤200, amount min 0.01), date normalized to local `YYYY-MM-DD` and saved as noon-local instant. Save calls `onSave(...)` which returns `{ ok } | { ok:false, message }` — failures render INSIDE the modal (`modalError`) since page banners would be hidden behind the overlay.
  - `TransactionCard()` - Mobile card for one transaction with inline confirm-once delete.
  - `TransactionsPage()` - State: `transactions`, `pageInfo {page,totalPages,total}`, `page`, `filters`, debounced `debouncedSearch` (300ms), `categoryOptions` (fetched from `/api/categories`). Fetches `GET /api/transactions?page=&limit=&search=&type=&category=&from=&to=` (from/to are local instants). Filter updates snap back to page 1 (`updateFilter`). **Deleting the only row on a page > 1 clamps back to the previous page** instead of stranding an empty page. Desktop table (with Description column) / mobile cards; result count + Prev/Next pagination when `totalPages > 1`; empty-states distinguish "no transactions" vs "no filter matches".

- **`src/app/(main)/reports/page.js`** - Reports page ("use client").
  - `ReportsPage()` - Validates dates before submit (both present, start ≤ end) with friendly inline errors; sends raw strings + absolute `startInstant`/`endInstant` (browser-timezone). Summary cards + Bar chart + income list. Currency via `UserContext`.

- **`src/app/(main)/categories/page.js`** - Categories management ("use client").
  - `CategoriesPage()` - Lists custom categories with All/Expense/Income tabs, add form (maxLength 50), inline confirm-once delete, and an **inline rename UI** (pencil → input, Enter/Esc shortcuts) calling `PUT /api/categories/[id]`. Single `fetchCategories()` used by both the mount effect and the Retry button. Fetch failure renders an explicit error banner with Retry — never a misleading empty state. "Matches default" badge retained.

- **`src/app/(main)/profile/page.js`** - Profile settings ("use client").
  - `ProfilePage()` - Reads `{ user, setUser }` from context; refreshes from server on mount (transient failures just stop loading — no forced logout). Save propagates via `setUser((prev) => ({...prev, …}))`. accountName maxLength 60. Security section: two-step inline confirm "Log Out From All Devices" → `POST /api/auth/logout-all` then hard `window.location.href = "/login"`.

- Error boundaries `src/app/(main)/error.js` and `src/app/error.js` unchanged (recoverable cards with Try again).

---

### API Routes

#### Auth API

- **`src/app/api/auth/otp/send/route.js`** - Sends OTP via Brevo (HTML **and** plain-text `textContent` parts for deliverability).
  - `getClientIp(request)` - x-forwarded-for/x-real-ip extraction.
  - `findUserByEmail(email)` - Lowercase lookup with exact-match legacy fallback.
  - Rate limiting is **MongoDB-backed sliding-window** (via `src/lib/rate-limit.js`): per-email 5/hour AND per-IP 20/hour (stops OTP-bombing many addresses). Slots are **refunded** if the email send fails.
  - `POST` - Validates email; checks both limits (429 uniform message); records hits; generates 6-digit CSPRNG OTP (`crypto.randomInt`), 10-min expiry, bcrypt-hashed via model hook. Preserves the previous pending OTP and restores it if the Brevo send throws. Handles the concurrent-signup unique-index race by refetching and retrying. Generic client errors only; `error.message` access guarded.

- **`src/app/api/auth/otp/verify/route.js`** - Verifies OTP and establishes session.
  - Body parsing happens INSIDE try — malformed JSON returns a controlled 400 "Invalid request body." (never a framework 500).
  - Brute-force lockout via Mongo-backed sliding window: ≥5 failures per email inside 15 minutes → uniform 429. Success clears the key (`resetKey`).
  - `DUMMY_HASH` - Real bcrypt hash compared against when no pending OTP exists, so response timing cannot reveal which emails have live codes.
  - `POST` - Uniform failure message everywhere; bcrypt compare ALWAYS runs. On success: clears OTP fields + failure history, generates access (15m) + refresh (30d) tokens, stores the refresh token as a **SHA-256 hash** (`hashToken`), purges expired sessions, sets httpOnly cookies (sameSite lax — strict withheld cookies from external-link arrivals and looked like a logout; lax still blocks cross-site POSTs). Returns `{ isNewUser }` computed as `!accountName && !onboarded`, so users who completed OR skipped onboarding go straight to the dashboard on later logins.

- **`src/app/api/auth/refresh/route.js`** - Refreshes access token. Implements **rotation + grace window + reuse detection**:
  - JWT verified first (bad/expired → cookies cleared, 401).
  - Session looked up by SHA-256 hash (legacy plaintext entries still matched until expiry).
  - ACTIVE token → rotate: entry marked `rotatedAt = now`, new hashed token pushed, new refresh cookie set.
  - ROTATED token **within 5-min grace** → concurrent tab/duplicate request: mints only a fresh access token; nothing else touched.
  - ROTATED token **past grace** → reuse treated as theft: ALL of the user's sessions revoked, cookies cleared, 401.
  - `dbConnect()` runs INSIDE try — DB outage returns retryable 500 without clearing cookies. Opportunistic prune of expired + rotated-past-grace entries.

- **`src/app/api/auth/logout/route.js`** - Removes this session's token from the DB by `$pull` matching `[hash, rawToken]` (raw kept for pre-hashing legacy sessions), then clears cookies regardless of DB outcome.

- **`src/app/api/auth/logout-all/route.js`** - Unchanged: empties `refreshTokens[]`; honest 500 on DB failure; cookies always cleared locally.

#### User API

- **`src/app/api/user/route.js`**
  - `GET` - Authenticated user data (`verifySession()`), excludes secrets.
  - `PUT` - Accepts `{ accountName, currency, onboarded }`; validates accountName (string, trimmed, ≤60) AND currency (must be USD/INR → otherwise 400). Setting a non-empty `accountName` **auto-completes onboarding**, and an explicit `onboarded: true` is accepted (welcome Skip path) — the flag can never be revoked. `$set`-only update.

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
  - `PUT` - **Rename with cascade, atomic where possible**: category doc rename + `Transaction.updateMany` + `Budget.updateMany` run inside a Mongo **transaction** when the deployment supports one (replica set / Atlas). On standalone instances it falls back to sequential writes with **best-effort rollback** (cascade failure restores the old name), so a mid-cascade error can no longer leave transactions pointing at a ghost label. Duplicate → 409; no-op fast path when the name is unchanged. ObjectId guard → 404.
  - `DELETE` - Deletes category, reassigns its transactions to default "Other", and **deletes budgets for that name**. ObjectId guard → 404.

#### Budgets API

- **`src/app/api/budgets/route.js`** - Month-scoped CRUD (`?month=YYYY-MM`). POST validates strictly: category non-empty string ≤50, month matching `^\d{4}-\d{2}$`, amount coerced via `Number()` and required finite ≥1 (numeric strings like "50" are coerced safely — string-compare bugs impossible). All three handlers run `dbConnect` inside their try blocks.

#### Reports API

- **`src/app/api/reports/dashboard/route.js`** - Aggregations accept `start` AND `end` instants (client-local month bounds; falls back to server-computed month). Every monthly aggregation matches `$gte start, $lt end` — future-dated transactions can't inflate current month. Balance = all-time income − expenses; recent 5 transactions.

- **`src/app/api/reports/budget-progress/route.js`** - Same start/end windowing. Spending aggregation excludes `excludeFromBudget`; separate aggregation sums excluded spend for transparency. Returns `{ overall, progress, totalSpent, excludedSpent }`.

- **`src/app/api/reports/generate/route.js`** - Prefers browser-timezone `startInstant`/`endInstant`; validates formats (400) and rejects reversed ranges (400). Summary + expense/income breakdowns sorted desc.

---

### MongoDB Models

- **`src/models/user.model.js`**
  - Fields: email (unique, validated), accountName, **onboarded** (bool — set when onboarding is completed OR skipped; drives `isNewUser`), otp (hashed, temp), otpExpires, role, currency (USD/INR), refreshTokens.
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
  - Constants: `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET` (throw at import if missing), `REFRESH_TOKEN_TTL_MS` (30d), `REFRESH_ROTATION_GRACE_MS` (5 min).
  - `hashToken(token)` - SHA-256 hex digest used to store/lookup refresh tokens.
  - `generateAccessToken(userId)` / `generateRefreshToken(userId)` (includes `jti`).
  - `verifyToken(token, secret)` - jsonwebtoken verify wrapper returning null on error.
  - `verifyAuth()` - Edge/server-component check via jose (root-page redirect only).
  - `verifySession()` - Full check for API routes: verifies access JWT, connects DB, confirms refresh token exists (by hash, legacy plaintext fallback). Returns `{user}` or `{user:null, error, status}` where status distinguishes definitive auth failures (401) from infrastructure trouble (503) — callers never turn a DB outage into a forced logout.
  - `purgeExpiredRefreshTokens(userId)` - Pulls entries older than TTL OR rotated-past-grace.

- **`src/lib/rate-limit.js`** - MongoDB-backed sliding-window limiter with **static imports** (`@/lib/mongodb`, `@/models/ratelimit.model`). `recordHit(key, windowMs)` (pushes timestamp, $slice-capped), `countRecentHits(key, windowMs)` (aggregate $filter count), `popLastHit(key)` (refund quota), `resetKey(key)` (clear on success). Every helper **fails open** on DB errors so the limiter can never lock everyone out during an incident.

- **`src/lib/useDialogA11y.js`** *(new)* - Shared hook powering ALL modal overlays (AddTransactionDrawer, EditTransactionModal, BudgetManager): Escape-to-close, Tab/Shift+Tab focus trap inside the panel, body scroll lock + restore, initial focus to `[data-autofocus]` (else first focusable), and focus return to the previously focused element on close.

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
  - `AddTransactionDrawer({...})` - Type switch resets selection via `handleTypeChange` (event-driven, no effect). Amount min 0.01 step 0.01; description maxLength 200; new-category maxLength 50. Category creation surfaces the server's message (e.g. 409 duplicate), then switches back to the dropdown with the new value preselected (prevents double-create retries). Submits date as noon-local instant through `api()`. Error-body JSON parse guarded (`.catch(() => ({}))`). **Uses `useDialogA11y`**: Escape closes, focus trapped, scroll locked, `role="dialog"` + `aria-modal="true"`, amount autofocused.

- **`src/components/SimpleChart.js`** - Lazy-loaded Chart.js Pie with loading/error/empty states. Unchanged.

- **`src/components/BudgetProgress.js`** - Dashboard budget bars. Sends `start`+`end`+`month` (client-local window). **Load failures now render an explicit error card with a Retry button — the section never silently vanishes** (Retry resets visible state user-initiated, bumps fetch attempt). Color-coded progress (indigo/amber/red), overall + per-category sections, "(excl. X in one-time expenses)" note. Consumes `{ user }` from context.

- **`src/components/BudgetManager.js`** - Budget-setting drawer:
  - Keeps `originalBudgets` snapshot from load; **Save deletes budgets whose fields were cleared** (clearing ≠ silently keeping the old limit).
  - **Load failures show an in-drawer banner with Retry; save controls hidden until data loads** (never an empty form pretending no budgets exist).
  - **Wired to `useDialogA11y`** (Escape + scroll lock + focus trap) with `role="dialog"`/`aria-modal`; delete buttons have aria-labels.
  - Errors are VISIBLE (inline banner) for failed saves and removals; inputs live in a `<form>` so native validation runs; footer is sticky.
  - Over-budget warning text uses the user's currency via `formatCurrency` (no hardcoded `$`).

---

## Authentication Flow

1. **Login**: email → OTP generated with `crypto.randomInt` (CSPRNG), sent via Brevo. Limits (Mongo-backed, shared across instances): 5/hour/email + 20/hour/IP; slots refunded on send failure; previous pending OTP restored if the email fails.
2. **OTP Verify**: Mongo-backed lockout (5 failures / sliding 15min → uniform 429); bcrypt compare always runs (dummy-hash timing equalization); uniform failure messages (no enumeration).
3. **Session**: access (15m) + refresh (30d) httpOnly sameSite=lax cookies (lax so external-link arrivals keep their session; cross-site POSTs remain cookieless). Refresh tokens stored in the user document as **SHA-256 hashes**; expired entries pruned opportunistically on login/refresh.
4. **Verification**: all data routes use `verifySession()` (DB-backed revocation) with 401-vs-503 classification.
5. **Token Refresh**: automatic via `api()` (single-flight per tab, Web-Lock serialized across tabs). Rotation marks the old entry `rotatedAt` and stores a fresh hash; duplicates within the 5-minute grace window get an access token only; presenting a rotated token AFTER grace revokes every session (reuse detection). The root page (`SessionGate`) and the login page's mount check also refresh silently, so a lapsed 15-minute access cookie never forces an OTP re-login while the 30-day session lives.
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
npm test        # vitest — runs ALL 191 tests in one go via test/run-all.test.js
npm run lint    # eslint . (clean)
```
