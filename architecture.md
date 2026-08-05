# Finance App - Architecture Document

## Overview
A Next.js 15 personal finance tracking application with OTP-based authentication, transaction management, reporting, and data visualization. Uses MongoDB with Mongoose for data persistence and Brevo (Sendinblue) for email-based OTP delivery.

**Tech Stack:** Next.js 16, React 19, MongoDB/Mongoose, Tailwind CSS v4, Chart.js, Framer Motion, Lucide React, Brevo API, JWT (jsonwebtoken + jose)

---

## Project Structure

### Root Configuration Files

| File | Purpose |
|------|---------|
| `/package.json` | Project metadata, scripts (dev/build/start/lint), dependencies |
| `/next.config.mjs` | Next.js configuration |
| `/postcss.config.mjs` | PostCSS configuration for Tailwind CSS |
| `/eslint.config.mjs` | ESLint configuration |
| `/jsconfig.json` | JavaScript/Next.js path aliases (@/ maps to ./src) |
| `/tailwind.config.js` | Tailwind CSS theme configuration (if exists) |
| `/README.md` | Project documentation |
| `/architecture.md` | Project architecture documentation |

### Source Code (`/src/`)

#### App Layout & Entry Points

- **`src/app/layout.js`** - Root layout component. Sets up Inter font, global CSS, and base HTML structure.
  - `RootLayout()` - Renders `<html>` and `<body>` with Inter font and global styles. Defines metadata (title: "Finance Tracker").

- **`src/app/page.js`** - Root page (entry point at `/`). Checks authentication and redirects.
  - `RootPage()` (async) - Calls `verifyAuth()`. If authenticated, redirects to `/dashboard`. Otherwise redirects to `/login`.

- **`src/app/globals.css`** - Global styles. Imports Tailwind CSS v4 (`@import "tailwindcss"`). Defines `@theme` block (currently commented out). Sets `box-sizing: border-box` globally.

#### Middleware

- **`src/proxy.js`** - Next.js Edge Proxy (Middleware) for route protection. Next.js 16 uses the "proxy" convention for what was previously middleware.
  - `middleware()` - Checks for `refreshToken` cookie. If present and accessing `/login` or `/welcome`, redirects to `/dashboard`. Defines public paths: `/login`, `/welcome`, and `/api` (all API routes excluded from middleware — they handle their own auth with proper 401 responses). If no `refreshToken` and accessing protected route, redirects to `/login`. Config: runs on all paths except `_next/static`, `_next/image`, and `favicon.ico`.

---

### Auth Module (`/src/app/(auth)/`)

- **`src/app/(auth)/login/page.js`** - Login page with OTP flow ("use client").
  - `LoginPage()` - Two-step form: Step 1 collects email, calls `/api/auth/otp/send`. Step 2 collects OTP, calls `/api/auth/otp/verify`. On success, redirects based on `isNewUser` flag (new users → `/welcome`, returning → `/dashboard`). **Auto-redirects on mount** if already authenticated (checks `GET /api/user`, redirects to `/dashboard` on success). State: `email`, `otp`, `step`, `loading`, `error`, `checkingSession`. Uses `useRouter` for navigation.

- **`src/app/(auth)/welcome/page.js`** - Welcome/onboarding page for new users ("use client").
  - `WelcomePage()` - Collects `accountName` via form, submits to `PUT /api/user`. On success, redirects to `/dashboard`. State: `accountName`, `loading`, `error`.

---

### Main App Module (`/src/app/(main)/`)

- **`src/app/(main)/layout.js`** - Main app layout with sidebar, header, and user context ("use client").
  - `UserContext` - React Context export for sharing user data across main routes.
  - `Sidebar()` - Navigation sidebar component. Links: Dashboard (`/dashboard`), Transactions (`/transactions`), Reports (`/reports`). Responsive - full sidebar on desktop (lg+), overlay with backdrop on mobile. Animated with Framer Motion. Highlights active route.
  - `ProfileDropdown()` - User menu dropdown with profile link and logout button. Shows user's `accountName`. Uses `UserContext`. Calls `POST /api/auth/logout` on logout.
  - `MainLayout()` - Main app shell. Fetches current user via `GET /api/user`. Shows loading spinner (PiggyBank icon bouncing). Provides `UserContext` with user data. Renders sidebar + header + content area. Header shows page title based on pathname and responsive menu toggle. Closes sidebar on mobile route change.

- **`src/app/(main)/dashboard/page.js`** - Dashboard page ("use client").
  - `StatCard()` - Reusable stat card component with icon, title, and formatted value. Props: `title`, `value`, `icon: Icon`, `colorClass`.
  - `DashboardSkeleton()` - Loading skeleton with animated pulse placeholders.
  - `DashboardPage()` - Main dashboard. Fetches data from `GET /api/reports/dashboard`. Displays 3 stat cards (Current Balance, Income This Month, Expenses This Month) using `UserContext` currency. Shows recent transactions (up to 5) with an amber "One-time" chip on flagged transactions, and expense breakdown pie chart (via `SimpleChart`). Includes budget progress section and "Set Budgets" button. Bottom padding (`pb-20` mobile) prevents FAB overlap. Includes FAB button to open `AddTransactionDrawer`. State: `data`, `loading`. Handles empty data/error states gracefully.

- **`src/app/(main)/transactions/page.js`** - Transactions page ("use client").
  - `EditTransactionModal()` - Modal for editing a transaction. Fetches categories from `GET /api/categories`. Supports selecting existing categories or creating new ones via `POST /api/categories`. Saves via `PUT /api/transactions/[id]`. Normalizes the stored date to `YYYY-MM-DD` via `formatDateForInput` (local-timezone getters) so the date input shows the same date as the list, and sends the date back as `new Date(date + "T12:00:00")` (noon in user's local time) on save. Includes a "One-time expense" checkbox (`name="excludeFromBudget"`, shown only for expenses); `handleChange` uses `e.target.checked` for checkbox inputs (a checkbox's `value` is the string "on"/"", not a boolean). State: `formData`, `categories`, `newCategory`, `isAddingNewCategory`. Animated with Framer Motion.
  - `TransactionCard()` - Mobile card component for a single transaction. Shows type badge, category, date, amount, description, an amber "One-time" chip when `excludeFromBudget` is set, and inline confirm-once delete (no browser dialog). Used on screens < 640px.
  - `TransactionsPage()` - Main transactions page. **Responsive layout**: table view on desktop (≥640px), card list on mobile (<640px). Fetches from `GET /api/transactions`. Filters by search, type, category, date range. Desktop table shows an amber "One-time" chip next to the category for flagged transactions. Delete uses **inline confirm** (no `window.confirm`/`alert()`). Errors shown as **inline dismissible banner**. Uses `UserContext` for currency formatting. Loading state uses animated skeleton cards.

- **`src/app/(main)/reports/page.js`** - Reports page ("use client").
  - `ReportsPage()` - Date-range report generator. Date inputs default to current month. Fetches report from `POST /api/reports/generate`. Shows summary cards (Total Income, Total Expenses, Net Savings) and detailed breakdowns. Expense breakdown as bar chart (via `react-chartjs-2 Bar`). Income sources as a list. Uses `UserContext` for currency. State: `startDate`, `endDate`, `report`, `loading`, `error`.

- **`src/app/(main)/categories/page.js`** - Categories management page ("use client").
  - `CategoriesPage()` - Lists only custom categories (no built-in defaults) with filter tabs (All/Expense/Income). Supports adding new custom categories and deleting them. Delete uses **inline confirm** (no browser dialog). Errors shown as **inline dismissible banner**. Built-in default categories are never shown in the list. Shows a "Matches default" badge on custom categories that share a name with a built-in one. Calls `GET /api/categories`, `POST /api/categories`, `DELETE /api/categories/[id]`.

- **`src/app/(main)/profile/page.js`** - Profile settings page ("use client").
  - `ProfilePage()` - Fetches user data from `GET /api/user`. Profile form: Account Name (text), Email (disabled display), Preferred Currency (select: USD/INR). Security section with "Log Out From All Devices" danger zone button calling `POST /api/auth/logout-all`. Saves profile via `PUT /api/user`. Loading spinner, error/alert handling.

---

### API Routes

#### Auth API

- **`src/app/api/auth/otp/send/route.js`** - Sends OTP via email using Brevo.
  - `POST` - Accepts `{ email }`. Validates email format. Rate-limits (5 OTP/hour per email, in-memory Map). Generates 6-digit OTP, stores (hashed via User model pre-save hook) with 10-min expiry. Creates new user if not exists. Sends via Brevo TransactionalEmailsApi. Returns success/error messages. Error: hides internal errors from client, only shows generic messages.

- **`src/app/api/auth/otp/verify/route.js`** - Verifies OTP and establishes session.
  - `POST` - Accepts `{ email, otp }`. Validates OTP expiry (> 10 min = expired). Compares OTP with bcrypt hash. On success: clears OTP fields, generates access token (15 min) and refresh token (30 days), stores refresh token in user document, sets httpOnly cookies (accessToken + refreshToken), returns `{ isNewUser, user }`. Uses `sendSuccess`/`sendError` helpers.

- **`src/app/api/auth/refresh/route.js`** - Refreshes access token using refresh token.
  - `POST` - Reads `refreshToken` cookie. Verifies JWT, checks against database for user+token match. Generates new access token, sets accessToken cookie. Clears cookies on failure. Returns success/error.

- **`src/app/api/auth/logout/route.js`** - Logs out current session.
  - `POST` - Reads `refreshToken` cookie. Decodes it, removes matching token from user's `refreshTokens` array. Clears both cookies. Returns success.

- **`src/app/api/auth/logout-all/route.js`** - Logs out from all devices.
  - `POST` - Reads `refreshToken` cookie. Decodes it, empties entire `refreshTokens` array for the user. Clears cookies. Returns success.

#### User API

- **`src/app/api/user/route.js`** - User CRUD operations.
  - `GET` - Fetches authenticated user data. Uses `verifySession()` (secure verifier with DB check). Selects fields excluding `otp`, `refreshTokens`, `__v`.
  - `PUT` - Updates user profile. Accepts `{ accountName, currency }`. Uses `findByIdAndUpdate` with `$set`. Validates fields - only updates if values provided.

#### Transactions API

- **`src/app/api/transactions/route.js`** - Transaction list and creation.
  - `GET` - Returns all transactions for authenticated user, sorted by `date` desc, `createdAt` desc.
  - `POST` - Creates new transaction. Validates: type (income/expense), amount (positive number), category (non-empty string), date (valid parseable). Stores the date exactly as the client sent it (client sends an ISO instant at 12:00 noon in the user's local timezone — the server never adjusts by its own offset, since the server timezone is irrelevant to the user and is UTC in production). Accepts optional `excludeFromBudget` boolean — always persisted as `Boolean(excludeFromBudget)` so it's deterministic even when the client omits it. Sanitizes inputs (trim, parseFloat).

- **`src/app/api/transactions/[id]/route.js`** - Single transaction CRUD.
  - `GET` - Gets transaction by ID. Uses `verifySession()` (secure verifier with DB check). Ensures user owns the transaction.
  - `PUT` - Updates transaction by ID. Stores date exactly as the client sent it (no timezone offset adjustment on the server — same rule as POST). Accepts optional `excludeFromBudget` — conditionally spread on `!== undefined` (not truthiness) so a cleared `false` persists, coerced via `Boolean()`. Uses `findOneAndUpdate` with ownership check and `runValidators`.
  - `DELETE` - Deletes transaction by ID. Uses `findOneAndDelete` with ownership check.

#### Categories API

- **`src/app/api/categories/route.js`** - Category management.
  - `GET` - Returns merged list of default categories + user's custom categories, separated by type (expense/income). Also returns `allCustom` array with full category objects (with `_id`) for management. Uses `verifyAuth()` (lightweight edge verifier).
  - `POST` - Creates new custom category. Accepts `{ name, type }`. Validates name and type required. Handles duplicate (11000 error → 409 Conflict).

- **`src/app/api/categories/[id]/route.js`** - Single category operations.
  - `PUT` - Renames a custom category. Validates ownership. Accepts `{ name }`. Returns 404 if not found or unauthorized.
  - `DELETE` - Deletes a custom category. Validates ownership. Reassigns all transactions with that category name to "Miscellaneous" via `Transaction.updateMany`. Returns 404 if not found or unauthorized.

#### Budgets API

- **`src/app/api/budgets/route.js`** - Monthly budget CRUD.
  - `GET` - Returns all budgets for the user for a given month (`?month=YYYY-MM`). Defaults to current month.
  - `POST` - Creates or updates a budget (upsert). Accepts `{ category, amount, month }`. Validates amount ≥ 1.
  - `DELETE` - Deletes a budget by `?category=X&month=YYYY-MM`.

#### Reports API

- **`src/app/api/reports/dashboard/route.js`** - Dashboard data aggregation.
  - `GET` - Returns aggregated data: `currentBalance` (all-time income - expenses), `monthlyIncome`, `monthlyExpenses`, `expenseBreakdown` (by category for current month), `recentTransactions` (last 5). Uses 4 concurrent Promise.all MongoDB aggregations with `verifyAuth()`.

- **`src/app/api/reports/budget-progress/route.js`** - Budget spending progress.
  - `GET` - Returns spending vs budget for the current month. Aggregates expense transactions and compares against per-category budgets and an overall budget (`__total__` category). Transactions flagged `excludeFromBudget` (one-time expenses) are excluded from both per-category and overall spending via `excludeFromBudget: { $ne: true }` in the `$match`. A second aggregation sums those excluded expenses for transparency. Returns `{ overall: { budget, spent, remaining, percentage, overBudget }, progress: [{ category, budget, spent, remaining, percentage, overBudget }], totalSpent, excludedSpent }`.

- **`src/app/api/reports/generate/route.js`** - Custom date-range report.
  - `POST` - Accepts `{ startDate, endDate }`. Fetches transactions in date range. Computes: `totalIncome`, `totalExpenses`, `netSavings`, `expenseDetails` (sorted desc by total), `incomeDetails` (sorted desc by total). Uses `verifyAuth()`.

---

### MongoDB Models

- **`src/models/user.model.js`** - User schema with Mongoose.
  - Schema fields: `email` (required, unique, validated), `accountName` (optional), `otp` (hashed, stored temporarily), `otpExpires` (Date), `role` (user/admin enum, default "user"), `currency` (USD/INR enum, default "USD"), `refreshTokens` (sub-document array with `token`, `deviceInfo`, `ipAddress`, `createdAt` with TTL 30-day expiry).
  - `RefreshTokenSchema` - Sub-document schema for session management. Auto-expires after 30 days via MongoDB TTL index.
  - `pre("save")` hook - Auto-hashes OTP with bcrypt before saving when `otp` field is modified.
  - `methods.compareOtp()` - Compares candidate OTP against stored bcrypt hash.

- **`src/models/transaction.model.js`** - Transaction schema.
  - Schema fields: `userId` (ObjectId ref to User, indexed), `type` (income/expense enum), `amount` (Number, min 0.01, must be positive), `date` (Date, required, default now), `category` (String, required, max 50 chars), `description` (String, optional, max 200 chars), `excludeFromBudget` (Boolean, default false — marks one-time/sudden expenses that don't count toward monthly budget progress; consumers read it with truthy checks since pre-existing documents lack the field).
  - Indexes: Compound indexes on `{ userId, date }` and `{ userId, type, date }`. Single index on `userId`.
  - Virtual: `formattedAmount` (returns amount with 2 decimal places). `toJSON` includes virtuals.
  - Timestamps enabled.

- **`src/models/category.model.js`** - Category schema.
  - Schema fields: `userId` (ObjectId ref to User), `name` (String, required, trimmed), `type` (income/expense enum).
  - Unique compound index: `{ userId, name, type }` to prevent duplicate categories per user per type.

- **`src/models/budget.model.js`** - Monthly budget schema.
  - Schema fields: `userId` (ObjectId ref to User, indexed), `category` (String, required), `amount` (Number, min 1), `month` (String, YYYY-MM format).
  - Unique compound index: `{ userId, category, month }` to prevent duplicate budgets per user per category per month.

---

### Utility Libraries (`/src/lib/`)

- **`src/lib/mongodb.js`** - MongoDB connection manager.
  - `dbConnect()` - Singleton connection pattern. Caches connection in `global.mongoose`. Options: `bufferCommands: false`, `maxPoolSize: 10`, `serverSelectionTimeoutMS: 5000`, `socketTimeoutMS: 45000`, `family: 4`. Resets promise on connection error.

- **`src/lib/auth.js`** - Authentication utilities.
  - `generateAccessToken(userId)` - Signs JWT with 15-min expiry using `ACCESS_TOKEN_SECRET` and `jsonwebtoken`.
  - `generateRefreshToken(userId)` - Signs JWT with 30-day expiry, includes `jti` (nanoid), uses `REFRESH_TOKEN_SECRET`.
  - `verifyToken(token, secret)` - Verifies JWT, returns decoded payload or null on error.
  - `verifyAuth()` - Lightweight auth check for Edge/Middleware runtime. Reads `accessToken` cookie, verifies with `jose` (jwtVerify), returns `{ user: { _id } }` or `{ user: null }`.
  - `verifySession()` - Secure auth check for Node.js API routes. Reads both cookies, verifies access token with `jsonwebtoken`, connects to DB, checks refresh token exists in user document. Returns `{ user }` or `{ user: null, error }`.

- **`src/lib/server-utils.js`** - Server response helpers.
  - `sendSuccess(data, status = 200)` - Returns `NextResponse.json()` with data and status.
  - `sendError(message, status = 500)` - Returns `NextResponse.json({ error: message })` with status.

- **`src/lib/utils.js`** - Client-side utility functions.
  - `formatCurrency(amount, currency = 'USD')` - Formats number as currency string. Uses `en-IN` locale for INR, `en-US` for others. Returns formatted string or "0.00" equivalent.
  - `formatDate(dateString)` - Formats date to "Month Day, Year" (e.g., "January 15, 2024"). Returns empty string for null/invalid dates.
  - `formatDateForInput(date)` - Formats Date object to "YYYY-MM-DD" for HTML date input. Returns empty string for null/invalid.

- **`src/lib/api.js`** - API client with automatic token refresh.
  - `api(url, options)` - Wrapper around `fetch()`. On 401 response (excluding `/api/auth/refresh`), triggers token refresh via `/api/auth/refresh`. Uses a queue pattern to prevent concurrent refresh storms - multiple requests queue up behind one refresh. If refresh fails, redirects to `/login` via `window.location.href`. Variables: `isRefreshing` (boolean), `failedQueue` (array of promises).
  - `processQueue(error, token)` - Resolves or rejects all queued requests.

- **`src/lib/constants.js`** - Application constants.
  - `defaultExpenseCategories` - Default categories: Food, Groceries, Transport, Bills, Housing, Entertainment, Health, Shopping, Other.
  - `defaultIncomeCategories` - Default categories: Salary, Bonus, Freelance, Investment, Other.

---

### Components (`/src/components/`)

- **`src/components/AddTransactionDrawer.js`** - Slide-in drawer for adding transactions ("use client").
  - `SegmentedControl()` - Custom toggle between Expense/Income with animated active pill using Framer Motion `layoutId`.
  - `AddTransactionDrawer({ isOpen, onClose, onTransactionAdded })` - Form with type toggle, amount input, category select (with "Add New" option), date picker, description field, payment method selector (Cash/Card), and a "One-time expense" checkbox (shown only for expenses) that sets `excludeFromBudget`. Fetches categories on open — shows merged list of built-in defaults + custom categories in the dropdown. "Add New" option creates a new custom category via `POST /api/categories` and refreshes the list. Submits transaction via `POST /api/transactions`, sending the date as `new Date(date + "T12:00:00")` — an ISO instant at 12:00 noon in the user's local timezone (noon avoids DST edge cases), so the server stores an exact instant and the transaction always renders on the calendar date the user picked. Default date is `formatDateForInput(new Date())` (user's local date). Resets form state (including `excludeFromBudget`) on close. Animated slide-in from right with backdrop overlay.

- **`src/components/SimpleChart.js`** - Lazy-loaded pie chart component ("use client").
  - `SimpleChart({ data, options })` - Dynamically imports Chart.js and react-chartjs-2. Registers `ArcElement`, `Tooltip`, `Legend`. Renders `<Pie>` component. States: loading (spinner), error (red message with dev-only details), no data, component not available, and chart rendering. Height: 300px, min-height: 300px.

- **`src/components/ChartWrapper.js`** - Alternative chart wrapper using Next.js `dynamic()` import ("use client").

- **`src/components/BudgetProgress.js`** - Budget progress bars for the dashboard ("use client").
  - `BudgetProgress()` - Fetches from `/api/reports/budget-progress`. Renders animated progress bars per category showing spent vs budget. Color-coded: indigo (under 80%), amber (80-100%), red (over budget). The "Total spent this month" line appends "(excl. X in one-time expenses)" when the API reports `excludedSpent > 0`. Uses `UserContext` for currency formatting. Returns null if no budgets set.

- **`src/components/BudgetManager.js`** - Slide-in drawer for setting monthly budgets ("use client").
  - `BudgetManager({ isOpen, onClose, onSaved })` - Fetches expense categories from `/api/categories` and existing budgets from `/api/budgets`. Lets user set an overall monthly budget and per-category spending limits. Warns when combined category budgets exceed the overall budget. Saves all via `POST /api/budgets`. Animated slide-in with backdrop overlay.
  - `ChartLoading()` - Spinner loading state.
  - `ChartWrapper({ data, options, type = "pie" })` - Uses Next.js `dynamic()` for SSR-avoiding import of `react-chartjs-2 Pie`. Has initialization effect with 100ms delay for DOM readiness. Includes debug info tracking in dev mode. States: loading (spinner), error (red message), no data, and rendering.

---

## Authentication Flow

1. **Login**: User enters email → OTP sent to email via Brevo
2. **OTP Verify**: User enters OTP → validated against bcrypt hash → tokens generated
3. **Session**: Access token (15min JWT) + Refresh token (30d JWT, stored in DB) set as httpOnly cookies
4. **Verification**: Edge paths use lightweight `verifyAuth()` (jose). API routes use `verifySession()` (full DB check).
5. **Token Refresh**: Automatic via `api.js` client wrapper on 401 responses. Refresh endpoint verifies refresh token against DB, issues new access token.
6. **Logout**: Single session → removes specific refresh token from DB. All sessions → empties refresh tokens array.
7. **Middleware**: Guards all routes except public auth paths. Redirects logged-in users away from login/welcome.

## Currency Support
- USD and INR supported
- Currency preference stored per user, configurable in profile
- Dashboard, transactions, and reports respect user's currency setting via `UserContext`
- INR formatting uses `en-IN` locale (lakhs/crores style)

## Data Visualization
- Dashboard: Pie chart for monthly expense breakdown (via `SimpleChart` with dynamic Chart.js import)
- Reports: Bar chart for expense breakdown (direct `react-chartjs-2 Bar` import)
- Both chart components handle loading, error, empty data, and SSR gracefully

## Key Design Decisions
- **No Password Authentication**: Fully OTP-based using email (Brevo/Sendinblue)
- **Dual Token System**: Short-lived access token + long-lived refresh token
- **Database-Backed Sessions**: Refresh tokens stored in user document for server-side revocation
- **Rate Limiting**: In-memory OTP rate limiting (5/hour per email) - should use Redis in production
- **Edge Compatible Auth**: Separate lightweight (`verifyAuth` using jose) and secure (`verifySession` using jsonwebtoken + DB) verifiers
- **Timezone Handling**: The client sends transaction dates as an ISO instant at 12:00 noon in the user's local timezone (`new Date(date + "T12:00:00")`); the server stores that instant as-is and never adjusts by its own offset. This preserves the user's selected calendar date across all timezones (the old server-side `getTimezoneOffset()` adjustment only worked in dev where server and user shared a timezone — in production the server is UTC so it was a no-op, shifting dates a day back for users west of UTC)
- **Lazy-Loaded Charts**: Chart.js dynamically imported to avoid SSR issues

---

## Environment Variables

Define all of these in a `.env.local` file at the project root.

| Variable | Purpose | Referenced In |
|----------|---------|---------------|
| `MONGODB_URI` | MongoDB connection string (database: `fintrack_db`) | `src/lib/mongodb.js` |
| `BREVO_API_KEY` | Brevo (Sendinblue) API key for sending OTP emails | `src/app/api/auth/otp/send/route.js` |
| `EMAIL_FROM` | Verified sender email for Brevo | `src/app/api/auth/otp/send/route.js` |
| `ACCESS_TOKEN_SECRET` | JWT secret for access tokens (15min expiry) | `src/lib/auth.js` |
| `REFRESH_TOKEN_SECRET` | JWT secret for refresh tokens (30d expiry) | `src/lib/auth.js` |
| `JWT_SECRET` | Additional JWT secret (reserved) | — |
| `NODE_ENV` | Environment mode (`development` / `production`) | Various (cookie security, dev messages) |

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
