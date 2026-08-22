// test/helpers/setup.js
//
// Global test setup: stable globalThis mock singletons + DOM API stubs.
// The delegating vi.mock factories in run-all.test.js forward to these, and
// suites reconfigure them per-test (identity stays constant).

import { vi } from "vitest";
import { makeModelsRegistry } from "./mocks.js";

globalThis.__models = makeModelsRegistry();

globalThis.__dbConnect = vi.fn(async () => ({}));

globalThis.__cookiesStore = vi.fn(() => ({
  get: vi.fn(() => undefined),
  set: vi.fn(),
  delete: vi.fn(),
}));

// Default: behave like the real verifySession's "no tokens" branch.
globalThis.__verifySessionImpl = vi.fn(async () => ({
  user: null,
  error: "Missing tokens",
  status: 401,
}));

globalThis.__apiMock = vi.fn(async () => {
  throw new Error("api() mock not configured for this test");
});

const defaultRouter = { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() };
globalThis.__router = defaultRouter;
globalThis.__mockRouter = () => defaultRouter;
globalThis.__pathname = "/dashboard";

globalThis.__pieComponent = () => null;

globalThis.__brevoClient = {
  authentications: { apiKey: {} },
  sendTransacEmail: vi.fn(async () => ({})),
};

// ---- DOM stubs for framer-motion / jsdom gaps ----
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
  if (!window.scrollTo) {
    window.scrollTo = () => {};
  }
}
