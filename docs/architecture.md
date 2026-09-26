# Finance App - Architecture Document

## Overview
A Next.js 16 personal finance tracking application with OTP-based authentication, transaction management, reporting, and data visualization. Uses MongoDB with Mongoose for data persistence and Brevo (Sendinblue) for email-based OTP delivery.

**Tech Stack:** Next.js 16, React 19, MongoDB/Mongoose, Tailwind CSS v4, Chart.js, Framer Motion, Lucide React, Brevo API, JWT (jsonwebtoken + jose), Vitest

---

## Project Structure

### Root Configuration Files

| File | Purpose |
|------|---------|
| `/package.json` | Project metadata, scripts (dev/build/start/lint/test/cap:sync/cap:open/cap:run), dependencies |
| `/next.config.mjs` | Next.js configuration (webpack fallbacks, baseline security headers; CSP is set per-request by the proxy) |
| `/vitest.config.mjs` | Vitest config: **single-entry runner** (`test/run-all.test.js` only), jsdom environment, `@` alias → `./src`, plus a tiny esbuild plugin that lets JSX inside `src/**/*.js` transform for component tests |
| `/postcss.config.mjs` | PostCSS configuration for Tailwind CSS |
| `/eslint.config.mjs` | ESLint configuration |
| `/jsconfig.json` | JavaScript/Next.js path aliases (@/ maps to ./src) |
| `/capacitor.config.ts` | Capacitor iOS configuration (points to `https://fintrack.vistaenvision.com`, dark status bar, safe area handling, configurable via `CAPACITOR_SERVER_URL`) |
| `/README.md` | Project documentation |
| `/appMigration.md` | iOS app migration guide & workflow (Next.js + Capacitor + Xcode) |
| `/docs/architecture.md` | Project architecture documentation |
| `/docs/appsteps.md` | Complete log of all iOS installation steps, passwords/prompts, and credentials used |
| `/docs/updateapp.md` | Guide on updating the iOS app (Vercel automatic deploys, local testing, native updates, 7-day cert renewal) |
| `/docs/audit.md` | Audit status (both 2026-08-22 cycles closed — no open items; standing verification + intentional-behavior notes only) |
| `/docs/suggestions.md` | Suggestions / improvement / vulnerability log (open items only — completed ones removed, history in git) |
| `/AGENTS.md` | Repo-local AI behavior + architecture-docs conventions (mirrors global rules; PermissionGate standard) |
| `/passkey-integration-plan.md` | Design-only plan for future WebAuthn/passkey login (proposes `RP_NAME`/`RP_ID`/`ORIGIN`, new routes, user-model `passkeys` array — NOT implemented, no src references) |
| `/package-lock.json` | Locked dependency tree (npm install reproducibility) |
| `/.gitignore` | Git ignores (node_modules, .next, env files, orphan-tx backup JSONs) |
| `/.gitattributes` | Git attributes (line-ending / diff config) |
| `/public/file.svg`, `/public/globe.svg` | Static Next.js template SVGs (no code references; matcher excludes `.*\.[^/]+$` so proxy skips them) |
| `/src/app/favicon.ico` | App favicon (excluded from proxy matcher) |
| `/src/app/a.svg` | Static SVG asset served from the app dir (excluded from proxy matcher by extension rule) |

### Test Suite (`/test/`)

`npm test` executes ONE vitest entry (`test/run-all.test.js`) which imports every suite below — the whole site's tests run in one go.

| File | Covers |
|------|--------|
| `/test/run-all.test.js` | Single entry: sets test env vars, registers ALL shared module mocks (delegating factories → `globalThis.*`), imports every suite |
| `/test/helpers/setup.js` | Stable globalThis mock singletons (models registry, dbConnect, cookies store, api mock, router, Brevo client) + DOM stubs (ResizeObserver/matchMedia) |
| `/test/helpers/mocks.js` | `makeQueryBuilder()` chainable awaitable stub; `makeModel()` constructable mongoose-model-shaped mock with spied statics; registry factory |
| `/test/suites/utils.suite.js` | `lib/utils`: formatCurrency USD/INR/null/negative, formatDate, formatDateForInput local parts/padding/rejections, isValidMonthKey (rejects 2026-13/00), utcMonthKey determinism |
| `/test/suites/auth-lib.suite.js` | `lib/auth`: hashToken SHA-256 properties, access/refresh token roundtrip (+jti), verifyToken garbage→null, purgeExpiredRefreshTokens $pull cutoffs + 20-session cap (oldest-first, skipped under limit), REAL verifySession branches (missing tokens 401, bad access 401 w/o DB, success via hash + legacy-plaintext $or arms, revoked 401, transient DB 503) |
| `/test/suites/api-client.suite.js` | `lib/api` refresh contract: pass-through, retry-once, transient 500/network ≠ logout, definitive 401 → /login, deadlock regression (retried 401 returned not hung), concurrent single-flight queue |
| `/test/suites/server-utils.suite.js` | sendSuccess/sendError shapes + statuses |
| `/test/suites/rate-limit.suite.js` | recordHit $push/$slice/expiry, countRecentHits pipeline shape + cutoff, popLastHit $pop, resetKey deleteOne, FAILS OPEN on DB errors, getClientIp (x-real-ip preferred, last XFF entry), recordHitAndCount allow/deny/fail-open |
| `/test/suites/dialog-a11y.suite.jsx` | `useDialogA11y`: scroll lock/restore, focus-in ([data-autofocus]) + focus restore, Escape closes once, Tab/Shift+Tab wrap, inert when closed |
| `/test/suites/proxy.suite.js` | Routing matrix (authed /login→dashboard, anon protected→login, /welcome never bounced), per-request CSP nonce headers, dev unsafe-eval vs prod, API passthrough, config matcher exclusions |
| `/test/suites/models.suite.js` | Real schemas via importActual: Transaction validators/virtual/indexes/exclude default; Category required/unique index/cap/enum; Budget month regex/amount≥1/unique index; OTP compare contract |
| `/test/suites/api-auth.suite.js` | otp/send (validation, malformed JSON 400, atomic record-then-count email+IP windows, HTML+TEXT email U5, lowercase new users, E11000 race retry, Brevo failure → restore+refund+500); otp/verify (malformed JSON 400 M2, missing fields, lockout 429 on over-max counts, uniform failures incl. expired/wrong/no-pending, success clears OTP + hashed refresh push + cookie issue + resets BOTH email and IP quotas, isNewUser B3 matrix); refresh (no-cookie 401 no-DB, garbage clears cookies, revoked 401, ACTIVE conditional rotation via arrayFilters + race-loser grace test, grace-window access-only, past-grace revoke-all, DB-outage 500 keeps cookies); logout ($pull hash+raw, honest 500 on DB failure, cookies always cleared incl. DB error); logout-all (401s, empties array, honest 500) |
| `/test/suites/api-user.suite.js` | GET (sans secrets, 404, 503 passthrough); PUT (60-char cap, currency 400, empty-body 400, B3 auto-onboard on name save, explicit onboarded flag, never revocable, trim, combined update, 404) |
| `/test/suites/api-transactions.suite.js` | GET pagination/clamps/type/category/search regex-escaping/date bounds/present-but-invalid from/to → 400/status passthrough; POST validations incl. malformed JSON + non-string description 400, as-sent noon instant persistence, excludeFromBudget coercion, ValidationError→400; [id] ObjectId guards, PUT strict 400s for present-but-invalid type/amount/category/date/description (never silent drops), omission of absent fields, owner-scoped 404, DB ValidationError→400, DELETE 404/200 |
| `/test/suites/api-categories.suite.js` | GET merge/dedupe/allCustom; POST required/enum-validated type/cap/409/malformed-JSON/create-scoped/DB-outage 500; PUT rename (ObjectId 404 pre-DB, JSON guard, no-op fast path, budget-collision 409 pre-check, cascade old→new to transactions+budgets, duplicate→409 without cascade, full revert incl. tx/budget re-point on cascade failure, name validation); DELETE reassign Other + budget cleanup + best-effort doc restore + 404-no-side-effects |
| `/test/suites/api-budgets.suite.js` | GET month default (UTC)/verbatim; POST M4 strict guards (missing fields, strict YYYY-MM incl. impossible months, malformed JSON 400, non-finite/sub-1 amounts, numeric-string coercion, trimmed category, 50-char cap, dup→409, DB-outage 500); DELETE required param/trimmed match/strict month/404-when-absent/owner scope |
| `/test/suites/api-reports.suite.js` | dashboard aggregates with $gte/$lt client bounds + present-but-invalid start/end → 400 + balance math + server-month fallback + zero-fill; budget-progress overall/category blend, strict monthKey (400 on garbage/impossible), month-derived-from-window when absent, capped percentage, overBudget flags, excluded spend, month fallback; generate instants preferred (invalid instant → 400), 3-year range cap, reversed-range 400, summary math, sorted breakdowns |
| `/test/suites/budget-components.suite.jsx` | BudgetProgress success bars/exclusion note, error banner + Retry recovery (B1), null when nothing to show; BudgetManager prefilled inputs, load-error banner + Retry hiding save (B2), Escape close (U2), dialog semantics (U3), clear-on-save deletes budgets server-side |
| `/test/suites/overlay-components.suite.jsx` | AddTransactionDrawer dialog semantics + autofocus, Escape close, type-switch category reset guard, add-new-category reveal (50-cap), noon-local submit payload, category-load error note, interrupted-draft restore on reopen; EditTransactionModal semantics, category-load modalError, type-switch keeps shared names, modalError inline on save failure, sends ONLY editable fields |
| `/test/suites/page-components.suite.jsx` | ProfileDropdown two-step logout confirm + cancel (U1); WelcomePage skip PUTs onboarded + replace-navigates (failure stays put with inline error), save completes onboarding in one call (trimmed), inline server errors (B3); LoginPage 30s resend cooldown countdown/auto-submit at 6 digits single-flight (digits filtered, replace-navigates)/different-email reset; TransactionsPage page-clamp after deleting last row of page 2 (B4); MainLayout navigation renders desktop sidebar and keeps mobile drawer closed by default |

**Test conventions:** all suites compose into one file, so shared modules are mocked ONCE in `run-all.test.js` via identical delegating factories reading `globalThis.*` handlers that each suite configures in its own `beforeEach`. Model chains (`.find().sort().lean()`) must be mocked with `makeQueryBuilder` builders (never bare promises). Component tests use jsdom + @testing-library/react.

### Source Code (`/src/`)

#### App Layout & Entry Points

- **`src/app/layout.js`** - Root layout component. Sets up Inter font, global CSS, and base HTML structure. Viewport keeps `device-width` + `viewportFit: cover` but never disables pinch-zoom (maximumScale/userScalable-off is a mobile a11y failure).
  - `RootLayout()` - Renders `<html>` and `<body>` with Inter font and global styles. Defines metadata (title: "Finance Tracker"). Exports `dynamic = "force-dynamic"` — REQUIRED so the proxy-generated CSP nonce is stamped onto Next's inline bootstrap scripts in production builds (static prerendering cannot carry per-request nonces).

- **`src/app/page.js`** - Root page (entry point at `/`). Checks authentication and redirects.
  - `RootPage()` (async) - Calls `verifyAuth()`. If authenticated, redirects to `/dashboard`. Otherwise renders `SessionGate` — it no longer hard-redirects to `/login`, because an expired 15-minute access cookie does NOT mean the 30-day refresh session is dead.

- **`src/app/session-gate.js`** *(new)* - Client-side fallback for the root page.
  - `SessionGate()` - Rendered when server-side `verifyAuth()` fails. Attempts ONE silent `POST /api/auth/refresh` with a 10s abort timeout (a hanging refresh resolves to `/login` instead of spinning forever; `role="status"` + aria-label for screen readers): success → `/dashboard`, failure/network error → `/login`. Shows the bouncing-pig loading screen while deciding. Prevents returning users from being forced into OTP re-logins when only the short-lived access token lapsed.

- **`src/app/globals.css`** - Global styles. Imports Tailwind CSS v4 (`@import "tailwindcss"`). Configures modern dark fintech design system: custom dark scrollbar, autofill dark styles, glassmorphic panel utilities (`.glass-panel`, `.glass-panel-subtle`), glow utilities (`.glow-emerald`), and antialiased typography defaults.

#### Middleware (Proxy)

- **`src/proxy.js`** - Next.js Proxy (Middleware) for route protection AND Content-Security-Policy generation.
  - `buildCsp(nonce)` - Builds the strict CSP string: `script-src 'self' 'nonce-…' 'strict-dynamic'` (+ `'unsafe-eval'` in dev only), `style-src 'self' 'unsafe-inline'` (Chart.js/Framer Motion tuning), locked-down `img/font/connect/object/base-uri/form-action/frame-ancestors`.
  - `proxy()` - Auth routing: logged-in users hitting `/login` → `/dashboard`. Public paths: `/login`, `/api` (**NOTE: `/welcome` is deliberately NOT in either list** — new users arrive there with fresh cookies after OTP verify and must NOT be bounced; anonymous visitors are redirected to `/login` by the protected-path check). `/api/*` requests pass through untouched (routes self-auth). Page requests get a per-request CSP nonce: sets `x-nonce` + `Content-Security-Policy` on the REQUEST headers (so Next stamps the nonce onto its own scripts) and on the response. Config matcher: all paths except `_next/static`, `_next/image`, `favicon.ico`, any path with a file extension.
  - `config` - Exported matcher (`/((?!_next/static|_next/image|favicon.ico|.*\.[^/]+$).*)`) so static assets and files with extensions skip the proxy.

---

### Auth Module (`/src/app/(auth)/`)

- **`src/app/(auth)/login/page.js`** - Login page with OTP flow ("use client").
  - `LoginPage()` - Two-step form: Step 1 collects email, calls `/api/auth/otp/send` (surfaces the server's specific error messages, e.g. rate-limit). Step 2 collects OTP (numeric input, `autoComplete="one-time-code"`) with single-flight auto-submit at 6 digits (ref guard — fast typing/paste can't double-verify), a **Resend code button with a 30s cooldown**, and "Use a different email". On success, replace-navigates based on `isNewUser` (new → `/welcome`, returning → `/dashboard`; replace so Back never returns to OTP). Auto-redirects on mount if already authenticated — the mount check calls `/api/user` and on a 401 attempts ONE silent `/api/auth/refresh` before re-checking, so users with a live refresh cookie are sent to `/dashboard` instead of being shown the OTP form. State: `email`, `otp`, `step`, `loading`, `error`, `checkingSession`, `resendIn`. Uses raw `fetch()` deliberately — the `api()` wrapper's failed-refresh redirect to `/login` would loop on this page.

- **`src/app/(auth)/welcome/page.js`** - Welcome/onboarding page for new users ("use client").
  - `WelcomePage()` - Collects `accountName` (maxLength 60, trimmed, blank rejected inline) via form, submits to `PUT /api/user` with `{ accountName, onboarded: true }`. Includes a **Skip for now** button that PUTs `{ onboarded: true }` first (so skipped users are never re-prompted) then replace-navigates to `/dashboard` — a failed skip surfaces an inline error and does NOT navigate (avoids the re-prompt loop). State: `accountName`, `loading`, `skipping`, `error`.

---

### Main App Module (`/src/app/(main)/`)

- **`src/app/(main)/layout.js`** - Main app shell with desktop sidebar, mobile drawer, header, and user context ("use client").
  - `UserContext` - React Context exporting `{ user, setUser }`. Pages call `setUser` (e.g. profile save) so currency/name changes propagate app-wide without a reload.
  - `SidebarContent()` - Shared navigation list (Dashboard/Transactions/Reports/Categories), active-route highlight, FinTrack branding, and smart tracking badge. On mobile, triggers close on link click and renders the 'X' dismiss button.
  - `DesktopSidebar()` - Static permanent sidebar for desktop browser (`hidden lg:flex`). Normal desktop flow, always visible, zero drag/motion transforms or swipe listeners.
  - `MobileDrawer()` - Mobile drawer overlay (`lg:hidden`) with safe area insets (`pt-safe pb-safe`), animated via Framer Motion, backdrop blur dimming. Closed by default when opening the app on a phone (`isMobileOpen = false`). Supports swipe-left/drag gesture to dismiss.
  - `ProfileDropdown()` - User menu with Profile link and **two-step logout confirmation** (Logout → "Log out of FinTrack on this device?" → Yes/Cancel — a stray click can no longer log the user out). Closes on outside click and Escape; button has `aria-haspopup`/`aria-expanded`; items carry `role="menu"/"menuitem"`. Shows `user.accountName`; confirmed logout calls `POST /api/auth/logout`.
  - `MainLayout()` - Fetches user via `GET /api/user`. On transient failure shows an inline **retry card with a "Go to login" escape hatch** (so a revoked-but-unclassified session can't trap the user in a reload loop) instead of redirecting. Uses a locked viewport (`fixed inset-0 h-[100dvh] w-full`); safe-area padding; isolated content scrolling (`overscroll-y-contain lg:overscroll-y-auto`); and edge-swipe gesture handler from the left boundary to open the drawer on mobile phones only. Desktop browser header and layout remain completely normal. Route changes close the mobile drawer (ref+effect, never setState-in-render). No blanket header `preventDefault` — scroll gestures starting on the header must work.

- **`src/app/(main)/dashboard/page.js`** - Dashboard page ("use client").
  - `generateSliceColors(count)` - Curated palette plus golden-angle HSL fallback so any number of pie slices gets a distinct color.
  - `StatCard()`, `DashboardSkeleton()` - Reusable stat card and loading skeleton.
  - `DashboardPage()` - Single `fetchData()` (useCallback, seq-guarded so only the latest fetch writes state) computes the client-local month window **per call**; mount effect fetches AND re-fetches on `visibilitychange` when the tab becomes visible (throttled to ≥30s since the last success; a tab left open across a month boundary self-corrects). Refetch failures NEVER wipe good data — the last snapshot stays visible with an amber retry banner; only a failed first load shows the error wall. Adding a transaction reloads via skeleton **without nulling data first**. Pie chart via `SimpleChart`. Recent list is labeled "N recent" (slice of 5, not a total).

- **`src/app/(main)/transactions/page.js`** - Transactions page ("use client"). **Server-side filtered + paginated.**
  - `EditTransactionModal()` (exported for tests) - Edit modal wired to the shared `useDialogA11y` hook (Escape, focus trap, scroll lock, `role="dialog"` + `aria-modal`, labelled close button), amount field has `data-autofocus`. Category select or create (server error messages surfaced; category-load failure shows a modalError instead of a stuck required select; caps: name ≤50, description ≤200, amount min 0.01), type-switch keeps the category when the name exists in the other type's list, date normalized to local `YYYY-MM-DD` and saved as noon-local instant. Save calls `onSave(...)` which returns `{ ok } | { ok:false, message }` — failures render INSIDE the modal (`modalError`) since page banners would be hidden behind the overlay.
  - `TransactionCard()` - Mobile card for one transaction with inline confirm-once delete.
  - `TransactionsPage()` - State: `transactions`, `pageInfo {page,totalPages,total}`, `page`, `filters`, debounced `debouncedSearch` (300ms), `categoryOptions` (fetched from `/api/categories`; the merged expense+income lists are **deduped via Set** because "Other" is a default in both types — duplicate names collided as React `<option>` keys; refreshed after every successful edit since inline creates add names). Fetches `GET /api/transactions?page=&limit=&search=&type=&category=&from=&to=` (from/to are local instants; malformed date inputs are skipped, never crashing render). Filter updates snap back to page 1 (`updateFilter`) and show a subtle "Updating…" indicator while the stale list stays readable. **Deleting the only row on a page > 1 clamps back to the previous page** instead of stranding an empty page, and ANY refetch whose result set shrank below the current page clamps down too. Saving an edit whose new values fall outside the active filters shows a sky-blue "Saved — no longer matches your filters" notice with Clear-filters (rows moving out of view are never silent). PUT failures surface the server's `message`/`error` via `onSave` → modal. Desktop table (with Description column) / mobile cards; result count + Prev/Next pagination when `totalPages > 1`; empty-states distinguish "no transactions" vs "no filter matches".

- **`src/app/(main)/reports/page.js`** - Reports page ("use client").
  - `ReportsPage()` - Validates dates before submit (both present, start ≤ end) with friendly inline errors; sends raw strings + absolute `startInstant`/`endInstant` (browser-timezone). The previous report stays visible while the next generates (no "No Report Generated Yet" flash; failures preserve it) and the response shape is validated before render (malformed 200s → inline error, never a crash). Empty-state CTA reads "Generate Report" (it generates for the selected dates). Summary cards + Bar chart + income list. Currency via `UserContext`.

- **`src/app/(main)/categories/page.js`** - Categories management ("use client").
  - `CategoriesPage()` - Lists custom categories with All/Expense/Income tabs, add form (maxLength 50), inline confirm-once delete, and an **inline rename UI** (pencil → input, Enter/Esc shortcuts) calling `PUT /api/categories/[id]`. Single `fetchCategories()` used by both the mount effect and the Retry button. Fetch failure renders an explicit error banner with Retry — never a misleading empty state. "Matches default" badge retained.

- **`src/app/(main)/profile/page.js`** - Profile settings ("use client").
  - `ProfilePage()` - Reads `{ user, setUser }` from context and seeds the form FROM context (never blank defaults); refreshes from server on mount. Save is DISABLED until a successful load (`ready`) and the name is trimmed + blank-rejected — a failed fetch can never lead to a blank-overwrite save. A load failure shows an amber banner with Reload. Save propagates via `setUser((prev) => ({...prev, …}))`. accountName maxLength 60. Currency select falls back to displaying an out-of-list stored value rather than a blank selection. Security section: two-step inline confirm "Log Out From All Devices" → `POST /api/auth/logout-all` then hard `window.location.href = "/login"`.

- Error boundaries (recoverable cards with Try again + console.error logging):
  - `src/app/error.js` - `RootError({ error, reset })` — root-segment boundary (root layout itself needs `global-error.js`, intentionally not used).
  - `src/app/(main)/error.js` - `MainError({ error, reset })` — main-shell segment boundary so a (main) page crash shows a recoverable screen instead of a white page.

---

### API Routes

#### Auth API

- **`src/app/api/auth/otp/send/route.js`** - Sends OTP via Brevo (HTML **and** plain-text `textContent` parts for deliverability).
  - Rate limiting is **MongoDB-backed record-then-count** (via `src/lib/rate-limit.js`): per-email 5/hour AND per-IP 20/hour (stops OTP-bombing many addresses). Recording BEFORE the decision closes the check-then-act race; slots are **refunded** if the email send fails. IP bucketing uses the shared spoof-resistant `getClientIp` (x-real-ip preferred, else last XFF entry — the per-email bucket stays authoritative).
  - `POST` - Malformed JSON is a controlled 400; validates email; checks both limits (429 uniform message); generates 6-digit CSPRNG OTP (`crypto.randomInt`), 10-min expiry, bcrypt-hashed via model hook. Preserves the previous pending OTP and restores it if the Brevo send throws. Handles the concurrent-signup unique-index race by refetching and retrying. Generic client errors only; `error.message` access guarded.

- **`src/app/api/auth/otp/verify/route.js`** - Verifies OTP and establishes session.
  - Body parsing happens INSIDE try — malformed JSON returns a controlled 400 "Invalid request body." (never a framework 500).
  - Brute-force lockout via Mongo-backed sliding window: ≥5 failures per email inside 15 minutes → uniform 429. Success clears the key (`resetKey`).
  - `DUMMY_HASH` - Real bcrypt hash compared against when no pending OTP exists, so response timing cannot reveal which emails have live codes.
  - `POST` - Record-then-count lockout (5/email + 25/IP per sliding 15min → uniform 429; the attempt is already recorded, so no second write on failure). Uniform failure message everywhere; bcrypt compare ALWAYS runs. On success: clears OTP fields + resets BOTH email and IP failure histories (shared-NAT users would otherwise inherit strangers' 429s), generates access (15m) + refresh (30d) tokens, stores the refresh token as a **SHA-256 hash** (`hashToken`), purges expired sessions (incl. 20-session cap), sets httpOnly cookies (sameSite lax — strict withheld cookies from external-link arrivals and looked like a logout; lax still blocks cross-site POSTs). Returns `{ isNewUser }` computed as `!accountName && !onboarded`, so users who completed OR skipped onboarding go straight to the dashboard on later logins.

- **`src/app/api/auth/refresh/route.js`** - Refreshes access token. Implements **conditional rotation + grace window + reuse detection**:
  - JWT verified first (bad/expired → cookies cleared, 401).
  - Session looked up by SHA-256 hash (legacy plaintext entries still matched until expiry).
  - ACTIVE token → conditional rotate: the `rotatedAt` mark carries an arrayFilter requiring `rotatedAt: null`, so concurrent double-refreshes can't both win — exactly one mints a replacement; the loser re-reads and takes the grace path (no session proliferation). Then the fresh hashed token is pushed and the new refresh cookie set.
  - ROTATED token **within 5-min grace** → concurrent tab/duplicate request: mints only a fresh access token; nothing else touched.
  - ROTATED token **past grace** → reuse treated as theft: ALL of the user's sessions revoked, cookies cleared, 401.
  - `dbConnect()` runs INSIDE try — DB outage returns retryable 500 without clearing cookies. Opportunistic prune of expired + rotated-past-grace entries (incl. session cap).

- **`src/app/api/auth/logout/route.js`** - Removes this session's token from the DB by `$pull` matching `[hash, rawToken]` (raw kept for pre-hashing legacy sessions). Honest status: DB failure returns 500 (the session may still be live) — cookies are still always cleared locally.

- **`src/app/api/auth/logout-all/route.js`** - Unchanged: empties `refreshTokens[]`; honest 500 on DB failure; cookies always cleared locally.

#### User API

- **`src/app/api/user/route.js`**
  - `GET` - Authenticated user data (`verifySession()`), excludes secrets.
  - `PUT` - Accepts `{ accountName, currency, onboarded }`; validates accountName (string, trimmed, ≤60) AND currency (must be USD/INR → otherwise 400). Setting a non-empty `accountName` **auto-completes onboarding**, and an explicit `onboarded: true` is accepted (welcome Skip path) — the flag can never be revoked. `$set`-only update.

#### Transactions API

- **`src/app/api/transactions/route.js`**
  - `escapeRegex(value)` - Escapes user input for `$regex`.
  - `parseInstant(value)` - Safe date parsing.
  - `GET` - **Server-side filtered + paginated**: `page` (default 1), `limit` (default 50, max 200), optional `type`, `category`, `search` (regex over description+category), `from`/`to` instants. Present-but-unparseable `from`/`to` are 400s (never silent unfiltering). Returns `{ transactions, total, page, pageSize, totalPages }` sorted date desc, createdAt desc.
  - `POST` - Strict validation (type/amount/category/date; malformed JSON and non-object bodies → 400; non-string description → 400); stores client-sent noon-local instant as-is; persists `excludeFromBudget` deterministically.

- **`src/app/api/transactions/[id]/route.js`**
  - GET/PUT/DELETE scoped to owner via `findOne…({ _id, userId })`. Malformed ObjectIds now return **404** (`mongoose.isValidObjectId` guard) instead of cast-error 500s. PUT is strictly validated: present-but-invalid type/amount/category/date/description are **400s** (the old silent-drop returned 200 while changing nothing); absent fields are omitted; `excludeFromBudget` spread on `!== undefined` so clearing persists.

#### Categories API

- **`src/app/api/categories/route.js`**
  - `GET` - Defaults + custom merged per type, plus `allCustom` with `_id`s.
  - `POST` - Requires name (trimmed, ≤50 chars) + type (`expense`|`income` enum → 400 otherwise); malformed JSON → 400; duplicate → 409; infrastructure failures → 500 (never 400); `dbConnect` inside try.

- **`src/app/api/categories/[id]/route.js`**
  - `PUT` - **Rename with cascade, atomic where possible**: malformed JSON → 400. A budget-collision pre-check rejects renames whose target name already owns budgets (409 — budgets are typeless, so the cascade would duplicate-key mid-flight). Otherwise category doc rename + `Transaction.updateMany` + `Budget.updateMany` run inside a Mongo **transaction** when the deployment supports one (replica set / Atlas). On standalone instances it falls back to sequential writes with **full best-effort rollback** (transactions + budgets re-pointed AND the old name restored), so a mid-cascade error can no longer split-brain the data. Duplicate → 409; no-op fast path when the name is unchanged. ObjectId guard → 404.
  - `DELETE` - Deletes category, reassigns its transactions to default "Other", and **deletes budgets for that name**. Cascade failures best-effort RESTORE the category doc (same `_id`) so rows never reference a missing category and retries stay possible. ObjectId guard → 404.

#### Budgets API

- **`src/app/api/budgets/route.js`** - Month-scoped CRUD (`?month=YYYY-MM`, strictly validated — impossible months like `2026-13` are 400). GET falls back to the UTC current month (never server-local parts). POST validates strictly: category non-empty string ≤50, amount coerced via `Number()` and required finite ≥1 (numeric strings like "50" are coerced safely — string-compare bugs impossible); malformed JSON → 400; infrastructure failures → 500 (never 400). DELETE trims the category (matching POST-trimmed storage), validates month, and 404s when nothing was deleted instead of reporting false success. All three handlers run `dbConnect` inside their try blocks.

#### Reports API

- **`src/app/api/reports/dashboard/route.js`** - Aggregations accept `start` AND `end` instants (client-local month bounds; falls back to server-computed month). Present-but-unparseable bounds are 400s. Every monthly aggregation matches `$gte start, $lt end` — future-dated transactions can't inflate current month. Balance = all-time income − expenses; recent 5 transactions.

- **`src/app/api/reports/budget-progress/route.js`** - Same start/end windowing (present-but-invalid → 400). Budgets always come from the SAME month as the spending window: explicit `month` wins (strictly validated, 400 on garbage/impossible), otherwise derived from the window start (UTC), otherwise UTC now. Spending aggregation excludes `excludeFromBudget`; separate aggregation sums excluded spend for transparency. Returns `{ overall, progress, totalSpent, excludedSpent }`.

- **`src/app/api/reports/generate/route.js`** - Prefers browser-timezone `startInstant`/`endInstant` (present-but-invalid → 400); validates formats (400) and rejects reversed ranges (400) and ranges over 3 years (400 — unbounded windows load full history into memory). Summary + expense/income breakdowns sorted desc.

---

### MongoDB Models

- **`src/models/user.model.js`**
  - Fields: email (unique, validated), accountName, **onboarded** (bool — set when onboarding is completed OR skipped; drives `isNewUser`), otp (hashed, temp), otpExpires, role, currency (USD/INR), refreshTokens.
  - `RefreshTokenSchema` - `token` stores the **SHA-256 hash** of the JWT (never raw); `deviceInfo`, `ipAddress`, `createdAt`; `rotatedAt` (set when rotation supersedes the token — valid during the grace window, purged after, reuse past it = theft). TTL indexes don't work on subdocument arrays — pruning happens in code.
  - `pre("save")` hashes OTP when modified; `compareOtp()` method.

- **`src/models/transaction.model.js`** - userId (indexed), type enum, amount (>0), date, category (≤50), description (≤200), excludeFromBudget bool. Compound indexes `{userId,date:-1}` + `{userId,type,date:-1}` via `.index()`. `formattedAmount` virtual.

- **`src/models/category.model.js`** - userId, name (required, trimmed, **maxlength 50** — matches Transaction.category cap so every custom category is assignable), type enum. Unique `{userId,name,type}`.

- **`src/models/budget.model.js`** - userId, category, amount (≥1), month (strict `YYYY-MM` calendar regex — `2026-13` rejected so no invisible budgets). Unique `{userId,category,month}`.

- **`src/models/ratelimit.model.js`** *(new)* - Backing store for auth rate limiting: `{ key (unique), hits [Date] ($slice-capped at 100), expiresAt }` with a **top-level TTL index** (`expireAfterSeconds: 0`) so MongoDB auto-purges expired docs (~60s sweeper). Shared across instances; survives restarts.

---

### Utility Libraries (`/src/lib/`)

- **`src/lib/mongodb.js`** - Singleton Mongoose connection (`bufferCommands:false`, pool 10, timeouts). Resets cached promise on failure. Reads `MONGODB_URI` lazily inside `dbConnect()` (never at import — since 2026-09-26, so `next build` succeeds without env configured).
  - `dbConnect()` - Default export; throws a clear "define MONGODB_URI" error only when a DB op actually runs without env; returns the cached connection.

- **`src/lib/auth.js`** - Authentication utilities.
  - Secrets: read lazily per call via `getAccessSecret()` / `getRefreshSecret()` (throw the same "Missing JWT secret" error only when an auth op actually runs without env — since 2026-09-26, so `next build` succeeds without env configured); weak-secret warnings (<32 chars, reused across domains) fire once via `warnAboutWeakSecrets()`. Constants: `MAX_SESSIONS_PER_USER` (20), `REFRESH_TOKEN_TTL_MS` (30d), `REFRESH_ROTATION_GRACE_MS` (5 min).
  - `getAccessSecret()` / `getRefreshSecret()` - Lazy `process.env` readers; throw on missing secret, else call `warnAboutWeakSecrets()` and return the secret.
  - `warnAboutWeakSecrets()` - Once-per-process console warnings for short (<32 chars) or identical access/refresh secrets.
  - `hashToken(token)` - SHA-256 hex digest used to store/lookup refresh tokens.
  - `generateAccessToken(userId)` / `generateRefreshToken(userId)` (includes `jti`).
  - `verifyToken(token, secret)` - jsonwebtoken verify wrapper returning null on error.
  - `verifyAuth()` - Edge/server-component check via jose (root-page redirect only).
  - `verifySession()` - Full check for API routes: verifies access JWT, connects DB, confirms refresh token exists (by hash, legacy plaintext fallback; rotated entries still accepted — the 15m access token bounds exposure and rejecting here would false-trigger theft revocation). Returns `{user}` or `{user:null, error, status}` where status distinguishes definitive auth failures (401) from infrastructure trouble (503) — callers never turn a DB outage into a forced logout.
  - `purgeExpiredRefreshTokens(userId)` - Pulls entries older than TTL OR rotated-past-grace, then caps stored sessions at `MAX_SESSIONS_PER_USER` (20, oldest-first) so devices age out.

- **`src/lib/rate-limit.js`** - MongoDB-backed sliding-window limiter with **static imports** (`@/lib/mongodb`, `@/models/ratelimit.model`). `recordHit(key, windowMs)` (pushes timestamp, $slice-capped), `countRecentHits(key, windowMs)` (aggregate $filter count), `recordHitAndCount(key, windowMs, max)` (atomic record-then-count — closes the check-then-act race; returns `{allowed, count}`), `getClientIp(request)` (x-real-ip preferred, else LAST x-forwarded-for entry — first entries are client-spoofable), `popLastHit(key)` (refund quota), `resetKey(key)` (clear on success). Every helper **fails open** on DB errors so the limiter can never lock everyone out during an incident (safe: every guarded op also needs the DB, so fail-open grants nothing).

- **`src/lib/useDialogA11y.js`** *(new)* - Shared hook powering ALL modal overlays (AddTransactionDrawer, EditTransactionModal, BudgetManager): Escape-to-close, Tab/Shift+Tab focus trap inside the panel, body scroll lock + restore, initial focus to `[data-autofocus]` (else first focusable), and focus return to the previously focused element on close.

- **`src/lib/server-utils.js`** - `sendSuccess(data, status)` / `sendError(message, status)` JSON helpers.

- **`src/lib/utils.js`** - `formatCurrency` (en-IN for INR), `formatDate`, `formatDateForInput` (local getters), `MONTH_KEY_RE` + `isValidMonthKey` (strict calendar months — `2026-13` rejected), `utcMonthKey` (deterministic UTC fallback keys). Covered by unit tests.

- **`src/lib/api.js`** - Fetch wrapper with automatic token refresh. Exports: `processQueue(outcome)` (settles the single-flight queue), `refreshSingleFlight()` (one refresh call, serialized across tabs via Web Locks), default `api(url, options)` (at-most-once retry via `_authRetried`, single-flight queue, definitive-401 → `/login` redirect only). Contract:
  - Each request retries **at most once** after a refresh (`options._authRetried` guard) — a second 401 is handed back, never looped/deadlocked (regression-tested).
  - Concurrent 401s queue behind ONE in-flight refresh (`isRefreshing` + `failedQueue`).
  - Refreshes are serialized ACROSS tabs via Web Locks (`navigator.locks.request("fintrack-auth-refresh")`) where supported.
  - Only a definitive refresh rejection (HTTP 401) redirects to `/login`. Network errors and 5xx are transient: they reject the request with an error for the caller's inline UI — no forced logout during backend blips.

- **`src/lib/constants.js`** - Default expense/income category lists. Exports: `defaultExpenseCategories[]` (Food/Groceries/Transport/Bills/Housing/Entertainment/Health/Shopping/Other), `defaultIncomeCategories[]` (Salary/Bonus/Freelance/Investment/Other).

---

### Components (`/src/components/`)

- **`src/components/AddTransactionDrawer.js`** - Slide-in drawer ("use client").
  - `SegmentedControl()` - Animated Expense/Income pill.
  - `AddTransactionDrawer({...})` - Type switch resets selection via `handleTypeChange` (event-driven, no effect; switching to income also clears a stale one-time flag). Amount min 0.01 step 0.01; description maxLength 200; new-category maxLength 50. Category-load failures show an inline note (the required select would otherwise block submit silently). Category creation surfaces the server's message (e.g. 409 duplicate), then switches back to the dropdown with the new value preselected (prevents double-create retries). In-progress drafts persist to localStorage while open (sequenced after the open-time restore so blanks can't clobber), restored on open (`type` always restarts on expense so the category can't mismatch its list), cleared only on successful submit. Submits date as noon-local instant through `api()`. Error-body JSON parse guarded (`.catch(() => ({}))`). **Uses `useDialogA11y`**: Escape closes, focus trapped, scroll locked, `role="dialog"` + `aria-modal="true"`, amount autofocused.

- **`src/components/SimpleChart.js`** - Lazy-loaded Chart.js Pie (dashboard `cutout` forwarded → donut) with loading/error/empty states in theme colors (emerald/zinc/rose).

- **`src/components/BudgetProgress.js`** - Dashboard budget bars. Sends `start`+`end`+`month` (client-local window). **Load failures now render an explicit error card with a Retry button — the section never silently vanishes** (Retry resets visible state user-initiated, bumps fetch attempt). Color-coded progress (indigo/amber/red), overall + per-category sections, "(excl. X in one-time expenses)" note. Consumes `{ user }` from context.

- **`src/components/BudgetManager.js`** - Budget-setting drawer (month snapshotted on open via ref — a month flip mid-edit can't overwrite drafts). Exports: default `BudgetManager({ isOpen, onClose, onSaved })`; internal `getCurrentMonth()` (local `YYYY-MM` snapshot helper):
  - Form holds RAW input strings (never `parseFloat` on keystroke — NaN/0 used to masquerade as "cleared" and get deleted); Save validates first (0/negative/non-numeric → named inline error, never a silent delete).
  - Trash only clears the FIELD — server deletes happen exclusively on Save (matching the drawer's copy; stray clicks are no longer destructive). **Save deletes budgets whose fields were cleared** (clearing ≠ silently keeping the old limit); the snapshot drops cleared keys so a second Save can't re-DELETE into 404s.
  - Upserts run before any delete, per-category results naming failures; deletes only proceed when every upsert succeeded.
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
6. **Logout**: single-session `$pull` by hash (legacy raw accepted) with honest 500s on DB failure (cookies still cleared locally); logout-all empties the array honestly.
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
- **MongoDB-backed rate limiting**: shared across instances/restarts; record-then-count closes burst races; IP bucketing is spoof-resistant with the per-email bucket authoritative; fails open (provably safe — every guarded op needs the DB too).
- **Strict CSP**: nonce-per-request through the proxy; dynamic rendering required.
- **Timezone Handling**: noon-local instants stored as-is; clients send absolute month windows (`start`/`end`); server never applies its own offset. End-bounds keep future-dated transactions out of "current month".
- **Error Hygiene**: generic client messages; present-but-invalid input is a 400 (never a silent success or a masking fallback); validation feedback (400s) where input-specific; 503 for transient infra so clients don't log users out; honest 500s (logout) where the server state may not match the client's.
- **Server-side pagination**: transactions endpoint pages/filters server-side (max 200/page); client debounces search.
- **Tests**: Vitest unit suite covering utils, token hashing/generation roundtrip, and the api() refresh contract (incl. deadlock regression).

---

## iOS Mobile Application (`/ios/`)

The application is packaged as an iOS app using Capacitor (Swift Package Manager / Xcode):
- **`capacitor.config.ts`**: Configures the Capacitor iOS container:
  - Default URL: points to `https://fintrack.vistaenvision.com`.
  - Development override: supports `process.env.CAPACITOR_SERVER_URL` (e.g. `http://localhost:3000` or local Wi-Fi IP).
  - Background color: `#09090b` (eliminates white flashes on launch).
  - Native plugins: `@capacitor/status-bar` (styled dark `#09090b`), `@capacitor/haptics`.
- **`ios/App/App.xcodeproj`**: The native Xcode project for building and running on iOS simulators or connected physical iPhones (excluded derived-data/build artifacts are not inventoried).
- **`ios/App/App/AppDelegate.swift`**: Native iOS entry point initializing the Capacitor bridge and WKWebView (`application(_:didFinishLaunchingWithOptions:)`, background/foreground lifecycle stubs, `application(_:configurationForConnecting:options:)` wiring `SceneDelegate`).
- **`ios/App/App/SceneDelegate.swift`**: Scene lifecycle delegate for the Capacitor web view session.
- **`ios/App/App/Info.plist`**: Bundle config (reads `$(CAPACITOR_DEBUG)` flag).
- **`ios/App/CapApp-SPM/`**: Swift Package Manager wrapper (`Package.swift`, `Sources/CapApp-SPM/CapApp-SPM.swift`, `.gitignore`, `README.md`) for Capacitor plugins.
- **`ios/debug.xcconfig`**: `CAPACITOR_DEBUG = true` build setting. **`ios/.gitignore`**: iOS-local ignores.
- **Safe Area Insets**: Viewport configured with `viewportFit: "cover"` in `src/app/layout.js`, and `pt-safe` / `pb-safe` utilities defined in `src/app/globals.css` ensuring headers and drawers respect the iPhone notch and Dynamic Island.

---

## Environment Variables

Define all of these in a `.env.local` file at the project root.

| Variable | Purpose | Referenced In |
|----------|---------|---------------|
| `MONGODB_URI` | MongoDB connection string (database: `fintrack_db`) — also backs the rate-limit collection | `src/lib/mongodb.js` |
| `BREVO_API_KEY` | Brevo (Sendinblue) API key for sending OTP emails | `src/app/api/auth/otp/send/route.js` |
| `EMAIL_FROM` | Verified sender email for Brevo | `src/app/api/auth/otp/send/route.js` |
| `ACCESS_TOKEN_SECRET` | JWT secret for access tokens (15min expiry) | `src/lib/auth.js` (`getAccessSecret`) |
| `REFRESH_TOKEN_SECRET` | JWT secret for refresh tokens (30d expiry, rotated on use) | `src/lib/auth.js` (`getRefreshSecret`), `src/app/api/auth/refresh/route.js`, `src/app/api/auth/logout/route.js`, `src/app/api/auth/logout-all/route.js` (direct `verifyToken`/`jwt.verify` calls read `process.env` at request time) |
| `JWT_SECRET` | Reserved/unused — no `src/` references (grep 2026-09-26); kept in README template only | — |
| `NODE_ENV` | Environment mode (`development` adds `'unsafe-eval'` to CSP script-src; controls cookie `secure` flags; `SimpleChart` dev-only error detail) | `src/proxy.js`, auth routes (`refresh`, `otp/verify`), `src/components/SimpleChart.js` |
| `CAPACITOR_SERVER_URL` | (Optional) Overrides the target URL loaded by the iOS app (defaults to `https://fintrack.vistaenvision.com`) | `capacitor.config.ts` |

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
npm test        # vitest — runs ALL 223 tests in one go via test/run-all.test.js
npm run lint    # eslint . (clean)
```
