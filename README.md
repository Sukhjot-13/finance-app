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

- [Node.js](https://nodejs.org/en/) (v18 or later recommended)
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

To run this project, you will need to add the following environment variables to your `.env.local` file:

- `MONGODB_URI`: Your MongoDB connection string.
  _Example: `mongodb+srv://user:password@cluster.mongodb.net/fintrack_db?retryWrites=true&w=majority`_

- `BREVO_API_KEY`: Your API key from [Brevo](https://www.brevo.com/) (formerly Sendinblue) for sending transactional emails (OTPs).

- `EMAIL_FROM`: The email address that will be used as the sender for OTP emails.
  _Example: `noreply@fintrack.com`_

- `ACCESS_TOKEN_SECRET`: A long, random, and secret string used to sign access tokens. You can generate one using `openssl rand -base64 32`.

- `REFRESH_TOKEN_SECRET`: A long, random, and secret string used to sign refresh tokens. You can generate one using `openssl rand -base64 32`.

- `JWT_SECRET`: A long, random, and secret string used to sign JWT tokens. You can generate one using `openssl rand -base64 32`.

#### Example `.env.local` file:

```
MONGODB_URI=your_mongodb_connection_string
BREVO_API_KEY=your_brevo_api_key
EMAIL_FROM=your_sender_email@example.com
ACCESS_TOKEN_SECRET=your_super_secret_access_token_string
REFRESH_TOKEN_SECRET=your_super_secret_refresh_token_string
JWT_SECRET="your_super_secret_JWT_token_string"

```

A complete template (including the optional Manager block below) lives in
[`.env.example`](.env.example).

### Optional: Manager (centralized logging + analytics)

FinTrack can send its server error logs and page analytics to **Manager**, a personal
project control center. With no `MANAGER_*` variables set nothing changes: the
integration is a set of no-ops, so local development, CI and previews are unaffected.

| Variable | Required for | Value |
|---|---|---|
| `MANAGER_ENDPOINT` | logs + analytics | base URL of the **Manager** deployment — not this app's own port |
| `MANAGER_APP_ID` | logs + analytics | project slug in Manager |
| `MANAGER_LOG_KEY` | server logs | `mlk_…` server key |
| `MANAGER_ANALYTICS_KEY` | analytics | `mak_…` |
| `MANAGER_LOG_SOURCE` | optional | `server` (default) or `client` |
| `NEXT_PUBLIC_MANAGER_ENDPOINT` | browser logs + analytics | same value as `MANAGER_ENDPOINT` |
| `NEXT_PUBLIC_MANAGER_APP_ID` | browser logs + analytics | same value as `MANAGER_APP_ID` |
| `NEXT_PUBLIC_MANAGER_CLIENT_KEY` | browser logs | `mck_…` client key |
| `NEXT_PUBLIC_MANAGER_ANALYTICS_KEY` | analytics | `mak_…` |

**The `NEXT_PUBLIC_` block is required for the browser half, not optional.** Next.js
only inlines `NEXT_PUBLIC_*` into the client bundle — `process.env` in browser code is
an empty object, so reading the `MANAGER_*` values from a `"use client"` module always
yields nothing and the browser logger never starts. Use the project's **client** key
(`mck_…`) there: Manager derives each entry's `source` from the key kind.

`MANAGER_ENDPOINT` is Manager's own base URL (`http://127.0.0.1:3300` for a local Manager).
It is easy to get backwards and point it at this app's dev port, which makes every log
POST fail silently.

What gets wired up:

- **Every server error path** in `src/app/api/**/route.js` already called
  `console.error` (and the two refresh-token-reuse `console.warn`s); each now also
  calls `logServerError` / `managerLog` from `src/lib/manager/index.js`, so the same
  failures land in Manager. The `console.*` output is unchanged. This app has no
  logger of its own, so `src/lib/manager/index.js` is the single entry point — no
  app-wide logging layer was introduced.
- **Unhandled crashes and rejections in the browser**, plus browser `console.warn` /
  `console.error`, are captured by the SDK.
- **Analytics**: one script tag is injected client-side, tracking pageviews (SPA routes
  included), click targets, referrers and UTM params. `src/proxy.js` adds the Manager
  origin to the CSP `connect-src` when `NEXT_PUBLIC_MANAGER_ENDPOINT` is set, otherwise
  the strict policy would silently block the tracker and the browser logger.

Refresh the vendored SDK (one file, zero dependencies):

```bash
curl -fsSL -H "x-manager-key: $MANAGER_LOG_KEY" \
  "http://127.0.0.1:3300/api/sdk/logger?format=js" -o src/lib/manager/logger.js
```

Verify the wiring against a running Manager:

```bash
npm run manager:check   # needs MANAGER_ENDPOINT, MANAGER_LOG_KEY, MANAGER_ANALYTICS_KEY
```

It posts one log and one event through the real endpoints, asserts the right key kinds
are accepted and the wrong ones are refused, then hits this app's own
`POST /api/auth/refresh` error path.

### Delivery tuning

Server logs do **not** flush on every write. `src/lib/manager/index.js` sets the SDK's
`flushIntervalMs` to 250ms, so a burst of N log lines becomes one HTTP request instead of
N. The window is deliberately short: serverless runtimes can freeze timers after a
response is sent, which would strand anything still sitting in the batch.

`error` and `fatal` skip the window with a leading-edge flush — sent immediately, but no
more than once per 100ms, with a trailing flush so a burst of 50 errors costs ~2 requests
rather than 50.

Measured with `node scripts/measure-log-delivery.mjs 200` (200 entries, one in ten at
`error`):

```
ingest requests    : 11
entries delivered  : 201      (200 + manager_logger_started)
entries/request    : 18.3
sdk dropped       : 0
```

`getManagerDroppedCount()` reports entries this client discarded (its own rate limit or
queue overflow). The SDK raises the same condition as a `warn` entry named
`manager_sdk_dropped_entries`, so client-side loss shows up in the log viewer instead of
vanishing.

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
