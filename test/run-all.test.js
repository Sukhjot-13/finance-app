// test/run-all.test.js
//
// THE single vitest entry point. `npm test` runs only this file; it imports
// every suite under ./suites/ so the whole site's tests execute in one go.
//
// Shared module mocks live HERE (not per-suite): everything composes into a
// single module graph, so each mock is registered once as an identical,
// behavior-delegating factory. Suites configure behavior by assigning
// globalThis handlers in beforeEach — never by re-registering mocks.

process.env.ACCESS_TOKEN_SECRET =
  process.env.ACCESS_TOKEN_SECRET || "test-access-secret-for-vitest-0123456789";
process.env.REFRESH_TOKEN_SECRET =
  process.env.REFRESH_TOKEN_SECRET || "test-refresh-secret-for-vitest-fedcba9876";
process.env.MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/fintrack-test";
process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || "test-brevo-key";
process.env.EMAIL_FROM = process.env.EMAIL_FROM || "test@example.com";

import { vi } from "vitest";

// ---- lib/mongodb: dbConnect is always a no-op in tests ----
vi.mock("@/lib/mongodb", () => ({
  default: (...args) => globalThis.__dbConnect(...args),
}));

// ---- next/headers: cookie store is delegated ----
vi.mock("next/headers", () => ({
  cookies: (...args) => globalThis.__cookiesStore(...args),
}));

// ---- lib/auth: keep every REAL export; only verifySession delegates ----
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    verifySession: (...args) => globalThis.__verifySessionImpl(...args),
  };
});

// ---- models: stable singleton mocks (identity never changes; suites
//      reconfigure methods per test) ----
vi.mock("@/models/transaction.model", () => ({
  default: globalThis.__models.transaction,
}));
vi.mock("@/models/category.model", () => ({
  default: globalThis.__models.category,
}));
vi.mock("@/models/budget.model", () => ({
  default: globalThis.__models.budget,
}));
vi.mock("@/models/user.model", () => ({
  default: globalThis.__models.user,
}));
vi.mock("@/models/ratelimit.model", () => ({
  default: globalThis.__models.rateLimit,
}));

// ---- client fetch wrapper ----
vi.mock("@/lib/api", () => ({
  default: (...args) => globalThis.__apiMock(...args),
}));

// ---- app router hooks ----
vi.mock("next/navigation", () => ({
  useRouter: () => globalThis.__mockRouter(),
  usePathname: () =>
    typeof globalThis.__pathname === "string" ? globalThis.__pathname : "/dashboard",
}));

// ---- Brevo SDK (constructed inside route handlers) ----
vi.mock("@getbrevo/brevo", () => ({
  TransactionalEmailsApi: class {
    constructor() {
      return globalThis.__brevoClient;
    }
    authentications = { apiKey: {} };
  },
  SendSmtpEmail: class {
    constructor() {
      return {};
    }
  },
}));

// ---- Chart stack for SimpleChart ----
vi.mock("chart.js", () => ({
  Chart: { register: () => {} },
  ArcElement: function ArcElement() {},
  Tooltip: function Tooltip() {},
  Legend: function Legend() {},
}));
vi.mock("react-chartjs-2", () => ({
  Pie: (props) => globalThis.__pieComponent(props),
}));

// ------------------------------------------------------------------
// Import every suite. Order: pure libs → proxy/models → API routes →
// components. Each suite fully controls its own behavior via
// globalThis handlers and resets them in beforeEach.
// ------------------------------------------------------------------
await Promise.all([
  import("./suites/utils.suite.js"),
  import("./suites/auth-lib.suite.js"),
  import("./suites/api-client.suite.js"),
  import("./suites/server-utils.suite.js"),
  import("./suites/rate-limit.suite.js"),
  import("./suites/dialog-a11y.suite.jsx"),
  import("./suites/proxy.suite.js"),
  import("./suites/models.suite.js"),
  import("./suites/api-auth.suite.js"),
  import("./suites/api-user.suite.js"),
  import("./suites/api-transactions.suite.js"),
  import("./suites/api-categories.suite.js"),
  import("./suites/api-budgets.suite.js"),
  import("./suites/api-reports.suite.js"),
  import("./suites/budget-components.suite.jsx"),
  import("./suites/overlay-components.suite.jsx"),
  import("./suites/page-components.suite.jsx"),
]);
