# FinTrack — Audit Status

> **Second-cycle audit performed 2026-08-22** (line-by-line review of `src/` after the first cycle closed). Every finding from that audit has been **fixed, tested, and committed**. A full test suite (`/test`, 191 tests) was built alongside the fixes.
>
> **Open items: none.**

---

## What was fixed in this cycle (all verified by tests)

### 🔴 Broken / user-visible bugs — FIXED

| ID | Finding | Fix |
|----|---------|-----|
| B1 | Budgets section silently vanished when its API failed | `BudgetProgress` renders an explicit error card with a working **Retry**; success/error/loading are distinct states |
| B2 | Budget drawer opened empty on load failure (looked like "no budgets") | `BudgetManager` shows an in-drawer load-error banner with Retry; save controls stay hidden until data loads |
| B3 | "Skip for now" users were re-prompted on EVERY login (`isNewUser = !accountName`) | New `onboarded` flag on User: set by welcome save OR Skip (`PUT { onboarded: true }`), auto-set when a name is saved, never revocable; verify computes `isNewUser = !accountName && !onboarded` |
| B4 | Deleting the only row on page N (>1) stranded an empty stale page | Transactions page clamps back to the previous page after such deletes |

### 🟡 Robustness — FIXED

| ID | Finding | Fix |
|----|---------|-----|
| M1 | Unguarded `res.json()` → cryptic errors on non-JSON bodies | Guarded with `.catch(() => ({}))` in login-verify, welcome, AddTransactionDrawer, categories delete/add |
| M2 | Malformed JSON body crashed OTP verify to a framework 500 | Parsing moved inside try → controlled 400 |
| M3 | Category rename cascade not atomic (ghost-label risk) | Three writes run in a Mongo **transaction** on replica sets; standalone fallback does sequential writes with **best-effort rollback** of the rename; no-op fast path when name unchanged |
| M4 | Budgets POST trusted client types ("50" slipped past `< 1`) | Strict guards: category string ≤50 trimmed, month regex-checked on BOTH upsert paths, amount coerced via `Number()` + finite ≥1 |

### 🟢 UI / UX — FIXED

| ID | Finding | Fix |
|----|---------|-----|
| U1 | One stray click logged the user out | Two-step logout confirmation in the header dropdown (Logout → confirm/cancel) |
| U2 | BudgetManager lacked Escape/scroll lock | Wired to the shared overlay hook |
| U3 | Overlays had no dialog semantics or focus management | New shared `useDialogA11y` hook used by all three overlays: `role="dialog"`, `aria-modal`, focus trap, initial focus (`[data-autofocus]`), focus restore, Escape, scroll lock |
| U4 | Dashboard went stale across month boundaries | Single seq-guarded `fetchData()` recomputes the month window per call and re-fetches on `visibilitychange` |
| U5 | OTP email was HTML-only | Plain-text `textContent` part added |

### ⚪ Code quality — FIXED

- Categories page: one `fetchCategories()` serves both mount and Retry.
- Dashboard: single `fetchData()` replaces the duplicated inline fetch chain.

---

## Verification performed

- `npm run lint` — 0 problems · `npm run build` — clean
- **`npm test` — 191/191 passing** via the new single-entry suite (`test/run-all.test.js`)
- New coverage added this cycle: every API route (auth incl. refresh rotation/grace/reuse, user, transactions, categories, budgets, reports ×3), rate-limit fail-open contract, proxy routing+CSP, real mongoose schema contracts, the dialog-a11y hook, and key UI flows (B1–B4 regressions, U1/U2/U3 behaviors, welcome skip flow, login OTP step)

## Notes

- Login page intentionally uses raw `fetch()` (not the `api()` wrapper): a failed refresh redirecting to `/login` would loop there.
- The mongoose validation message on transaction create remains client-visible on purpose (input feedback, not internal detail).
- Legacy plaintext refresh-token entries in existing user documents keep working until natural expiry; they convert to hashes automatically on their next refresh.
- Users who skipped onboarding BEFORE the B3 fix will see `/welcome` exactly once more (one Skip click) and never again.

---

## What was fixed in the FIRST cycle (2026-08-22, traceability)

| Area | Fixes |
|---|---|
| Onboarding | `/welcome` proxy bounce removed — new-user flow works again (verified via 307-matrix tests) |
| Time windows | Month-end bounds on dashboard/budget-progress so future-dated txns can't pollute stats |
| Session UX | Live `UserContext`; transient DB errors never force-logout; `api()` retry-once guarantee (deadlock regression-tested) |
| Token security | Refresh tokens SHA-256-hashed at rest; rotation + 60s grace window; reuse-after-grace revokes all sessions |
| Categories | Rename cascades to transactions AND budgets (+ real rename UI); delete cleans budgets; 50-char caps |
| Budgets | Clearing a field deletes on save; visible save/delete errors; currency-aware warnings |
| Auth endpoints | Mongo-backed sliding-window rate limits (per-email + per-IP); timing-equalized verify; OTP-send refund/restore; signup race handled |
| Input hygiene | Server-side date/currency/ObjectId validation (404 not 500); `dbConnect` inside try everywhere |
| UI polish | Description column, programmatic pie colors, error states vs misleading empties, dropdown a11y, resend cooldown |
| Infra | Strict CSP nonce-per-request through Next 16 proxy (+ `force-dynamic`) |
