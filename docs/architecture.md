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
| `/docs/audit.md` | Audit status (2026-08-22 cycles closed; 2026-09-28 security/correctness/UI pass fixed and tested; standing verification + intentional-behavior notes) |
| `/docs/suggestions.md` | Suggestions / improvement / vulnerability log (dated entries under 🔴 Vulnerabilities / 🟢 Improvements / 🟡 New Features) |
| `/docs/to-do.md` | Session handoff: the two one-off data migrations (order + exact commands), post-deploy verification, ops backlog |
| `/AGENTS.md` | Repo-local AI behavior + architecture-docs conventions (mirrors global rules; PermissionGate standard) |
| `/passkey-integration-plan.md` | Design-only plan for future WebAuthn/passkey login (proposes `RP_NAME`/`RP_ID`/`ORIGIN`, new routes, user-model `passkeys` array — NOT implemented, no src references) |
| `/package-lock.json` | Locked dependency tree (npm install reproducibility) |
| `/.gitignore` | Git ignores (node_modules, .next, env files, orphan-tx backup JSONs) |
| `/.gitattributes` | Git attributes (line-ending / diff config) |
| `/public/file.svg`, `/public/globe.svg` | Static Next.js template SVGs (no code references; matcher excludes `.*\.[^/]+$` so proxy skips them) |
| `/src/app/favicon.ico` | App favicon (excluded from proxy matcher) |
| `/src/app/a.svg` | Static SVG asset served from the app dir (excluded from proxy matcher by extension rule) |

### One-off Migration Scripts (`/scripts/`)

Both are dry-run by default, write only with `--apply`, read `MONGODB_URI` from the environment, and stream with a cursor + `bulkWrite` in batches of 500 (no full-collection load, no per-document round trip).

| File | Purpose |
|------|---------|
| `/scripts/migrate-legacy-dates.mjs` | Shifts every transaction stored at UTC midnight `+12h` so the calendar date renders the same worldwide. Filter is a `$gte/$lt` range in the QUERY. |
| `/scripts/migrate-amount-minor.mjs` | Backfills integer `amountMinor` (minor units × 100) from the legacy float `amount` and rounds `amount` to 2dp. **Idempotent**: the filter only matches documents where `amountMinor` is missing/null, so re-running is a no-op. Non-numeric amounts are skipped and reported. |

Run order and post-deploy checks: `docs/to-do.md`.

### Test Suite (`/test/`)

`npm test` executes ONE vitest entry (`test/run-all.test.js`) which imports every suite below — the whole site's tests run in one go.

| File | Covers |
|------|--------|
| `/test/run-all.test.js` | Single entry: sets test env vars, registers ALL shared module mocks (delegating factories → `globalThis.*`), imports every suite |
| `/test/helpers/setup.js` | Stable globalThis mock singletons (models registry, dbConnect, cookies store, api mock, router, Brevo client) + DOM stubs (ResizeObserver/matchMedia) + a `globalThis.Uint8Array` realm fix so `jose`'s `instanceof Uint8Array` guard works under jsdom |
| `/test/helpers/mocks.js` | `makeQueryBuilder()` chainable awaitable stub; `makeModel()` constructable mongoose-model-shaped mock with spied statics; registry factory (transaction/category/budget/user/rateLimit/recurring) |
| `/test/suites/utils.suite.js` | `lib/utils`: formatCurrency USD/INR/null/negative, formatDate, formatDateForInput local parts/padding/rejections, isValidMonthKey (rejects 2026-13/00), utcMonthKey determinism |
| `/test/suites/auth-lib.suite.js` | `lib/auth`: hashToken SHA-256 properties, access/refresh token roundtrip (+jti), verifyToken garbage→null, purgeExpiredRefreshTokens $pull cutoffs + 20-session cap (oldest-first, skipped under limit), REAL verifySession branches (missing tokens 401, bad access 401 w/o DB, success via hash + legacy-plaintext $or arms, revoked 401, transient DB 503) |
| `/test/suites/api-client.suite.js` | `lib/api` refresh contract: pass-through, retry-once, transient 500/network ≠ logout, definitive 401 → /login, deadlock regression (retried 401 returned not hung), concurrent single-flight queue |
| `/test/suites/server-utils.suite.js` | sendSuccess/sendError shapes + statuses |
| `/test/suites/rate-limit.suite.js` | recordHit $push/$slice/expiry, countRecentHits pipeline shape + cutoff, popLastHit $pop, resetKey deleteOne, FAILS OPEN on DB errors, **getClientIp prefers `request.ip` and never trusts a client header (x-real-ip preference deleted; a rotated x-real-ip cannot reset the bucket)**, recordHitAndCount allow/deny/fail-open |
| `/test/suites/dialog-a11y.suite.jsx` | `useDialogA11y`: scroll lock/restore, focus-in ([data-autofocus]) + focus restore, Escape closes once, Tab/Shift+Tab wrap, inert when closed |
| `/test/suites/proxy.suite.js` | Real signed session JWTs: authed /login→dashboard, anon protected→login, /welcome never bounced, **fails CLOSED on forged/garbage/wrong-key/expired/`alg:none` cookies**, **valid session passes all protected pages**, **/api-docs + /apifoo + /apix/../dashboard + /login-x are NOT public**, exact-path + subtree publics still work, per-request CSP nonce, dev unsafe-eval vs prod, API passthrough, matcher exclusions |
| `/test/suites/models.suite.js` | Real schemas via importActual: Transaction validators (incl. **non-finite rejection, positive-integer `amountMinor`, currency default/enum**), **unique sparse (recurringRuleId, scheduledFor) index**, virtual/indexes/exclude default; Category required/unique index/cap/enum; Budget month regex/amount≥1/unique index; OTP compare contract |
| `/test/suites/api-auth.suite.js` | otp/send (validation, malformed JSON 400, atomic record-then-count email+IP windows, HTML+TEXT email U5, lowercase new users, E11000 race retry, Brevo failure → restore+refund+500, **logs never contain the raw Axios error object or the OTP**); otp/verify (malformed JSON 400 M2, missing fields, lockout 429 on over-max counts, uniform failures incl. expired/wrong/no-pending, success clears OTP + hashed refresh push + cookie issue + resets BOTH email and IP quotas, isNewUser B3 matrix); refresh (no-cookie 401 no-DB, garbage clears cookies, revoked 401, ACTIVE conditional rotation via arrayFilters + race-loser grace test, grace-window access-only, past-grace revoke-all, DB-outage 500 keeps cookies); logout ($pull hash+raw, **200 + `revoked:false` + `SERVER_REVOKE_FAILED` on DB failure**, `revoked:true` happy path, cookies always cleared incl. DB error); logout-all (401s, empties array, **200 + `revoked:false` + `SERVER_REVOKE_ALL_FAILED`**, `revoked:true` happy path) |
| `/test/suites/api-user.suite.js` | GET (sans secrets, 404, 503 passthrough); PUT (60-char cap, currency 400, empty-body 400, B3 auto-onboard on name save, explicit onboarded flag, never revocable, trim, combined update, 404, **literal `null` and array bodies → 400 not 500**) |
| `/test/suites/api-transactions.suite.js` | GET pagination/clamps/type/category/search regex-escaping/date bounds/present-but-invalid from/to → 400/status passthrough; POST validations incl. malformed JSON + non-string description 400, as-sent noon instant persistence, excludeFromBudget coercion, ValidationError→400, **`"Infinity"`/`"-Infinity"`/`"1e400"`/`"NaN"`/overflow → 400 with nothing persisted**, decimal string coerced to a Number with `amountMinor`, **null and array bodies → 400**; [id] ObjectId guards, PUT strict 400s for present-but-invalid fields incl. non-finite amounts, **amount/amountMinor stay in sync**, omitted absent fields, owner-scoped 404, DB ValidationError→400, **null body → 400**, DELETE 404/200 |
| `/test/suites/api-categories.suite.js` | GET merge/dedupe/allCustom; POST required/enum-validated type/cap/409/malformed-JSON/create-scoped/DB-outage 500, **reserved-name rejection (incl. whitespace-padded)**, ordinary names containing a reserved word still allowed, **null body → 400**; PUT rename (ObjectId 404 pre-DB, JSON guard, no-op fast path, budget-collision 409 pre-check, cascade old→new to transactions+budgets, duplicate→409 without cascade, full revert incl. tx/budget re-point on cascade failure, name validation, **reserved-name rejection before any cascade write**, null body → 400); DELETE reassign Other + budget cleanup + best-effort doc restore + 404-no-side-effects |
| `/test/suites/api-budgets.suite.js` | GET month default (UTC)/verbatim; POST M4 strict guards (missing fields, strict YYYY-MM incl. impossible months, malformed JSON 400, non-finite/sub-1 amounts, numeric-string coercion → `amount` + `amountMinor`, trimmed category, 50-char cap, dup→409, DB-outage 500, **non-finite/overflow rejection**); DELETE required param/trimmed match/strict month/404-when-absent/owner scope |
| `/test/suites/api-reports.suite.js` | dashboard aggregates over **integer minor units** with $gte/$lt client bounds + present-but-invalid start/end → 400 + balance math + server-month fallback + zero-fill + **`0.1 + 0.2` drift-free** + sums never touch the raw float + **throttled recurring materialization (runs, skips inside the window, dashboard survives a failure)**; budget-progress overall/category blend, strict monthKey, month-derived-from-window, capped percentage, overBudget flags, excluded spend, **`constructor` reports $0, `__proto__` keeps its spending, a legit $0 spend is 0**; generate instants preferred (invalid instant → 400), 3-year range cap, reversed-range 400, summary math, sorted breakdowns, **0.1+0.2 exactly 0.3 (and for legacy float-only rows)**, **`__proto__`/`constructor` categories reported**, **null body → 400** |
| `/test/suites/recurring.suite.js` | `lib/money` helpers (coerceAmount rejects every non-finite/overflow form, decimal-string coercion, **0.1+0.2 === 0.3 in minor units**, rounding, `AMOUNT_MINOR_EXPR` shape, reserved names); `advanceRuleDate` weekly/monthly; `firstRunDate`; **TZ-parameterized date math** (the real module source is evaluated in child processes under `America/Los_Angeles`, `Asia/Kolkata`, `Pacific/Kiritimati`, `UTC` and must produce identical UTC instants); `materializeDueRules` atomic-claim filter/assertions, distinct `scheduledFor` per occurrence, **a second concurrent call inserts nothing**, **a null claim inserts nothing**, **E11000 treated as "already materialized"**, non-duplicate insert errors re-thrown, 12-run cap, nothing-due no-op; recurring routes (auth gate, list, body validation incl. non-finite amounts, minor-unit storage, null-body 400, create, 404s, bad-amount 400, null-body 400); export `sanitizeCsvCell`/`toCsvRow` (**`x\r=1+1` cannot produce a second row**, all CR/LF forms collapse, quoting of `,`/`"`/plain values, formula prefixes `= + - @`) and the CSV route (auth gate, minor-unit happy path, one line per row for CR-bearing descriptions, bad-bounds 400) |
| `/test/suites/budget-components.suite.jsx` | BudgetProgress success bars/exclusion note, error banner + Retry recovery (B1), null when nothing to show; BudgetManager prefilled inputs, load-error banner + Retry hiding save (B2), Escape close (U2), dialog semantics (U3), clear-on-save deletes budgets server-side |
| `/test/suites/overlay-components.suite.jsx` | AddTransactionDrawer dialog semantics + autofocus, Escape close, type-switch category reset guard, add-new-category reveal (50-cap), noon-local submit payload, category-load error note, interrupted-draft restore on reopen; EditTransactionModal semantics, category-load modalError, type-switch keeps shared names, modalError inline on save failure, sends ONLY editable fields |
| `/test/suites/page-components.suite.jsx` | ProfileDropdown two-step logout confirm + cancel (U1) and **logout failure handling (`200 revoked:false` warns + navigates, non-ok and thrown failures do NOT navigate, login page renders + clears the stashed warning)**; **MainLayout MobileDrawer dialog semantics + scroll lock + Escape**; WelcomePage skip PUTs onboarded + replace-navigates, save completes onboarding in one call, inline server errors (B3); LoginPage 30s resend cooldown/auto-submit at 6 digits/different-email reset; TransactionsPage page-clamp after deleting last row of page 2 (B4), **entire filter bar is label-paired**, **a failed post-save refetch raises a banner**, **EditTransactionModal label pairing + `role="group"` type toggle**; **ReportsPage Export CSV button (wires `/api/reports/export`, surfaces failures) and RecurringManager (list, labelled form, create via POST)**; MainLayout desktop navigation + mobile drawer default state |

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
  - `hasValidSession(token)` - Verifies the refresh-cookie JWT with `jwtVerify(token, key, { algorithms: ["HS256"] })` against `REFRESH_TOKEN_SECRET`. **Fails CLOSED** on a missing secret, a malformed token, a bad signature, an expired token or an unexpected algorithm. The previous gate only checked that a `refreshToken` cookie was PRESENT, which made this the one default-allow page guard (`refreshToken=anything` rendered `/dashboard`, `/transactions`, `/profile`). No data leaked — every API route independently calls `verifySession()` — but the page shell was reachable.
  - `isPublicPath(pathname)` - Matches a public path EXACTLY or on a path-segment boundary (`pathname === p || pathname.startsWith(p + "/")`). The old `startsWith(p)` made `/api-docs`, `/apifoo`, `/apix/../dashboard` and `/login-x` public.
  - `PUBLIC_PATHS` - `["/login", "/api"]` only. **`/welcome` is deliberately in NEITHER list** — new users arrive there with fresh cookies after OTP verify and must NOT be bounced; anonymous visitors are redirected to `/login` by the protected-path check.
  - `proxy()` - Auth routing: verified sessions hitting `/login` → `/dashboard`; unauthenticated non-public pages → `/login`. `/api/*` requests pass through untouched (routes self-auth). Page requests get a per-request CSP nonce: sets `x-nonce` + `Content-Security-Policy` on the REQUEST headers (so Next stamps the nonce onto its own scripts) and on the response. Config matcher: all paths except `_next/static`, `_next/image`, `favicon.ico`, any path with a file extension.
  - `config` - Exported matcher (`/((?!_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)`) so static assets and files with extensions skip the proxy.

> Deployment note: the proxy reads `REFRESH_TOKEN_SECRET` from `process.env`, so that variable must be present in the **build** environment. Without it the proxy fails closed (everyone is redirected to `/login`) — see `docs/to-do.md`.

---

### Auth Module (`/src/app/(auth)/`)

- **`src/app/(auth)/login/page.js`** - Login page with OTP flow ("use client").
  - `LoginPage()` - Two-step form: Step 1 collects email, calls `/api/auth/otp/send` (surfaces the server's specific error messages, e.g. rate-limit). Step 2 collects OTP (numeric input, `autoComplete="one-time-code"`) with single-flight auto-submit at 6 digits (ref guard — fast typing/paste can't double-verify), a **Resend code button with a 30s cooldown**, and "Use a different email". On success, replace-navigates based on `isNewUser` (new → `/welcome`, returning → `/dashboard`; replace so Back never returns to OTP). Auto-redirects on mount if already authenticated — the mount check calls `/api/user` and on a 401 attempts ONE silent `/api/auth/refresh` before re-checking, so users with a live refresh cookie are sent to `/dashboard` instead of being shown the OTP form. State: `email`, `otp`, `step`, `loading`, `error`, `checkingSession`, `resendIn`, `warning`. A mount effect drains `sessionStorage["fintrack:logoutWarning"]` (set by `ProfileDropdown` when a logout's server-side revoke failed), renders it once as a `role="status"` amber banner and removes the key. Uses raw `fetch()` deliberately — the `api()` wrapper's failed-refresh redirect to `/login` would loop on this page.

- **`src/app/(auth)/welcome/page.js`** - Welcome/onboarding page for new users ("use client").
  - `WelcomePage()` - Collects `accountName` (maxLength 60, trimmed, blank rejected inline) via form, submits to `PUT /api/user` with `{ accountName, onboarded: true }`. Includes a **Skip for now** button that PUTs `{ onboarded: true }` first (so skipped users are never re-prompted) then replace-navigates to `/dashboard` — a failed skip surfaces an inline error and does NOT navigate (avoids the re-prompt loop). State: `accountName`, `loading`, `skipping`, `error`.

---

### Main App Module (`/src/app/(main)/`)

- **`src/app/(main)/layout.js`** - Main app shell with desktop sidebar, mobile drawer, header, and user context ("use client").
  - `UserContext` - React Context exporting `{ user, setUser }`. Pages call `setUser` (e.g. profile save) so currency/name changes propagate app-wide without a reload.
  - `SidebarContent()` - Shared navigation list (Dashboard/Transactions/Reports/Categories), active-route highlight, FinTrack branding, and smart tracking badge. On mobile, triggers close on link click and renders the 'X' dismiss button.
  - `DesktopSidebar()` - Static permanent sidebar for desktop browser (`hidden lg:flex`). Normal desktop flow, always visible, zero drag/motion transforms or swipe listeners.
  - `MobileDrawer()` - Mobile drawer overlay (`lg:hidden`) with safe area insets (`pt-safe pb-safe`), animated via Framer Motion, backdrop blur dimming. Closed by default when opening the app on a phone (`isMobileOpen = false`). Supports swipe-left/drag gesture to dismiss. **Wired to `useDialogA11y`** (`panelRef` on the `motion.aside`, which carries `role="dialog"`, `aria-modal="true"`, `aria-label="Navigation"`) so the primary mobile navigation gets Escape-to-close, focus move-in/restore, body scroll lock and a Tab trap — previously it had none of them.
  - `ProfileDropdown()` - User menu with Profile link and **two-step logout confirmation** (Logout → "Log out of FinTrack on this device?" → Yes/Cancel — a stray click can no longer log the user out). Closes on outside click and Escape; button has `aria-haspopup`/`aria-expanded`; items carry `role="menu"/"menuitem"`. Shows `user.accountName`; confirmed logout calls `POST /api/auth/logout`. **`handleLogout()` checks `res.ok`** (the `api()` wrapper only rejects on refresh failure, so a non-ok response resolves and the old code discarded the failure while navigating away anyway): a non-ok response or a thrown error shows an inline `role="status"` warning and does NOT navigate; a `200 { revoked: false }` (server-side revoke failed) stashes the warning in `sessionStorage["fintrack:logoutWarning"]` — which the login page renders once — and then navigates. `warnAfterLogout()` writes that key.
  - `MainLayout()` - Fetches user via `GET /api/user`. On transient failure shows an inline **retry card with a "Go to login" escape hatch** (so a revoked-but-unclassified session can't trap the user in a reload loop) instead of redirecting. Uses a locked viewport (`fixed inset-0 h-[100dvh] w-full`); safe-area padding; isolated content scrolling (`overscroll-y-contain lg:overscroll-y-auto`); and edge-swipe gesture handler from the left boundary to open the drawer on mobile phones only. Desktop browser header and layout remain completely normal. Route changes close the mobile drawer (ref+effect, never setState-in-render). No blanket header `preventDefault` — scroll gestures starting on the header must work.

- **`src/app/(main)/dashboard/page.js`** - Dashboard page ("use client").
  - `generateSliceColors(count)` - Curated palette plus golden-angle HSL fallback so any number of pie slices gets a distinct color.
  - `StatCard()`, `DashboardSkeleton()` - Reusable stat card and loading skeleton.
  - `DashboardPage()` - Single `fetchData()` (useCallback, seq-guarded so only the latest fetch writes state) computes the client-local month window **per call**; mount effect fetches AND re-fetches on `visibilitychange` when the tab becomes visible (throttled to ≥30s since the last success; a tab left open across a month boundary self-corrects). Refetch failures NEVER wipe good data — the last snapshot stays visible with an amber retry banner; only a failed first load shows the error wall. Adding a transaction reloads via skeleton **without nulling data first**. Pie chart via `SimpleChart`. Recent list is labeled "N recent" (slice of 5, not a total).

- **`src/app/(main)/transactions/page.js`** - Transactions page ("use client"). **Server-side filtered + paginated.**
  - `EditTransactionModal()` (exported for tests) - Edit modal wired to the shared `useDialogA11y` hook (Escape, focus trap, scroll lock, `role="dialog"` + `aria-modal`, labelled close button), amount field has `data-autofocus`. **Every field is label-paired** (`edit-tx-amount`, `edit-tx-category`, `edit-tx-date`, `edit-tx-description`, `edit-tx-new-category`, `edit-tx-exclude`) and the type toggle is `role="group" aria-label="Transaction type"` with `aria-pressed` on each button. Category select or create (server error messages surfaced; category-load failure shows a modalError instead of a stuck required select; caps: name ≤50, description ≤200, amount min 0.01), type-switch keeps the category when the name exists in the other type's list, date normalized to local `YYYY-MM-DD` and saved as noon-local instant. Save calls `onSave(...)` which returns `{ ok } | { ok:false, message }` — failures render INSIDE the modal (`modalError`) since page banners would be hidden behind the overlay.
  - `TransactionCard()` - Mobile card for one transaction with inline confirm-once delete.
  - `TransactionsPage()` - State: `transactions`, `pageInfo {page,totalPages,total}`, `page`, `filters`, debounced `debouncedSearch` (300ms), `categoryOptions` (fetched from `/api/categories`; the merged expense+income lists are **deduped via Set** because "Other" is a default in both types — duplicate names collided as React `<option>` keys; refreshed after every successful edit since inline creates add names). Fetches `GET /api/transactions?page=&limit=&search=&type=&category=&from=&to=` (from/to are local instants; malformed date inputs are skipped, never crashing render). **The whole filter bar is label-paired** (`tx-filter-search` + `sr-only` label, `tx-filter-type`, `tx-filter-category`, and `aria-label` on both date inputs, which previously had only a `title`). Filter updates snap back to page 1 (`updateFilter`) and show a subtle "Updating…" indicator while the stale list stays readable. **Deleting the only row on a page > 1 clamps back to the previous page** instead of stranding an empty page, and ANY refetch whose result set shrank below the current page clamps down too. Saving an edit whose new values fall outside the active filters shows a sky-blue "Saved — no longer matches your filters" notice with Clear-filters (rows moving out of view are never silent). `refetchCurrentPage()` (run after every successful save/delete) ends in `.catch(() => setError("Your change was saved, but the list couldn't be refreshed."))` — it previously ended in `.catch(console.error)`, so a failed refresh set no banner and the user kept looking at the pre-edit list. PUT failures surface the server's `message`/`error` via `onSave` → modal. Desktop table (with Description column) / mobile cards; result count + Prev/Next pagination when `totalPages > 1`; empty-states distinguish "no transactions" vs "no filter matches".

- **`src/app/(main)/reports/page.js`** - Reports page ("use client").
  - `ReportsPage()` - Validates dates before submit (both present, start ≤ end) with friendly inline errors; sends raw strings + absolute `startInstant`/`endInstant` (browser-timezone). The previous report stays visible while the next generates (no "No Report Generated Yet" flash; failures preserve it) and the response shape is validated before render (malformed 200s → inline error, never a crash). Empty-state CTA reads "Generate Report" (it generates for the selected dates). Summary cards + Bar chart + income list. Currency via `UserContext`. **`exportCsv()`** (2026-09-28) downloads `/api/reports/export` for the selected window via a blob + object URL; `exporting` / `exportError` state so a failed export shows an inline `role="alert"` instead of failing silently. The endpoint previously had ZERO `src/` callers. Also renders `<RecurringManager />`.

- **`src/components/RecurringManager.js`** *(new, 2026-09-28)* - Management surface for recurring rules, so the tested `/api/recurring` CRUD and the 12-run catch-up engine are actually reachable from the product.
  - `load()` - `GET /api/recurring`; failures render a retry-able error banner instead of an empty list.
  - `handleCreate(e)` - `POST /api/recurring`; validates the amount with `Number.isFinite` and requires a category before submitting; success reloads and shows a "will appear on your next dashboard load" status.
  - `handleToggle(rule)` - `PATCH /api/recurring/[id]` with `{ active: !rule.active }` (pause/resume).
  - `handleDelete(rule)` - `DELETE /api/recurring/[id]`; already-materialized Transactions are kept (server behavior) and the status says so.
  - `options` / `defaults` / `categoryOptions` - Category list follows the selected type, falling back to the built-in defaults.

- **`src/app/(main)/categories/page.js`** - Categories management ("use client").
  - `CategoriesPage()` - Lists custom categories with All/Expense/Income tabs, add form (maxLength 50, **name/type label-paired** via `new-category-name` / `new-category-type`), inline confirm-once delete, and an **inline rename UI** (pencil → input, Enter/Esc shortcuts) calling `PUT /api/categories/[id]`. Single `fetchCategories()` used by both the mount effect and the Retry button. Fetch failure renders an explicit error banner with Retry — never a misleading empty state. "Matches default" badge retained.

- **`src/app/(main)/profile/page.js`** - Profile settings ("use client").
  - `ProfilePage()` - Reads `{ user, setUser }` from context and seeds the form FROM context (never blank defaults); refreshes from server on mount. Save is DISABLED until a successful load (`ready`) and the name is trimmed + blank-rejected — a failed fetch can never lead to a blank-overwrite save. A load failure shows an amber banner with Reload. Save propagates via `setUser((prev) => ({...prev, …}))`. accountName maxLength 60. Currency select falls back to displaying an out-of-list stored value rather than a blank selection. Security section: two-step inline confirm "Log Out From All Devices" → `handleLogoutAll()` **checks `res.ok` and `data.revoked`** (it previously navigated with `window.location.href = "/login"` unconditionally, discarding the honest failure) and renders a `status` banner instead when the revoke failed or the request threw.

- Error boundaries (recoverable cards with Try again + console.error logging):
  - `src/app/error.js` - `RootError({ error, reset })` — root-segment boundary (root layout itself needs `global-error.js`, intentionally not used).
  - `src/app/(main)/error.js` - `MainError({ error, reset })` — main-shell segment boundary so a (main) page crash shows a recoverable screen instead of a white page.

---

### API Routes

#### Auth API

- **`src/app/api/auth/otp/send/route.js`** - Sends OTP via Brevo (HTML **and** plain-text `textContent` parts for deliverability).
  - Rate limiting is **MongoDB-backed record-then-count** (via `src/lib/rate-limit.js`): per-email 5/hour AND per-IP 20/hour (stops OTP-bombing many addresses). Recording BEFORE the decision closes the check-then-act race; slots are **refunded** if the email send fails. IP bucketing uses the shared spoof-resistant `getClientIp` (see `src/lib/rate-limit.js` — `request.ip` then the LAST x-forwarded-for entry; the per-email bucket stays authoritative).
  - `POST` - Malformed JSON is a controlled 400; validates email; checks both limits (429 uniform message); generates 6-digit CSPRNG OTP (`crypto.randomInt`), 10-min expiry, bcrypt-hashed via model hook. Preserves the previous pending OTP and restores it if the Brevo send throws. Handles the concurrent-signup unique-index race by refetching and retrying. Generic client errors only. **Logging (2026-09-28): the catch logs `error.message` + a `randomUUID()` request id and NEVER the raw object** — the Brevo SDK is Axios-based and Axios errors carry `config.data`, i.e. the serialized `SendSmtpEmail` holding the live 6-digit code in both `htmlContent` and `textContent`; logging the object pushed a working OTP into the log sink on every Brevo failure. IP bucketing uses the shared spoof-resistant `getClientIp`.

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

- **`src/app/api/auth/logout/route.js`** - Removes this session's token from the DB by `$pull` matching `[hash, rawToken]` (raw kept for pre-hashing legacy sessions). **Response contract (2026-09-28):** cookies are ALWAYS cleared, so a `500` would contradict the client's own state and leave the shell unusable — the DB-failure path returns `200 { revoked: false, code: "SERVER_REVOKE_FAILED", message }` and the happy path `200 { revoked: true }`. `ProfileDropdown` checks both.

- **`src/app/api/auth/logout-all/route.js`** - Empties `refreshTokens[]`; **same response contract as `/api/auth/logout`** (`200 { revoked: false, code: "SERVER_REVOKE_ALL_FAILED" }` on DB failure, cookies cleared in `finally`). `ProfilePage.handleLogoutAll()` checks `res.ok` / `data.revoked` before navigating.

#### User API

- **`src/app/api/user/route.js`**
  - `GET` - Authenticated user data (`verifySession()`), excludes secrets.
  - `PUT` - Accepts `{ accountName, currency, onboarded }`; validates accountName (string, trimmed, ≤60) AND currency (must be USD/INR → otherwise 400). Setting a non-empty `accountName` **auto-completes onboarding**, and an explicit `onboarded: true` is accepted (welcome Skip path) — the flag can never be revoked. `$set`-only update. A literal `null` body (`await req.json()` resolves to `null` WITHOUT throwing) returns **400**, not a TypeError 500.

#### Transactions API

- **`src/app/api/transactions/route.js`**
  - `escapeRegex(value)` - Escapes user input for `$regex`.
  - `parseInstant(value)` - Safe date parsing.
  - `GET` - **Server-side filtered + paginated**: `page` (default 1), `limit` (default 50, max 200), optional `type`, `category`, `search` (regex over description+category), `from`/`to` instants. Present-but-unparseable `from`/`to` are 400s (never silent unfiltering). Returns `{ transactions, total, page, pageSize, totalPages }` sorted date desc, createdAt desc.
  - `POST` - Strict validation (type/amount/category/date; malformed JSON, non-object and array bodies → 400; non-string description → 400); stores client-sent noon-local instant as-is; persists `excludeFromBudget` deterministically. **Amount is coerced with `coerceAmount()`** (`Number.isFinite` + `> 0` + `≤ MAX_AMOUNT`) — the old `if (!amount || isNaN(amount) || amount <= 0)` ACCEPTED the strings `"Infinity"` and `"1e400"` (`isNaN("Infinity") === false`, `"Infinity" <= 0 === false`), and one such row made `currentBalance`, `monthlyIncome/Expenses`, the balance aggregation and every budget rollup `±Infinity` for that user **permanently**. Persists `amount`, `amountMinor` and `currency`.

- **`src/app/api/transactions/[id]/route.js`**
  - GET/PUT/DELETE scoped to owner via `findOne…({ _id, userId })`. Malformed ObjectIds now return **404** (`mongoose.isValidObjectId` guard) instead of cast-error 500s. PUT is strictly validated: present-but-invalid type/amount/category/date/description are **400s** (the old silent-drop returned 200 while changing nothing); absent fields are omitted; `excludeFromBudget` spread on `!== undefined` so clearing persists. A changed `amount` also rewrites `amountMinor` so the two can never disagree. A literal `null` body returns **400** (not a TypeError 500).

#### Categories API

- **`src/app/api/categories/route.js`**
  - `GET` - Defaults + custom merged per type, plus `allCustom` with `_id`s.
  - `POST` - Requires name (trimmed, ≤50 chars) + type (`expense`|`income` enum → 400 otherwise); malformed JSON / non-object / array body → 400; duplicate → 409; infrastructure failures → 500 (never 400); `dbConnect` inside try. **Rejects RESERVED names** (`__proto__`, `constructor`, `prototype`, `toString`, `valueOf`, `hasOwnProperty`, … see `RESERVED_CATEGORY_NAMES` in `src/lib/money.js`) with 400 — reports key their spending maps by category name, so these names silently corrupted or dropped financial data.

- **`src/app/api/categories/[id]/route.js`**
  - `PUT` - **Rename with cascade, atomic where possible**: malformed JSON / non-object / array body → 400. **Rejects reserved names** before any cascade write. A budget-collision pre-check rejects renames whose target name already owns budgets (409 — budgets are typeless, so the cascade would duplicate-key mid-flight). Otherwise category doc rename + `Transaction.updateMany` + `Budget.updateMany` run inside a Mongo **transaction** when the deployment supports one (replica set / Atlas). On standalone instances it falls back to sequential writes with **full best-effort rollback** (transactions + budgets re-pointed AND the old name restored), so a mid-cascade error can no longer split-brain the data. Duplicate → 409; no-op fast path when the name is unchanged. ObjectId guard → 404.
  - `DELETE` - Deletes category, reassigns its transactions to default "Other", and **deletes budgets for that name**. Cascade failures best-effort RESTORE the category doc (same `_id`) so rows never reference a missing category and retries stay possible. ObjectId guard → 404.

#### Budgets API

- **`src/app/api/budgets/route.js`** - Month-scoped CRUD (`?month=YYYY-MM`, strictly validated — impossible months like `2026-13` are 400). GET falls back to the UTC current month (never server-local parts). POST validates strictly: category non-empty string ≤50, amount coerced by the local `coerceBudgetAmount()` (finite, ≥1, ≤ `MAX_AMOUNT` — `Number.isFinite` is what rejects `"Infinity"` / `"1e400"`, which would otherwise permanently break the progress math) and also stores `amountMinor`; malformed JSON → 400; infrastructure failures → 500 (never 400). DELETE trims the category (matching POST-trimmed storage), validates month, and 404s when nothing was deleted instead of reporting false success. All three handlers run `dbConnect` inside their try blocks.

#### Reports API

- **`src/app/api/reports/dashboard/route.js`** - Aggregations accept `start` AND `end` instants (client-local month bounds; falls back to server-computed month). Present-but-unparseable bounds are 400s. Every monthly aggregation matches `$gte start, $lt end` — future-dated transactions can't inflate current month. **All `$sum`s run over `AMOUNT_MINOR_EXPR` (integer minor units) and the decimal conversion happens once at the response boundary**, so `0.1 + 0.2` can never reach a payload as `0.30000000000000004`. Balance = all-time income − expenses; recent 5 transactions. Calls `maybeMaterializeRecurring(user._id)` (2026-09-28) before aggregating.

  - `RECURRING_THROTTLE_MS` - 60 000 ms minimum gap between materialization passes per user.
  - `maybeMaterializeRecurring(userId)` - Best-effort, throttled recurring materialization driven by NORMAL APP USE (it previously only ran inside OTP verify, so a user with a live 30-day refresh session never got recurring transactions). Uses the existing `RateLimit` collection as a per-user cooldown (`recurring-materialize:<userId>`, `countRecentHits` then `recordHit`) so idling on the dashboard doesn't re-scan rules on every request, and reuses `materializeDueRules`' atomic claim so it stays idempotent. Every failure is swallowed — a recurring hiccup must never break the dashboard. Losing the race is harmless (an extra pass inserts nothing extra).

- **`src/app/api/reports/budget-progress/route.js`** - Same start/end windowing (present-but-invalid → 400). Budgets always come from the SAME month as the spending window: explicit `month` wins (strictly validated, 400 on garbage/impossible), otherwise derived from the window start (UTC), otherwise UTC now. Spending aggregation excludes `excludeFromBudget`; separate aggregation sums excluded spend for transparency. **Prototype-pollution hardening (2026-09-28):** `spendingMap` is `Object.create(null)` and lookups use `Object.hasOwn` (not `||`, so a legitimate `$0` spend is reported as 0), because a category named `constructor` made `spendingMap[budget.category] || 0` resolve to the `Object` constructor (`spent: <function>`, `percentage: null`, `remaining: NaN`) and `__proto__` silently dropped the category's spend. All spend/percentage/remaining math is integer minor units via `fromMinorUnits` / `toMinorUnits`. Returns `{ overall, progress, totalSpent, excludedSpent }`.

- **`src/app/api/reports/generate/route.js`** - Prefers browser-timezone `startInstant`/`endInstant` (present-but-invalid → 400); validates formats (400) and rejects reversed ranges (400) and ranges over 3 years (400 — unbounded windows load full history into memory). A literal `null` body returns **400** (not a TypeError 500). Sums run over **integer minor units** and convert once; the expense/income accumulators are `Object.create(null)` and use `Object.hasOwn`, because `acc["__proto__"] = …` on a plain `{}` was a silent no-op — that category's spending **disappeared from a financial report** entirely. `minorOf(t)` tolerates legacy rows that only have the float `amount`. Summary + expense/income breakdowns sorted desc.

- **`src/app/api/reports/export/route.js`** (2026-09-26) - CSV download of transactions with optional `start`/`end`/`type` filters (invalid bounds → 400). `MAX_ROWS` 10000 cap with `X-Export-Truncated` header; `no-store` cache; amount rendered from `amountMinor` via `fromMinorUnits().toFixed(2)` (plus a `currency` column). `sanitizeCsvCell()` collapses `[\r\n]+` to spaces BEFORE the formula guard, so **no cell value can produce a second row** — the old version left a BARE `CR` in place, didn't quote on `/[",\r\n]/` and only prefixed a leading CR, so a description of `x\r=1+1` exported unquoted and Excel split it into a second row whose first cell `=1+1` EXECUTED. `toCsvRow()` quotes on `/[",\r\n]/`. Exported (userId-scoped) by design.

- **`src/app/api/recurring/route.js`** (2026-09-26) - `GET` lists the user's rules; `POST` validates (type/amount via `coerceAmount`/category/frequency/dayOfMonth 1–28/dayOfWeek 0–6/description), rejects non-object/array/null bodies, and creates with `firstRunDate()`-computed `nextRunAt` plus `amountMinor` and `currency`.

- **`src/app/api/recurring/[id]/route.js`** (2026-09-26) - `PATCH` edits amount/category/description/active on owned rules (404 otherwise; schedule changes go through delete + recreate; amount changes also rewrite `amountMinor`); rejects non-object/array/null bodies; `DELETE` removes the rule (materialized Transactions stay as history).

---

### MongoDB Models

- **`src/models/recurring.model.js`** (2026-09-26) - Recurring rule: `userId*`, `type*`, `amount*` (+ finiteness validator), `amountMinor*` (integer minor units), `currency` (USD/INR, default USD), `category*`, `description`, `frequency*` (weekly/monthly), `dayOfMonth` (1–28), `dayOfWeek` (0–6), `nextRunAt*`, `lastRunAt`, `active`. Index on `(userId, active, nextRunAt)`. Materialized by `src/lib/recurring.js`.

- **`src/models/user.model.js`**
  - Fields: email (unique, validated), accountName, **onboarded** (bool — set when onboarding is completed OR skipped; drives `isNewUser`), otp (hashed, temp), otpExpires, role, currency (USD/INR), refreshTokens.
  - `RefreshTokenSchema` - `token` stores the **SHA-256 hash** of the JWT (never raw); `deviceInfo`, `ipAddress`, `createdAt`; `rotatedAt` (set when rotation supersedes the token — valid during the grace window, purged after, reuse past it = theft). TTL indexes don't work on subdocument arrays — pruning happens in code.
  - `pre("save")` hashes OTP when modified; `compareOtp()` method.

- **`src/models/transaction.model.js`** - userId (indexed), type enum, amount (>0, **finite** — `v > 0` is true for `Infinity`, so finiteness is explicit and re-checked at the model layer so no write path can store a non-finite amount), **amountMinor\*** (POSITIVE INTEGER minor units; every report sums this instead of the float), **currency** (USD/INR, default USD), date, category (≤50), description (≤200), `recurringRuleId` + `scheduledFor` (materialization idempotency key; both default `null`), excludeFromBudget bool. Compound indexes `{userId,date:-1}`, `{userId,type,date:-1}` and a **unique SPARSE `{recurringRuleId:1, scheduledFor:1}`** via `.index()` (sparse so ordinary hand-created rows, which carry `(null, null)`, are exempt). `formattedAmount` virtual reads `amountMinor` when present so rendering can never inherit float drift.

- **`src/models/category.model.js`** - userId, name (required, trimmed, **maxlength 50** — matches Transaction.category cap so every custom category is assignable), type enum. Unique `{userId,name,type}`.

- **`src/models/budget.model.js`** - userId, category, amount (≥1, **finite**), `amountMinor` (integer minor units, optional — legacy rows are derived), month (strict `YYYY-MM` calendar regex — `2026-13` rejected so no invisible budgets). Unique `{userId,category,month}`.

- **`src/models/ratelimit.model.js`** *(new)* - Backing store for auth rate limiting: `{ key (unique), hits [Date] ($slice-capped at 100), expiresAt }` with a **top-level TTL index** (`expireAfterSeconds: 0`) so MongoDB auto-purges expired docs (~60s sweeper). Shared across instances; survives restarts.

---

### Utility Libraries (`/src/lib/`)

- **`src/lib/mongodb.js`** - Singleton Mongoose connection (`bufferCommands:false`, pool 10, timeouts). Resets cached promise on failure. Reads `MONGODB_URI` lazily inside `dbConnect()` (never at import — since 2026-09-26, so `next build` succeeds without env configured).
  - `dbConnect()` - Default export; throws a clear "define MONGODB_URI" error only when a DB op actually runs without env; returns the cached connection. Connection failures log `error.message` only (never the raw object — Mongoose errors can echo the Atlas URI, which embeds the password).

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

- **`src/lib/money.js`** *(new, 2026-09-28)* - Server-side money helpers. **CURRENCY ASSUMPTION: every supported currency (USD, INR) is 2-decimal, so minor units are always `amount × 100`.**
  - `CURRENCY_DECIMALS` / `MINOR_UNITS` (100) / `MAX_AMOUNT` (1e12).
  - `AMOUNT_MINOR_EXPR` - Mongo aggregation expression `{ $round: [{ $ifNull: ["$amountMinor", { $multiply: [{ $ifNull: ["$amount", 0] }, 100] }] }, 0] }`: prefers the stored integer and falls back to a rounded conversion of the legacy float, so reports stay exact while the migration is pending — and the fallback is still INTEGER arithmetic, never a float sum.
  - `coerceAmount(value)` - The single numeric write-boundary guard: `Number.isFinite` + `> 0` + `≤ MAX_AMOUNT`, returning `null` for rejection. Rejects `NaN`, `Infinity`, `-Infinity` and numeric strings that overflow (`"1e400"`) — `isNaN()`/`> 0` accepted all of them.
  - `toMinorUnits(amount)` / `fromMinorUnits(minor)` - `Math.round(n * 100)` and the single `n / 100` division. `30 / 100 === 0.3` exactly, which is the whole point.
  - `minorOf(record)` - Minor units for a document-shaped row, tolerating legacy docs that only have the float `amount`.
  - `RESERVED_CATEGORY_NAMES` / `isReservedCategoryName(name)` - `__proto__`, `constructor`, `prototype`, `toString`, `valueOf`, `hasOwnProperty`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString`. Reports key their spending maps BY CATEGORY NAME, so these names corrupted (`constructor` → the `Object` constructor leaked into `spent`) or silently dropped (`__proto__`) financial data. Rejected at the category write boundary, with `Object.create(null)` + `Object.hasOwn` in the report routes as defence in depth.

- **`src/lib/rate-limit.js`** - MongoDB-backed sliding-window limiter with **static imports** (`@/lib/mongodb`, `@/models/ratelimit.model`). `recordHit(key, windowMs)` (pushes timestamp, $slice-capped), `countRecentHits(key, windowMs)` (aggregate $filter count), `recordHitAndCount(key, windowMs, max)` (atomic record-then-count — closes the check-then-act race; returns `{allowed, count}`), `getClientIp(request)`, `popLastHit(key)` (refund quota), `resetKey(key)` (clear on success). Every helper **fails open** on DB errors so the limiter can never lock everyone out during an incident (safe: every guarded op also needs the DB, so fail-open grants nothing).
  - `getClientIp(request)` (2026-09-28) - **The `x-real-ip` preference was DELETED.** It is a plain request header, so unless the edge strips it a client can rotate it per request and defeat both the 20/hour per-IP send cap and the 25/15min per-IP verify cap outright; the old comment asserting the edge set it was an unverifiable assumption about the deployment. Order now: `request.ip` (framework-derived from the real socket peer — the only source the app does not take on faith from a header), else the **LAST** `x-forwarded-for` entry (edge-appended; the first entry is fully client-controlled and is never read), else `"unknown"`. The app deploys on Vercel, whose documented client-IP header is `x-forwarded-for`; `x-real-ip` is an nginx convention Vercel does not set. The per-email bucket (derived from validated input) remains authoritative.

- **`src/lib/recurring.js`** (2026-09-26; hardened 2026-09-28) - Recurring engine, no cron:
  - `MAX_CATCH_UP_RUNS` (12).
  - `advanceRuleDate(date, frequency)` - Pure, **UTC-ONLY** (`setUTCDate` / `setUTCMonth`). It previously mixed UTC (`firstRunDate`) with LOCAL setters, so on a server whose TZ is behind UTC the run instant resolved to the previous day-of-month — and because the advanced value was written back as the new `nextRunAt`, the drift was PERMANENT.
  - `firstRunDate({ frequency, dayOfMonth, dayOfWeek }, from)` - Pure, UTC.
  - `materializeDueRules(userId, deps)` - **Concurrency-safe.** It plans the whole run first (so the claim is a single `$set` of the final `nextRunAt` and nothing is lost if the claim fails), then takes an **ATOMIC CLAIM** — `RecurringModel.findOneAndUpdate({ _id, nextRunAt: rule.nextRunAt }, { $set: { nextRunAt: precomputedNext } }, { new: true })` — and only inserts Transactions when the claim is non-null. The old code read due rules, inserted in a loop, then unconditionally `$set` `nextRunAt`, so two concurrent passes (two tabs, a double-tap on Verify) both inserted the same occurrence. The unique sparse `(recurringRuleId, scheduledFor)` index is the second line of defence: **E11000 on insert is treated as "already materialized", not an error**; any other insert error is re-thrown. Each occurrence is stamped with `recurringRuleId` + `scheduledFor` and carries `amountMinor`. `lastRunAt` is recorded in a follow-up `updateOne`. Injectable models for tests. Called best-effort from OTP verify success AND (throttled) from `GET /api/reports/dashboard` — neither ever blocks the caller.

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
6. **Logout**: single-session `$pull` by hash (legacy raw accepted). Cookies are ALWAYS cleared, so the response is `200` either way — `{ revoked: true }` on success, `{ revoked: false, code: "SERVER_REVOKE_*_FAILED" }` when the server-side revoke failed (other devices may still be signed in). The client checks `res.ok` and `revoked` and surfaces the partial-revoke warning on `/login` instead of silently pretending success.
7. **Proxy**: verifies the refresh-cookie SIGNATURE with `jwtVerify(..., { algorithms: ["HS256"] })` and FAILS CLOSED; public paths match exactly or on a segment boundary (so `/api-docs` and `/login-x` are protected); authenticated users are bounced off `/login`; every page request gets the per-request CSP nonce.

## Security Headers

Baseline headers in `next.config.mjs` (XFO/nosniff/referrer/permissions/HSTS). **Strict CSP is now enforced** per-request by `src/proxy.js`: `default-src 'self'`, `script-src 'self' 'nonce-{per-request}' 'strict-dynamic'` (dev adds `'unsafe-eval'`), `style-src 'self' 'unsafe-inline'` (Framer Motion/Chart.js styling), tight img/font/connect/object/base/form/frame directives. Root layout exports `dynamic = "force-dynamic"` because nonce stamping requires dynamic rendering (verified on Turbopack and webpack production builds).

## Currency Support
USD and INR, stored per user; formatting via `UserContext` everywhere (context updates propagate instantly after profile saves). INR uses `en-IN` lakh grouping. Each transaction and recurring rule also records a `currency`; both supported currencies are **2-decimal**, which is the assumption behind the integer `amountMinor` representation (see `src/lib/money.js`). There is no FX conversion: reports assume a single currency per user.

## Data Visualization
Dashboard pie (lazy-loaded `SimpleChart`) and reports bar chart; slice colors generated for any category count; loading/error/empty states throughout.

## Key Design Decisions
- **No Password Authentication**: OTP-only via email (Brevo).
- **Dual Token System + rotation**: short-lived access + rotating refresh with grace window and reuse detection; tokens hashed at rest.
- **Database-Backed Sessions**: revocable everywhere via `verifySession()`.
- **MongoDB-backed rate limiting**: shared across instances/restarts; record-then-count closes burst races; IP bucketing uses only sources the app does not take on faith from a client header (`request.ip`, then the last `x-forwarded-for` entry — `x-real-ip` was removed) with the per-email bucket authoritative; fails open (provably safe — every guarded op needs the DB too).
- **Integer money**: amounts are stored as BSON doubles (kept for compatibility) AND as integer `amountMinor`; every report sum is integer arithmetic with a single decimal conversion at the response boundary, so float drift can never reach a payload. Backfilled by `scripts/migrate-amount-minor.mjs` (idempotent).
- **Idempotent side effects**: recurring materialization claims each rule with an atomic `findOneAndUpdate` guarded on the exact `nextRunAt` it read, plus a unique sparse `(recurringRuleId, scheduledFor)` index; a duplicate-key insert is treated as "already done".
- **Strict CSP**: nonce-per-request through the proxy; dynamic rendering required.
- **Timezone Handling**: noon-local instants stored as-is; clients send absolute month windows (`start`/`end`); server never applies its own offset. End-bounds keep future-dated transactions out of "current month". The recurring date engine is **UTC-only end to end** (`setUTCDate`/`setUTCMonth`), so a non-UTC server cannot drift the day-of-month — and because the advanced value is written back as the new `nextRunAt`, any drift would be permanent. The suite is verified green under `TZ=America/Los_Angeles` and `TZ=Asia/Kolkata`.
- **Error Hygiene**: generic client messages; present-but-invalid input is a 400 (never a silent success or a masking fallback); validation feedback (400s) where input-specific; 503 for transient infra so clients don't log users out; logout reports the real outcome via `revoked`/`code` instead of a status that contradicts the cookies it just cleared. **No route logs a raw error object** — only `error.message` plus a request id — because Axios/Mongoose errors can carry the OTP payload, the connection string, or the request body.
- **Server-side pagination**: transactions endpoint pages/filters server-side (max 200/page); client debounces search.
- **Tests**: one vitest entry (`test/run-all.test.js`, 325 tests) covering utils, money helpers, token hashing/generation roundtrip, the api() refresh contract (incl. deadlock regression), every API route, and the component/dialog layer.

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
| `MONGODB_URI` | MongoDB connection string (database: `fintrack_db`) — also backs the rate-limit collection | `src/lib/mongodb.js`, `scripts/migrate-legacy-dates.mjs`, `scripts/migrate-amount-minor.mjs` |
| `BREVO_API_KEY` | Brevo (Sendinblue) API key for sending OTP emails | `src/app/api/auth/otp/send/route.js` |
| `EMAIL_FROM` | Verified sender email for Brevo | `src/app/api/auth/otp/send/route.js` |
| `ACCESS_TOKEN_SECRET` | JWT secret for access tokens (15min expiry) | `src/lib/auth.js` (`getAccessSecret`) |
| `REFRESH_TOKEN_SECRET` | JWT secret for refresh tokens (30d expiry, rotated on use) | `src/lib/auth.js` (`getRefreshSecret`), `src/app/api/auth/refresh/route.js`, `src/app/api/auth/logout/route.js`, `src/app/api/auth/logout-all/route.js` (direct `verifyToken`/`jwt.verify` calls read `process.env` at request time), **`src/proxy.js` (`hasValidSession` — must be present in the BUILD environment; without it the proxy fails closed)** |
| `JWT_SECRET` | Reserved/unused — no `src/` references (grep 2026-09-26); kept in README template only | — |
| `NODE_ENV` | Environment mode (`development` adds `'unsafe-eval'` to CSP script-src; controls cookie `secure` flags; `SimpleChart` dev-only error detail) | `src/proxy.js`, auth routes (`refresh`, `otp/verify`), `src/components/SimpleChart.js` |
| `CAPACITOR_SERVER_URL` | (Optional) Overrides the target URL loaded by the iOS app (defaults to `https://fintrack.vistaenvision.com`) | `capacitor.config.ts` |
| `MANAGER_ENDPOINT` | (Optional) Base URL of the **Manager** deployment (its own port, e.g. `http://127.0.0.1:3300` — not this app's dev port). All three of endpoint + app id + log key are required before the integration enables itself. | `src/lib/manager/index.js` → `managerConfig` |
| `MANAGER_APP_ID` | (Optional) Project slug in Manager (`finance-app`). | `src/lib/manager/index.js` → `managerConfig` |
| `MANAGER_LOG_KEY` | (Optional) Project **server** log key (`mlk_…`). | `src/lib/manager/index.js` → `managerConfig` |
| `MANAGER_ANALYTICS_KEY` | (Optional) Analytics key (`mak_…`) for the injected tracker `<script>`. | `src/lib/manager/index.js` → `managerConfig` |
| `MANAGER_LOG_SOURCE` | (Optional) `server` (default) or `client`. Inferred when omitted. | `src/lib/manager/index.js` → `managerConfig.source` |
| `NEXT_PUBLIC_MANAGER_ENDPOINT` | (Optional, browser) Same value as `MANAGER_ENDPOINT`. **Required for the browser half** — Next.js only inlines `NEXT_PUBLIC_*` into the client bundle, so `process.env.MANAGER_*` is always empty in browser code. Also appended to the page CSP `connect-src`. | `src/lib/manager/index.js` → `managerClientConfig`; `src/proxy.js` → `buildCsp` |
| `NEXT_PUBLIC_MANAGER_APP_ID` | (Optional, browser) Same value as `MANAGER_APP_ID`. Same client-bundle constraint. | `src/lib/manager/index.js` → `managerClientConfig` |
| `NEXT_PUBLIC_MANAGER_CLIENT_KEY` | (Optional, browser) Project **client** log key (`mck_…`). Manager derives each entry's `source` from the key kind, so browser entries must carry the client key. | `src/lib/manager/index.js` → `managerClientConfig` |
| `NEXT_PUBLIC_MANAGER_ANALYTICS_KEY` | (Optional, browser) Analytics key (`mak_…`) for the injected tracker `<script>`. | `src/lib/manager/index.js` → `managerTrackerScript` |
| `VERCEL_GIT_COMMIT_SHA` / `GIT_SHA` | (Optional) Manager `release` label on the server; falls back to `'dev'`. | `src/lib/manager/index.js` → `startManagerLogger` |
| `NEXT_PUBLIC_RELEASE` | (Optional) Manager `release` label in the browser; falls back to `'web'`. | `src/lib/manager/ManagerProvider.jsx` |

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
npm test           # vitest — runs ALL 338 tests in one go via test/run-all.test.js
npm run lint       # eslint . (clean)
npm run manager:check  # live check against a running Manager (needs MANAGER_* env)
```

---

## Manager integration (added 2026-09-28)

Optional centralized logging + analytics. With no `MANAGER_*` variables every export in
`src/lib/manager/index.js` degrades to a no-op, so local dev, CI and previews are
unaffected. This app has **no logger of its own** — unlike ResumeBuilder, which bridged
an existing `src/lib/logger.js` — so `src/lib/manager/index.js` is the single entry
point and the existing `console.error` / `console.warn` calls in the API routes fan out
to it. No app-wide logging layer was invented, and no `console.*` output was changed.

| File | Purpose | Exports |
|---|---|---|
| `src/lib/manager/logger.js` | The vendored `@manager/logger` SDK: single file, zero dependencies, refreshed with `curl -H "x-manager-key: …" "…/api/sdk/logger?format=js"` | `initLogger`, `traceIdFromHeaders`, `shutdownLoggers`, `fingerprint`, `LOG_SDK_VERSION`, `LOG_SDK_PATH`, `TRACE_HEADER` |
| `src/lib/manager/index.js` | Integration facade. Reads the server `MANAGER_*` env, exposes a no-op logger when unconfigured, creates the real logger lazily on first use and caches it on `globalThis` so every module instance shares one queue, batches routine levels on a 250ms window and leading-edge-flushes `error`/`fatal`. Separately exposes `managerClientConfig`, built from the `NEXT_PUBLIC_MANAGER_*` block, because Next.js strips non-public env from the client bundle. Never throws. | `managerConfig`, `managerClientConfig`, `startManagerLogger`, `getManagerLogger`, `managerLog`, `getManagerDroppedCount`, `logServerEvent`, `logServerError`, `managerTrackerScript` |
| `src/lib/manager/ManagerProvider.jsx` | Client component mounted in `src/app/layout.js`: starts the browser logger and injects the analytics `<script>` once, guarded against double injection. Gated on `managerClientConfig.enabled`, not `managerConfig.enabled`. | `ManagerProvider` (default) |
| `src/proxy.js` (modified) | `buildCsp` appends `NEXT_PUBLIC_MANAGER_ENDPOINT` to `connect-src` when set. Unset ⇒ byte-identical policy. | `buildCsp`, `proxy` |
| `src/app/api/**/route.js` (17 files, 39 sites) | Each existing `console.error` / `console.warn` in an API error path is followed by `logServerError(...)` / `managerLog("warn", ...)` carrying the same message plus a `route` tag. Additive only. | — |
| `scripts/check-manager-integration.mjs` | `npm run manager:check` — live check against a running Manager (key kinds, rejection paths, this app's own refresh error path) | — |
| `scripts/measure-log-delivery.mjs` | `node scripts/measure-log-delivery.mjs [count]` — fires N entries at the facade and reports ingest requests, entries delivered, entries/request and SDK drops. Imports the facade directly, which is why the SDK specifier is an explicit `./logger.js`. | — |
| `test/suites/manager-integration.suite.js` | 14 tests: disabled-when-unconfigured no-ops, enablement rules, blank values, server/client config split, tracker tag construction, batching + leading-edge flush, drop-count accessor, unknown-level fallback, shared `globalThis` instance, real SDK surface. Registered in `test/run-all.test.js`, the repo's single test entry point. | — |

### Delivery profile

`managerLog` no longer flushes on every write. Flushing per entry turned the SDK's batch
into one HTTP request per line: measured 96/200 delivered, 105 dropped, 20 requests,
4.8 entries/request. The current shape measures 201/200 delivered, 0 dropped, 11 requests,
18.3 entries/request (`scripts/measure-log-delivery.mjs 200`).

- `FLUSH_INTERVAL_MS = 250` is passed to the SDK as `flushIntervalMs`, so the SDK's own
  timer does the batching. It is short on purpose — a serverless runtime can freeze timers
  once the response is sent, so the SDK's 5s default could delay or strand entries.
- `IMMEDIATE_LEVELS = {error, fatal}` skip the window via `scheduleUrgentFlush()`
  (leading edge): flush now if `URGENT_FLUSH_MIN_GAP_MS` (100ms) has passed, otherwise
  arm one trailing flush, so a burst of 50 errors costs ~2 requests, not 50.
- `getManagerDroppedCount()` reads the SDK's `droppedCount()` for health checks. The
  re-vendored SDK raises its own discards as a `warn` entry `manager_sdk_dropped_entries`
  and raised `maxLogsPerSecond` from 50 to 500; a 50/s self-ceiling silently discarded most
  of a busy server's output.

### Design notes

- The server logger is created **on first use**, not in an `instrumentation` hook. This
  app has no `instrumentation.js` and none was added: Next.js compiles startup hooks and
  route handlers into separate module graphs, so a boot-created instance would not be
  the object a request sees.
- `captureProcessErrors` is intentionally **off** — Next.js owns process error handling
  and extra process listeners stop delivery.
- The SDK import is an explicit `./logger.js` so the facade also loads in plain Node
  (`scripts/measure-log-delivery.mjs`), not only under the bundler.
- Coverage is the server API error paths. Client-side `console.error` in components and
  pages is not fanned out server-side — the browser SDK captures it instead via
  `captureConsole`.
- **Deviation from the ResumeBuilder reference:** the reference reads `MANAGER_ENDPOINT` /
  `MANAGER_APP_ID` / `MANAGER_LOG_KEY` from inside a `"use client"` module. Next.js
  replaces `process.env` in browser code with an empty object, so all three resolve to
  `undefined`, `managerConfig.enabled` is `false`, and `ManagerProvider` returns before
  doing anything — the browser logger and analytics are dead code. Worse, adding a
  `NEXT_PUBLIC_` block is not sufficient on its own: Next.js inlines only *statically
  written* `process.env.NEXT_PUBLIC_FOO` member expressions, so the reference's dynamic
  `env(name)` helper compiles to a runtime index into that same empty object and is
  equally dead. This repo therefore splits the config (`managerConfig` for the server,
  `managerClientConfig` for the browser) and reads every client value with a static
  member expression.
- **Deviation:** `src/proxy.js` `connect-src` gains the Manager origin. This app emits
  a strict nonce + `strict-dynamic` CSP where `connect-src` is `'self'`, so the browser
  logger and the tracker would be silently blocked. `script-src` needs no change —
  `strict-dynamic` already trusts a `<script>` inserted by a nonce'd script.
