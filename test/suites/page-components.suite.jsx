// test/suites/page-components.suite.jsx
// Header dropdown two-step logout (U1), welcome skip → onboarding flag (B3),
// login resend cooldown, transactions page-clamp after delete (B4).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import MainLayout from "@/app/(main)/layout";
import { UserContext } from "@/app/(main)/layout";
import WelcomePage from "@/app/(auth)/welcome/page";
import LoginPage from "@/app/(auth)/login/page";
import TransactionsPage from "@/app/(main)/transactions/page";

const apiResponse = (body, ok = true) => ({ ok, json: async () => body });

beforeEach(() => {
  globalThis.__apiMock.mockReset();
  globalThis.__pathname = "/dashboard";
});

describe("ProfileDropdown — two-step logout confirmation (U1)", () => {
  it("does NOT log out until the user confirms; Cancel aborts", async () => {
    const calls = [];
    globalThis.__apiMock.mockImplementation(async (url, opts = {}) => {
      calls.push({ url, method: opts.method || "GET" });
      if (url === "/api/user") return apiResponse({ accountName: "Sukh", currency: "USD" });
      return apiResponse({ message: "ok" });
    });

    render(<MainLayout><div>page</div></MainLayout>);

    // open the account menu
    fireEvent.click(await screen.findByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByText("Logout"));

    // confirmation UI appears; nothing has been sent yet
    expect(await screen.findByText(/Log out of FinTrack on this device/)).toBeTruthy();
    expect(calls.some((c) => c.url === "/api/auth/logout")).toBe(false);

    // cancel path
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText(/Yes, log out/)).toBeNull();

    // confirm path actually logs out and navigates away
    fireEvent.click(screen.getByText("Logout"));
    fireEvent.click(screen.getByText("Yes, log out"));
    await waitFor(() =>
      expect(calls.some((c) => c.url === "/api/auth/logout")).toBe(true)
    );
    await waitFor(() => expect(globalThis.__router.push).toHaveBeenCalledWith("/login"));
  });
});

describe("WelcomePage — skip means skip (B3)", () => {
  it("Skip marks onboarding complete via PUT then navigates to dashboard", async () => {
    const bodies = [];
    globalThis.__apiMock.mockImplementation(async (url, opts = {}) => {
      if (opts.body) bodies.push(JSON.parse(opts.body));
      return apiResponse({});
    });

    render(<WelcomePage />);
    fireEvent.click(screen.getByText("Skip for now"));

    await waitFor(() => expect(bodies).toEqual([{ onboarded: true }]));
    await waitFor(() => expect(globalThis.__router.push).toHaveBeenCalledWith("/dashboard"));
  });

  it("saving a name also completes onboarding in one call", async () => {
    const bodies = [];
    globalThis.__apiMock.mockImplementation(async (url, opts = {}) => {
      if (opts.body) bodies.push(JSON.parse(opts.body));
      return apiResponse({});
    });

    render(<WelcomePage />);
    fireEvent.change(screen.getByLabelText("Account Name"), {
      target: { value: "My Finances" },
    });
    fireEvent.click(screen.getByText("Continue to Dashboard"));

    await waitFor(() =>
      expect(bodies).toEqual([{ accountName: "My Finances", onboarded: true }])
    );
  });

  it("server errors surface inline instead of navigating", async () => {
    globalThis.__apiMock.mockImplementation(async () => ({
      ok: false,
      json: async () => ({ message: "Name too long" }),
    }));

    render(<WelcomePage />);
    fireEvent.change(screen.getByLabelText("Account Name"), {
      target: { value: "X" },
    });
    fireEvent.click(screen.getByText("Continue to Dashboard"));

    expect(await screen.findByText("Name too long")).toBeTruthy();
    expect(globalThis.__router.push).not.toHaveBeenCalled();
  });
});

describe("LoginPage — OTP step + resend cooldown", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const setupFetch = () => {
    const fetchCalls = [];
    const fetchMock = vi.fn(async (url) => {
      fetchCalls.push(String(url));
      if (String(url).includes("/api/auth/otp/send")) {
        return { ok: true, json: async () => ({}) };
      }
      if (String(url).includes("/api/user")) {
        // session check: not authenticated → stay on the login form
        return { ok: false, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({ isNewUser: false }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    return { fetchCalls };
  };

  // Fake timers break RTL's async waitFor helpers, so this helper uses
  // synchronous queries + explicit microtask flushes instead.
  const reachOtpStep = async () => {
    const { fetchCalls } = setupFetch();
    render(<LoginPage />);

    await act(async () => {}); // session check resolves → form shows
    fireEvent.change(screen.getByPlaceholderText("Email address"), {
      target: { value: "sukh@example.com" },
    });
    fireEvent.click(screen.getByText("Send Code"));
    await act(async () => {}); // send request resolves → step 2

    expect(screen.getByPlaceholderText("______")).toBeTruthy();
    return { fetchCalls };
  };

  it("starts a 30s resend cooldown that counts down to an enabled button", async () => {
    vi.useFakeTimers();
    await reachOtpStep();

    expect(screen.getByText(/Resend code in 30s/)).toBeTruthy();
    const resendBtn = screen.getByText(/Resend code in 30s/);
    expect(resendBtn.disabled).toBe(true);

    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    const enabled = screen.getByText("Resend code");
    expect(enabled.disabled).toBe(false);
  });

  it("auto-submits at exactly 6 digits and routes returning users to /dashboard", async () => {
    vi.useFakeTimers();
    const { fetchCalls } = await reachOtpStep();

    const otpInput = screen.getByPlaceholderText("______");
    fireEvent.change(otpInput, { target: { value: "1234567" } }); // extra digits filtered
    expect(otpInput.value).toBe("123456");

    await act(async () => {
      vi.advanceTimersByTime(300); // deferred auto-submit (~100ms)
      // flush the verify request + redirect
      vi.advanceTimersByTime(0);
    });

    expect(fetchCalls.some((u) => u.includes("/api/auth/otp/verify"))).toBe(true);
    expect(globalThis.__router.push).toHaveBeenCalledWith("/dashboard");
  });

  it("'Use a different email' resets cleanly to step 1", async () => {
    vi.useFakeTimers();
    await reachOtpStep();

    fireEvent.click(screen.getByText("Use a different email"));
    expect(screen.getByPlaceholderText("Email address")).toBeTruthy();
  });
});

describe("TransactionsPage — page clamp after deleting last row of a page (B4)", () => {
  const txn = (id, desc) => ({
    _id: id,
    type: "expense",
    amount: 5,
    category: "Food",
    date: "2026-08-01T12:00:00Z",
    description: desc,
  });

  it("deleting the only row on page 2 steps back to page 1 instead of an empty page", async () => {
    const txnsCalls = [];
    globalThis.__apiMock.mockImplementation(async (url, opts = {}) => {
      if (url.startsWith("/api/categories")) {
        return apiResponse({ expense: [], income: [] });
      }
      if (url.startsWith("/api/transactions?")) {
        txnsCalls.push(url);
        if (/page=2/.test(url)) {
          return apiResponse({
            transactions: [txn("t-last", "the last row")],
            total: 51,
            page: 2,
            totalPages: 2,
          });
        }
        return apiResponse({
          transactions: [txn("a1", "first"), txn("a2", "second")],
          total: 51,
          page: 1,
          totalPages: 2,
        });
      }
      if (/\/api\/transactions\/t-last$/.test(url)) {
        return apiResponse({ message: "deleted" });
      }
      return apiResponse({}, false);
    });

    // start on page 2
    globalThis.__pathname = "/transactions";
    const { rerender } = render(
      <UserContext.Provider value={{ user: { currency: "USD" } }}>
        <TransactionsPage />
      </UserContext.Provider>
    );
    void rerender;

    // simulate being on page 2 by clicking Next once
    fireEvent.click(await screen.findByText("Next"));
    // table + mobile card render the same rows → duplicate matches are fine
    expect((await screen.findAllByText("the last row")).length).toBeGreaterThan(0);

    // delete the only row on this page (two Delete buttons; same handler)
    const callsBeforeDelete = txnsCalls.length;
    fireEvent.click(screen.getAllByTitle("Delete")[0]);
    fireEvent.click(screen.getAllByText("Confirm")[0]);

    // clamp → refetch happens for PAGE 1 (not an empty page-2 refetch)
    await waitFor(() => {
      expect(txnsCalls.length).toBeGreaterThan(callsBeforeDelete);
    });
    expect(
      txnsCalls.slice(callsBeforeDelete).some((u) => /page=1&/.test(u))
    ).toBe(true);
    await screen.findAllByText("first");
  });
});
