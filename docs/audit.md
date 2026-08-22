# FinTrack — Full Site Audit

> **Audit date:** 2026-08-22 · **Method:** line-by-line review of every file in `src/`, plus runtime verification of route/proxy behavior against a live dev server.
> Supersedes the previous audit-status file (the a1–a8 fixes are all verified present and working). This audit re-examined everything from scratch and found new issues the earlier pass missed.
>
> **Totals: 2 high · 6 medium · 15 low/polish · carried-over open items**

---

## 🔴 HIGH — broken flows (both verified)

### H1. New-user onboarding (`/welcome`) is unreachable — the proxy bounces exactly the users it's meant for
`src/proxy.js:10-12` redirects any request carrying a `refreshToken` cookie away from `/login` **and `/welcome`**, straight to `/dashboard`. But a brand-new user who just verified their OTP *has* cookies set (the verify response sets them before `router.push("/welcome")` fires), so they are bounced to `/dashboard` and never see the account-name screen.

**Verified live:** `curl -H "Cookie: refreshToken=x" localhost:3000/welcome` → `307 → /dashboard`.

Consequences:
- `isNewUser` returned by `/api/auth/otp/verify` is dead code — nothing can act on it.
- New users get `accountName = null`; the profile dropdown renders an empty name chip.
- The welcome page component is unreachable for its intended audience (only reachable pre-auth, where its `PUT /api/user` would 401).

**Fix options (pick one):**
1. Remove `/welcome` from the proxy's logged-in bounce list and guard the page client-side instead (it already goes through `api()`, which redirects unauthenticated users).
2. Or drop the welcome step entirely and prompt for the name inline on first dashboard visit when `accountName` is null.

### H2. Future-dated transactions inflate "this month" stats and budgets forever
Both aggregation endpoints filter with only a lower bound:
- `src/app/api/reports/dashboard/route.js:43` — `date: { $gte: startOfMonth }` (no `$lt`)
- `src/app/api/reports/budget-progress/route.js:48` — same

There is no upper bound, so any transaction dated in the future (post-dated rent, a typo'd year, planned income) counts toward **"Income/Expenses This Month", the expense-breakdown pie, and every budget bar** starting today, and keeps polluting the current month until that future date arrives. One wrong year (e.g., 2027 instead of 2026) skews the dashboard for months.

**Fix:** accept an `end` instant from the client alongside `start` (client computes local month end, same pattern already used by `/api/reports/generate`) and add `$lt: endOfMonth`. Fallback server-side: `startOfMonth + 1 month`.

---

## 🟠 MEDIUM — functional bugs & data-consistency flaws

### M1. Profile changes don't propagate — stale `UserContext` until hard reload
`MainLayout` fetches the user once on mount and owns the only `setUser` (`src/app/(main)/layout.js:171-186`). The profile page saves via `PUT /api/user` but has no way to update the context. Result: change currency USD→INR, navigate to dashboard → amounts still format as USD; rename account → header dropdown still shows the old name. Only a full page reload fixes it.

**Fix:** expose `{ user, setUser }` through `UserContext` and have the profile/welcome pages call `setUser(updated)` after a successful save.

### M2. `api()` can deadlock forever when refresh succeeds but the retry still 401s
Trace in `src/lib/api.js`: request A gets 401 → `isRefreshing = true` → refresh OK → `processQueue(null)` → `return await originalRequest()` (#2). If #2 *also* returns 401 (clock skew, revoked-but-refreshable state, a route that 401s for non-auth reasons), #2 sees `isRefreshing === true`, pushes itself onto `failedQueue`, and waits. Nobody will ever call `processQueue` again (the outer call is blocked awaiting #2; `finally` hasn't run) → **the promise hangs indefinitely**; no spinner resolution, no redirect, frozen UI section.

**Fix:** track retries per-request (e.g., attach `_retried` to options and don't queue if already retried once — reject immediately), and/or add a timeout to the queued wait.

### M3. Any failed refresh — including transient 500s — force-redirects to `/login`
`api()` treats every non-OK refresh response as fatal auth failure (`window.location.href = '/login'`). Two compounding cases:
1. `src/app/api/auth/refresh/route.js:14` runs `await dbConnect()` **outside** its try/catch — DB-down returns a Next-generated non-JSON 500 while cookies remain valid.
2. The client then hard-redirects to `/login` despite holding perfectly good cookies; the proxy then bounces the user back toward protected routes (they still have `refreshToken`), producing a redirect flicker loop until the DB recovers.

The server half of this was carefully designed ("transient DB errors return 500 without clearing cookies"), but the client throws that protection away.

**Fix:** in `api()`, only hard-redirect when `refreshRes.status === 401`; on 5xx, reject the original request with a retryable error (and optionally auto-retry once after a short delay). Also move the refresh route's `dbConnect()` inside its try/catch.

### M4. Renaming a custom category orphans transactions *and* budgets — and the endpoint isn't even wired up
`PUT /api/categories/[id]` renames only the `Category` document. Transactions store category as a plain string, so they keep the old name — which now vanishes from every dropdown — and reports/budgets group under a ghost label. Budgets are also keyed by name and are not touched. Ironically `DELETE` got this right (reassigns to "Other") but `PUT` didn't.

Additionally, **no UI calls this endpoint at all** — users cannot rename categories from anywhere in the app.

**Fix (if keeping the feature):** in the same handler, `Transaction.updateMany({ userId, category: oldName }, { $set: { category: newName } })` and `Budget.updateMany(...)` similarly. Either build the rename UI or delete the orphaned endpoint.

### M5. Edit-transaction modal swallows save failures
`handleSaveEdit` (transactions page) catches errors and sets the *page-level* error banner — which renders **behind the modal overlay** — while leaving the modal open with no feedback inside it. The user clicks "Save Changes", nothing visibly happens, modal stays stuck.

**Fix:** pass the failure back into the modal (`onSave` returning a result / throwing into `modalError`), or close the modal and surface the banner.

### M6. BudgetManager UX traps
`src/components/BudgetManager.js`:
1. **Clearing a field doesn't delete the budget.** `handleSave` filters out empty/zero amounts, so an existing budget whose field you blanked simply isn't re-saved — the old value persists in the DB and keeps driving progress bars. Only the small trash icon actually deletes. Users will believe they removed a budget when they didn't.
2. **Silent failures.** If any `POST /api/budgets` fails, the drawer logs to console and stays open with zero visible feedback (same for `removeBudget`). Negative/invalid values fail server-side invisibly too (the inputs aren't in a `<form>`, so native validation never runs).
3. **Hardcoded `$`** in the over-budget warning text — INR users see dollar signs.

---

## 🟡 LOW — bugs, edge cases & polish

1. **Login page discards server messages on the send step** (`login/page.js:52`): any non-OK response becomes the generic "Failed to send OTP. Please try again." — the 429 rate-limit message and invalid-email message are never shown, right when the user most needs them. (The verify step reads `data.message` correctly.)
2. **Drawer discards duplicate-category message** (`AddTransactionDrawer.js:113`): creating an already-existing category throws generic "Failed to create category." instead of the server's 409 "Category already exists". Also, after a successful category creation the form stays in "add new" mode — an immediate retry now always 409s until the user manually re-picks from the dropdown.
3. **Dashboard doesn't refresh budget bars after adding a transaction** — `onTransactionAdded={fetchData}` updates stats but never bumps `budgetVersion`, so `BudgetProgress` shows stale numbers until remount.
4. **Pie chart colors run out** — 7 hardcoded `backgroundColor`s; an 8th+ category falls back to Chart.js defaults. Generate colors programmatically (HSL rotation) instead.
5. **Desktop transactions table has no Description column** — mobile cards show descriptions, desktop tables hide them entirely; users must open Edit to see what a transaction was.
6. **Categories page misrepresents fetch failure as "no categories yet"** — on mount failure it renders the normal empty-state instead of an error banner.
7. **Reports page accepts reversed ranges silently** — start > end produces an all-zero report with no warning. Clearing either date input makes `toISOString()` throw inside the try, surfacing the cryptic "Invalid time value". Validate ordering + presence client-side.
8. **No cap on category-name length** — `category.model.js` has no `maxlength`, so a user can create a 200-char category; assigning it to a transaction then fails the transaction schema's 50-char limit with a confusing error long after creation. Cap names ≤50 at the API and inputs.
9. **`PUT /api/user` doesn't validate `currency`** — an out-of-enum value passes the truthy check, fails mongoose enum during `findByIdAndUpdate`, and surfaces as a 500 instead of a 400.
10. **OTP send quirks** (`otp/send/route.js`): (a) the rate-limit slot is consumed *before* the email attempt, so service failures burn the user's quota; (b) a failed Brevo call happens *after* `user.save()`, overwriting any pending valid OTP with one that never arrived; (c) `error.message.includes(...)` in the catch throws if `message` is undefined.
11. **Invalid `:id` params return 500, not 404** — malformed ObjectIds in `[id]` routes cast-error into the generic 500 branch. Cheap fix: check `mongoose.isValidObjectId(id)` up front.
12. **`dbConnect()` sits outside try/catch** in several routes (categories, categories/[id], budgets, user, reports/*) — a connection error escapes as an unhandled exception and Next returns a non-JSON HTML 500. Inside try/catch, clients get parseable JSON.
13. **Unused dependencies & imports** — `date-fns`, `clsx`, `tailwind-merge` in package.json are referenced nowhere; `mongoose` import unused in `categories/[id]/route.js`. (Also 7 benign `react-hooks/set-state-in-effect` lint warnings.)
14. **Minor UX gaps:** no resend-OTP button/cooldown on the verify step (must re-enter email); OTP input lacks `inputMode="numeric"`; amount inputs lack `min="0.01"`; description/accountName/newCategory inputs lack `maxLength`; drawers/modals don't lock body scroll or close on Escape; profile dropdown doesn't close on outside click / Escape and lacks `aria-expanded`; window-resize listener reopens a manually-collapsed sidebar; welcome step has no "Skip".
15. **Auth hardening leftovers (deliberate trade-offs worth revisiting):**
    - Verify lockout is keyed by email only → an attacker can deliberately lock a victim out (DoS trade-off), and there's **no IP-based cap on `/send`** — unlimited distinct emails can be OTP-bombed from one address (each email capped at 5/hr, the sender isn't).
    - Timing side channel: nonexistent emails skip bcrypt compare, so response latency differs subtly. Uniform messages mitigate content leakage; a dummy-hash compare would close it.
    - Concurrent signup race: two simultaneous sends for a fresh email both `new User(...)`; the loser 500s on the unique index instead of retrying gracefully.

---

## 📋 Carried-over open items (still valid, from previous audits)

| Item | Status |
|---|---|
| Refresh-token rotation + reuse detection | Deferred — needs multi-tab grace window |
| Hash refresh tokens at rest (SHA-256) | Open — DB leak exposes 30-day sessions |
| Strict Content-Security-Policy | Open — needs Chart.js/Framer tuning |
| Redis-backed rate limiting | Open — in-memory Maps reset on restart, per-instance |
| Automated test suite | Open — none exists; highest value: OTP flow, ownership scoping, month boundaries |
| Server-side pagination for transactions | Open — fine at current scale |

## ⚙️ Performance notes

- `verifySession()` hits MongoDB on every API request (by design, for revocation) — fine now; consider caching with a short TTL if traffic grows.
- `budget-progress` runs its two aggregations sequentially; `Promise.all` them like the dashboard does.
- Transactions page renders the full list twice (table + card trees both mounted; CSS-hidden) — with pagination/virtualization this disappears anyway.
- Reports bundles Chart.js eagerly (`Bar` static import) unlike the lazy-loaded dashboard pie — intentional per docs, but inconsistent bundle behavior.

---

## ✅ What's solid (verified, no action needed)

- OTP generation uses CSPRNG (`crypto.randomInt`), bcrypt-hashed at rest, uniform verify errors, real lockout with sweeping.
- Every data route enforces `verifySession()` (DB-backed revocation works everywhere); ownership scoping (`userId` in every query/filter) is consistent across transactions/categories/budgets.
- Timezone design (noon-local instants stored as-is, client-computed month windows) is correct — the legacy off-by-one class of bugs is genuinely fixed, including `formatDateForInput` local getters.
- `excludeFromBudget` flag round-trips correctly through create/edit (checked `!== undefined`, not truthiness).
- Honest `logout-all` (real 500 on DB failure), cookie-clearing semantics on bad refresh tokens, expired-token purging on login/refresh.
- Security headers present; error boundaries cover `(main)` and root segments; loading skeletons everywhere; inline confirmations replace `alert`/`confirm`.

---

## Suggested fix order

1. **H1** — restore onboarding (small diff, huge UX win)
2. **H2** — month-end bounds on dashboard/budget-progress
3. **M3** — stop force-logging-users-out on transient errors (client status check + move `dbConnect`)
4. **M1** — `setUser` in context
5. **M2** — api() retry cap
6. **M5/M6** — modal error surface + budget manager feedback
7. **M4** — decide rename feature's fate
8. Lows in batch (validation caps, error-message passthrough, unused deps)

*All findings reproducible from code paths cited above; H1 additionally verified against a running dev server.*
