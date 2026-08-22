// src/lib/api.js
//
// Fetch wrapper with automatic token refresh.
//
// Guarantees:
// - Each request retries at most ONCE after a refresh (no loops/deadlocks).
// - Concurrent 401s share one refresh (single-flight queue within this tab).
// - Refreshes are serialized ACROSS tabs via the Web Locks API when
//   available, so parallel tabs never race each other into stale tokens.
// - Only a DEFINITIVE refresh rejection (HTTP 401 — server cleared our
//   cookies) redirects to /login. Network errors and 5xx are treated as
//   transient: the error propagates to the caller's inline UI instead of
//   force-logging the user out during a backend blip.

let isRefreshing = false;
let failedQueue = [];

/**
 * Resolves (success) or rejects (failure) every request queued behind the
 * in-flight refresh. `outcome === null` means success.
 */
const processQueue = (outcome) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (outcome) reject(outcome.error);
    else resolve();
  });
  failedQueue = [];
};

/**
 * Runs one refresh call, serialized against other tabs when the browser
 * supports the Web Locks API. Returns the refresh Response.
 */
const refreshSingleFlight = () => {
  const doRefresh = () =>
    fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request("fintrack-auth-refresh", doRefresh);
  }
  return doRefresh();
};

const api = async (url, options = {}) => {
  const doFetch = () => fetch(url, options);
  const markRetried = () => {
    // Guard flag: this request has already had its one refresh+retry.
    options._authRetried = true;
  };

  let res = await doFetch();

  if (res.status !== 401 || url === "/api/auth/refresh") {
    return res;
  }

  // Already retried once — hand back the 401 rather than looping forever.
  if (options._authRetried) {
    return res;
  }

  // Another refresh is in flight in this tab — queue behind it and retry
  // exactly once when it settles.
  if (isRefreshing) {
    await new Promise((resolve, reject) => failedQueue.push({ resolve, reject }));
    markRetried();
    return doFetch();
  }

  isRefreshing = true;
  let outcome = null; // null = refresh succeeded
  try {
    try {
      const refreshRes = await refreshSingleFlight();
      if (refreshRes.status === 401) {
        // Definitive: server rejected the refresh token and cleared cookies.
        outcome = { redirect: true };
      } else if (!refreshRes.ok) {
        // 5xx etc. — transient infrastructure trouble, NOT a logout.
        outcome = {
          error: new Error("Could not refresh session. Please try again."),
        };
      }
    } catch {
      // Network error reaching the refresh endpoint — also transient.
      outcome = {
        error: new Error("Network error while refreshing session."),
      };
    }
    processQueue(outcome);
  } finally {
    isRefreshing = false;
  }

  if (outcome?.redirect) {
    window.location.href = "/login";
    throw new Error("Session expired");
  }
  if (outcome?.error) {
    throw outcome.error;
  }

  markRetried();
  return doFetch();
};

export default api;
