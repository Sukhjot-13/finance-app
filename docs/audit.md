# FinTrack — Full Site Audit

> Audit date: 2026-08-21 · Scope: entire codebase (all pages, API routes, models, libs, components, config) + `next build` / lint verification.
>
> Verdict: **The app builds and the core flows work**, but there are **2 high-severity security gaps in the auth flow, several broken tooling pieces (lint is completely broken), a non-functional DB cleanup assumption, and a systemic server-timezone bug** that affects reports/budgets near month boundaries.

---

## Summary

| Severity | Count | Highlights |
|----------|-------|------------|
| 🔴 High | 4 | Math.random() OTP, no OTP brute-force protection, TTL-on-subdocument never works, mixed auth verifiers |
| 🟠 Medium | 7 | Lint fully broken, drawer submit bypasses validation, nanoid not a direct dep, UTC default dates, server-TZ month math, unencoded delete URL, error message leaks |
| 🟡 Low | 8 | alert()/confirm leftovers, "Miscellaneous" ghost category, dead code, doc drift, etc. |
| 💡 Suggestions | 6 | Refresh-token hashing/rotation, security headers, tests, pagination, toasts, dark mode |

---

## 🔴 High severity

### H1. OTP generated with `Math.random()` — predictable
**File:** `src/app/api/auth/otp/send/route.js:58`
```js
const otp = Math.floor(100000 + Math.random() * 900000).toString();
```
`Math.random()` is not cryptographically secure; its output is predictable from observed values. An attacker who can trigger several OTPs and observe timing/sequence can narrow the search space dramatically. Use CSPRNG:
```js
import { randomInt } from "crypto";
const otp = randomInt(100000, 1000000).toString();
```

### H2. No rate limiting / lockout on OTP verify — brute-forceable
**File:** `src/app/api/auth/otp/verify/route.js` (whole POST handler)
The `/send` endpoint has rate limiting (5/hour), but `/verify` has none. A 6-digit OTP with a 10-minute validity window and unlimited attempts is ~10⁶ tries against an endpoint that does one bcrypt.compare per attempt (parallelizable). Add per-email+IP attempt counting with exponential lockout (e.g., 5 failed attempts → 15-min block), ideally in Redis for production.

### H3. Refresh-token TTL on a subdocument array silently does nothing
**File:** `src/models/user.model.js:9-15`
```js
createdAt: { type: Date, default: Date.now, expires: '30d' }
```
MongoDB **TTL indexes only work at collection level** — the `expires` option inside an embedded-array subdocument schema creates nothing. Consequences:
- Expired refresh tokens are **never purged** → `refreshTokens` array grows unbounded for active users (every login adds one; only logout removes).
- The comment in the schema documents behavior that doesn't exist.
Fix: periodic cleanup job (`$pull` where `refreshTokens.createdAt < now-30d`), or a dedicated `refreshtokens` collection with a real TTL index, or cap array length on login.

### H4. Mixed auth verifiers — logout-all doesn't actually kill API access
**Files:**
- `verifySession()` (DB-backed, revocable): `/api/user`, `/api/transactions/[id]`
- `verifyAuth()` (JWT-signature-only): `/api/transactions`, `/api/categories`, `/api/categories/[id]`, `/api/budgets`, `/api/reports/*`

"Log Out From All Devices" empties `refreshTokens`, but every route using `verifyAuth()` keeps accepting a stolen/unrevoked access token until it expires naturally (≤15 min). Worse: `/api/auth/refresh` will refuse to re-issue after logout-all, but any still-valid access token keeps full data access. Standardize all data routes on `verifySession()` so server-side revocation is meaningful.

---

## 🟠 Medium severity

### M1. Linting is completely broken (both paths)
1. `npm run lint` fails instantly: `next lint` was **removed in Next 16** (`Invalid project directory provided ... /lint`). The script must call ESLint directly (e.g., `"lint": "eslint src"`).
2. `eslint.config.mjs` uses `FlatCompat.extends("next/core-web-vitals")`, which crashes with ESLint 9.32 + eslint-config-next 16 (`TypeError: Converting circular structure to JSON` from eslintrc compat layer). eslint-config-next v16 ships native flat config — drop FlatCompat entirely:
```js
import nextVitals from "eslint-config-next/core-web-vitals";
export default [...nextVitals];
```
(Exact import name per eslint-config-next v16 docs.) Verified broken via `npx eslint src`.

### M2. AddTransactionDrawer footer button bypasses form validation
**File:** `src/components/AddTransactionDrawer.js:198 & 342-351`
The `<form>` has **no `id`**, but the footer submit button references `form="add-transaction-form"` — a nonexistent id — and fires via `onClick`. Result:
- Native HTML5 `required` validation (amount, category, date) is **skipped** when using the footer button; empty submissions go to the server and come back as generic errors instead of inline browser validation.
- Enter-key submit works (form has `onSubmit`), so behavior differs by input method.
Fix: give the form `id="add-transaction-form"` and remove `onClick={handleSubmit}` from the button (keep `type="submit" form=...`) — but note that then *both* onClick and submit would fire if you keep both, causing double submission.

### M3. `nanoid` used in auth but not a declared dependency
**Files:** `src/lib/auth.js:3` imports `nanoid`; `package.json` does not list it.
It resolves today only because it's hoisted transitively (v3.3.11 via postcss). A dependency-tree change or strict install breaks the build. Add `"nanoid": "^3.3.11"` (or replace with `crypto.randomUUID()`, zero-dep).

### M4. Reports page default dates computed in UTC
**File:** `src/app/(main)/reports/page.js:28-33`
```js
new Date(new Date().setDate(1)).toISOString().split("T")[0]
```
For a user west of UTC after ~7pm local on the 1st of the month, this yields the **previous month's date** as the report start. The codebase already solved this class of bug with `formatDateForInput()` (local getters) — use it here too.

### M5. Server-timezone month boundaries — wrong month data near month edges
**Files:** `src/app/api/reports/dashboard/route.js:20-21`, `src/app/api/reports/budget-progress/route.js:20-22`, `src/app/api/budgets/route.js:116-118`, `src/app/api/reports/generate/route.js:25`

Transaction dates are stored as user-local-noon instants (good), but month windows are computed from **server time** (UTC in production). Example: IST user at 02:00 on Mar 1 = Feb 28 20:30 UTC → dashboard/budget-progress show **February** while the user sees March; BudgetManager saves budgets for `2026-03` while budget-progress reads `2026-02` → progress section vanishes/mismatches. Same for reports/generate range parsing (`new Date(startDate + "T00:00:00")` parses in server TZ). Fix: client sends its timezone offset (or explicit `month` param) with these requests, mirroring how transactions send noon-instants.

### M6. Budget delete URL doesn't encode the category name
**File:** `src/components/BudgetManager.js:44`
```js
fetch(`/api/budgets?category=${category}&month=${month}`, ...)
```
A custom category containing a space, `&`, `#`, or `+` produces a broken query (e.g. `category=Car&Home` → category=`Car`, stray `Home`). Wrap in `encodeURIComponent(category)`.

### M7. Internal error details leaked to clients
**Files:** `src/app/api/user/route.js:12,23,31,59` (`error: dbError.message` in JSON), `src/app/api/categories/[id]/route.js:50,91`, `src/app/api/categories/route.js:70`, `src/app/api/budgets/route.js:71`
Mongoose/driver error messages go straight into responses — useful for attackers fingerprinting the stack. Log server-side, return generic messages (the pattern already exists in `transactions/route.js`).

---

## 🟡 Low severity

### L1. `alert()` / `window.confirm()` still present despite docs claiming removal
- `src/app/(main)/profile/page.js:40,43,51,60` — save success/error alerts, logout-all confirm.
- `src/app/(main)/transactions/page.js:56,68` — new-category errors in EditTransactionModal.
`docs/suggestions.md` tracks replacing them with toasts; `docs/architecture.md` says they were removed — docs drift (see L8).

### L2. Category delete reassigns transactions to "Miscellaneous" — a category that doesn't exist anywhere
**File:** `src/app/api/categories/[id]/route.js:80-83`
Defaults use "Other"; "Miscellaneous" isn't in `defaultExpenseCategories`/`defaultIncomeCategories`, so reassigned transactions land in a category missing from every dropdown/filter, and income-category deletions move income transactions to a non-income-named bucket. Use "Other" (matching type).

### L3. Plain `fetch()` used almost everywhere — no auto token refresh
Only `(main)/layout.js` and `transactions/page.js` use the `api()` wrapper. Dashboard (`dashboard/page.js:55`), profile, categories, reports, BudgetManager, BudgetProgress, AddTransactionDrawer, login/welcome pages use raw `fetch`. When the 15-min access token expires mid-session, those pages hard-fail or redirect to `/login` instead of silently refreshing. Route everything through `api()`.

### L4. Drawer/category fetches don't check `res.ok`
`AddTransactionDrawer.fetchCategories` (line 60-64) and `BudgetManager` (19-32) do `.then(res => res.json())` blindly. On 401 the JSON is `{message: ...}` → `categories.expense` becomes `undefined` → `.map` crash on next render. Check `res.ok` (fixed automatically once L3 is done).

### L5. Dead / redundant code
- `src/lib/api.js:2` — unused `useRouter` import (a hook imported outside any component).
- `src/models/user.model.js:60-62` — `compareOtp()` method defined but verify route calls `bcrypt.compare` directly.
- `src/components/ChartWrapper.js` — appears unused (dashboard uses `SimpleChart`); either delete or document why kept.
- `src/app/(main)/layout.js:17` — `ChevronDown` imported and used, fine, but `X` import in transactions page… verified used; skip. Also `EditTransactionModal` PUTs the whole raw Mongo document (`_id`, `userId`, `createdAt`, `__v`, virtuals) back to the server — harmless (server whitelists fields) but wasteful and confusing.

### L6. Edit modal can't change transaction type
`EditTransactionModal` offers no expense↔income toggle; users must delete + recreate. Small UX gap given the drawer supports it.

### L7. Public asset redirect edge case in proxy
**File:** `src/proxy.js:24` — anonymous request for any file under `/public` other than favicon (e.g. `/a.svg`) doesn't match `publicPaths` → redirected to `/login` instead of served. Exclude static extensions in the matcher or add `/` handling.

### L8. Docs/code drift
- `docs/architecture.md` claims browser dialogs were removed and describes `ChartWrapper({data, options, type})` merged into BudgetManager's listing — actual files differ slightly (ChartWrapper is standalone/unused; alerts remain).
- `docs/suggestions.md` marks the invalid `indexes` option as an open improvement — confirmed **still unfixed**: `src/models/transaction.model.js:55-58` passes `indexes: [...]` as a schema option, which Mongoose ignores; the two compound indexes are never created. Convert to `TransactionSchema.index({...})` calls like budget/category models do.

### L9. Minor observations
- `src/app/api/auth/refresh/route.js` — very verbose per-request console logging (user IDs, flow markers); trim in production.
- Email addresses are stored/compared case-sensitively (`User.findOne({ email })`); `Foo@x.com` vs `foo@x.com` creates two accounts. Lowercase/trim before lookup in both OTP routes.
- Verify endpoint returns different errors for "no pending OTP" vs "wrong OTP", which lets callers probe whether an account exists/requested a code. Uniform error message would be safer.
- `logout-all` catch swallows DB failure but still returns success — user believes devices were revoked when they may not be.
- OTP email is sent after `user.save()`; if Brevo fails, the account row exists anyway (benign, but ordering send-before-save avoids orphan rows).

---

## ✅ What's healthy

- `next build` completes cleanly; proxy (middleware) convention works on Next 16.
- Ownership checks (`userId` scoping) present on every transaction/category/budget/report query — no IDOR found.
- httpOnly + sameSite=strict cookies, secure in production; access/refresh split with DB-backed revocation list.
- Transaction date handling (client-local noon instant, server stores as-is) is well thought out and consistently implemented in drawer + edit modal.
- `.env*` properly gitignored; no secrets tracked in git.
- Consistent inline-confirm delete UX and dismissible error banners on main CRUD pages.
- Input validation on transaction create/update is solid (type enum, positive amount, date parseability, trimming, maxlengths at model level).

---

## 💡 Suggestions (new improvements)

1. **Hash refresh tokens at rest** (currently plaintext JWTs in `refreshTokens[]`; a DB leak = session hijack for 30 days). Store SHA-256 hash, compare hashed.
2. **Rotate refresh token on every refresh** + reuse detection (if a rotated token is presented twice, revoke all sessions).
3. **Security headers** — add `Content-Security-Policy`, `X-Frame-Options: DENY`, `Referrer-Policy`, `HSTS` via `next.config.mjs` `headers()` or the proxy. Currently none are set.
4. **Automated tests** — zero tests exist. Highest-value first targets: OTP send/verify flow (mock Brevo), ownership scoping on `[id]` routes, date-boundary behavior for reports/budget-progress.
5. **Server-side pagination for transactions** (already in suggestions.md — reaffirmed by audit; GET loads the entire collection every visit).
6. **Toast notification system** to finish what L1 started, plus React error boundaries around route content (both already tracked in suggestions.md).

---

## Recommended fix order

1. **H1 + H2** (OTP security) — small diffs, big risk reduction.
2. **M1** (restore lint) — unlocks catching the rest mechanically.
3. **M2 + M6 + M4** — quick frontend correctness fixes.
4. **H4** (unify verifiers) + **M7** (stop leaking errors).
5. **H3 + M5** — needs a little design (token cleanup strategy; client-provided timezone/month).
6. Everything else opportunistically.

*Cross-referenced in `docs/suggestions.md` (2026-08-21 entry).*
