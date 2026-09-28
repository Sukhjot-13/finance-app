// test/suites/page-components.suite.jsx
// Header dropdown two-step logout (U1), welcome skip → onboarding flag (B3),
// login resend cooldown, transactions page-clamp after delete (B4).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import MainLayout from "@/app/(main)/layout";
import { UserContext } from "@/app/(main)/layout";
import WelcomePage from "@/app/(auth)/welcome/page";
import LoginPage from "@/app/(auth)/login/page";
import TransactionsPage, { EditTransactionModal } from "@/app/(main)/transactions/page";
import ReportsPage from "@/app/(main)/reports/page";

const apiResponse = (body, ok = true) => ({ ok, json: async () => body });

beforeEach(() => {
  globalThis.__apiMock.mockReset();
  globalThis.__pathname = "/dashboard";
  try {
    sessionStorage.clear();
  } catch {
  }
});

describe("ProfileDropdown — logout failure is surfaced, not swallowed", () => {
  const openMenuAndConfirm = async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByText("Logout"));
    fireEvent.click(await screen.findByText("Yes, log out"));
  };

  it("a 200 with revoked:false still leaves, but warns about other devices", async () => {
    globalThis.__apiMock.mockImplementation(async (url) => {
      if (url === "/api/user") return apiResponse({ accountName: "Sukh", currency: "USD" });
      if (url === "/api/auth/logout") {
        return apiResponse({
          message: "Signed out on this device, but the server could not end your session.",
          revoked: false,
          code: "SERVER_REVOKE_FAILED",
        });
      }
      return apiResponse({});
    });

    render(<MainLayout><div>page</div></MainLayout>);
    await openMenuAndConfirm();

    await waitFor(() =>
      expect(globalThis.__router.push).toHaveBeenCalledWith("/login")
    );
    // The partial-revoke warning is handed to /login so the user learns their
    // other devices are still signed in.
    expect(sessionStorage.getItem("fintrack:logoutWarning")).toMatch(/could not end your session/i);
  });

  it("a NON-OK response does NOT navigate and shows an inline message", async () => {
    globalThis.__apiMock.mockImplementation(async (url) => {
      if (url === "/api/user") return apiResponse({ accountName: "Sukh", currency: "USD" });
      if (url === "/api/auth/logout") {
        return { ok: false, status: 503, json: async () => ({ message: "nope" }) };
      }
      return apiResponse({});
    });

    render(<MainLayout><div>page</div></MainLayout>);
    await openMenuAndConfirm();

    // api() RESOLVES on non-ok responses — the old code navigated anyway and
    // discarded the failure entirely.
    await waitFor(() =>
      expect(screen.getByText(/reach the server to log you out/)).toBeTruthy()
    );
    expect(globalThis.__router.push).not.toHaveBeenCalledWith("/login");
  });

  it("a thrown (transient) failure does NOT navigate", async () => {
    globalThis.__apiMock.mockImplementation(async (url) => {
      if (url === "/api/user") return apiResponse({ accountName: "Sukh", currency: "USD" });
      if (url === "/api/auth/logout") throw new Error("network down");
      return apiResponse({});
    });

    render(<MainLayout><div>page</div></MainLayout>);
    await openMenuAndConfirm();

    await waitFor(() =>
      expect(screen.getByText(/reach the server to log you out/)).toBeTruthy()
    );
    expect(globalThis.__router.push).not.toHaveBeenCalledWith("/login");
  });

  it("the login page renders a stashed logout warning and clears it", async () => {
    sessionStorage.setItem(
      "fintrack:logoutWarning",
      "Signed out on this device, but the server could not end your session."
    );
    globalThis.__apiMock.mockImplementation(async () => ({
      ok: false,
      json: async () => ({}),
    }));

    render(<LoginPage />);

    expect(
      await screen.findByText(/server could not end your session/i)
    ).toBeTruthy();
    // One-shot: it must not survive into the next visit.
    expect(sessionStorage.getItem("fintrack:logoutWarning")).toBeNull();
  });
});

describe("MainLayout — mobile drawer dialog a11y", () => {
  it("exposes dialog semantics, locks scroll, and closes on Escape", async () => {
    globalThis.__apiMock.mockImplementation(async (url) => {
      if (url === "/api/user") return apiResponse({ accountName: "Sukh", currency: "USD" });
      return apiResponse({});
    });

    const { container } = render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    );
    await screen.findByText("Content");

    fireEvent.click(screen.getByLabelText("Toggle menu"));

    const dialog = await waitFor(() => {
      const el = container.querySelector('[role="dialog"][aria-label="Navigation"]');
      expect(el).toBeTruthy();
      return el;
    });
    expect(dialog.getAttribute("aria-modal")).toBe("true");

    // Body scroll lock, same shared hook the drawers use.
    await waitFor(() => expect(document.body.style.overflow).toBe("hidden"));

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(container.querySelector('[aria-label="Navigation"]')).toBeNull();
    });
    expect(document.body.style.overflow).not.toBe("hidden");
  });
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
    await waitFor(() => expect(globalThis.__router.replace).toHaveBeenCalledWith("/dashboard"));
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
    expect(globalThis.__router.replace).not.toHaveBeenCalled();
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
    expect(globalThis.__router.replace).toHaveBeenCalledWith("/dashboard");
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

  it("the ENTIRE filter bar is labelled (search, both selects, both date inputs)", async () => {
    globalThis.__pathname = "/transactions";
    globalThis.__apiMock.mockImplementation(async (url) => {
      if (url.startsWith("/api/categories")) {
        return apiResponse({ expense: ["Food"], income: [] });
      }
      if (url.startsWith("/api/transactions?")) {
        return apiResponse({
          transactions: [txn("a1", "first")],
          total: 1,
          page: 1,
          totalPages: 1,
        });
      }
      return apiResponse({}, false);
    });

    render(
      <UserContext.Provider value={{ user: { currency: "USD" } }}>
        <TransactionsPage />
      </UserContext.Provider>
    );

    expect(await screen.findByLabelText("Search transactions")).toBeTruthy();
    expect(screen.getByLabelText("Filter by type")).toBeTruthy();
    expect(screen.getByLabelText("Filter by category")).toBeTruthy();
    // The date inputs previously had only a `title` (no accessible name).
    expect(screen.getByLabelText("Filter by start date")).toBeTruthy();
    expect(screen.getByLabelText("Filter by end date")).toBeTruthy();
  });

  it("a failed refresh after a successful save shows a banner", async () => {
    globalThis.__pathname = "/transactions";
    let listCalls = 0;
    globalThis.__apiMock.mockImplementation(async (url, opts = {}) => {
      if (url.startsWith("/api/categories")) {
        return apiResponse({ expense: ["Food"], income: [] });
      }
      if (/\/api\/transactions\/a1$/.test(url) && opts.method === "PUT") {
        return apiResponse({ message: "saved" });
      }
      if (url.startsWith("/api/transactions?")) {
        listCalls += 1;
        if (listCalls === 1) {
          return apiResponse({
            transactions: [txn("a1", "first")],
            total: 1,
            page: 1,
            totalPages: 1,
          });
        }
        // The post-save refetch fails.
        throw new Error("network down");
      }
      return apiResponse({}, false);
    });

    render(
      <UserContext.Provider value={{ user: { currency: "USD" } }}>
        <TransactionsPage />
      </UserContext.Provider>
    );

    await screen.findAllByText("first");
    fireEvent.click(screen.getByLabelText("Edit transaction"));

    fireEvent.change(await screen.findByLabelText("Amount"), {
      target: { value: "9.99" },
    });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "edited" },
    });
    fireEvent.click(screen.getByText("Save Changes"));

    // The old code ended refetchCurrentPage() in `.catch(console.error)` — no
    // banner, so the user kept staring at the pre-edit list.
    expect(
      await screen.findByText("Your change was saved, but the list couldn't be refreshed.")
    ).toBeTruthy();
  });
});

describe("EditTransactionModal — labelled fields", () => {
  it("pairs every label with its control and groups the type toggle", async () => {
    globalThis.__apiMock.mockImplementation(async () =>
      apiResponse({ expense: ["Food"], income: ["Salary"], allCustom: [] })
    );
    const { container } = render(
      <UserContext.Provider value={{ user: { currency: "USD" } }}>
        <EditTransactionModal
          transaction={{
            _id: "t1",
            type: "expense",
            amount: 5,
            category: "Food",
            date: "2026-08-01T12:00:00Z",
            description: "snack",
            excludeFromBudget: false,
          }}
          onClose={() => {}}
          onSave={() => {}}
        />
      </UserContext.Provider>
    );

    for (const name of [
      "Amount",
      "Category",
      "Date",
      "Description",
      "New Category Name",
    ]) {
      if (name === "New Category Name") {
        fireEvent.change(screen.getByLabelText("Category"), {
          target: { value: "add_new" },
        });
      }
      expect(screen.getByLabelText(name)).toBeTruthy();
    }

    const group = container.querySelector('[role="group"][aria-label="Transaction type"]');
    expect(group).toBeTruthy();
    expect(group.querySelectorAll("button").length).toBe(2);
  });
});

describe("ReportsPage — the two previously-unreachable API surfaces now have UI", () => {
  it("exposes an Export CSV button wired to /api/reports/export", async () => {
    const blobs = [];
    globalThis.URL.createObjectURL = vi.fn(() => "blob:fake");
    globalThis.URL.revokeObjectURL = vi.fn();
    globalThis.__apiMock.mockImplementation(async (url) => {
      if (url.startsWith("/api/reports/export")) {
        blobs.push(url);
        return {
          ok: true,
          blob: async () => ({ size: 12, type: "text/csv" }),
        };
      }
      return apiResponse({});
    });

    render(
      <UserContext.Provider value={{ user: { currency: "USD" } }}>
        <ReportsPage />
      </UserContext.Provider>
    );

    const button = await screen.findByRole("button", { name: /Export CSV/ });
    fireEvent.click(button);

    await waitFor(() => expect(blobs.length).toBe(1));
    // The selected month window is forwarded as absolute instants.
    expect(blobs[0]).toContain("start=");
    expect(blobs[0]).toContain("end=");
  });

  it("surfaces an export failure instead of failing silently", async () => {
    globalThis.__apiMock.mockImplementation(async (url) => {
      if (url.startsWith("/api/reports/export")) {
        return { ok: false, json: async () => ({ message: "Invalid date range." }) };
      }
      return apiResponse({});
    });

    render(
      <UserContext.Provider value={{ user: { currency: "USD" } }}>
        <ReportsPage />
      </UserContext.Provider>
    );

    fireEvent.click(await screen.findByRole("button", { name: /Export CSV/ }));
    expect(await screen.findByText("Invalid date range.")).toBeTruthy();
  });

  it("renders the recurring-transaction manager", async () => {
    globalThis.__apiMock.mockImplementation(async (url) => {
      if (url === "/api/recurring") {
        return apiResponse({
          rules: [
            {
              _id: "r1",
              type: "expense",
              amount: 1200,
              category: "Rent",
              frequency: "monthly",
              dayOfMonth: 1,
              nextRunAt: "2026-10-01T00:00:00.000Z",
              active: true,
            },
          ],
        });
      }
      if (url === "/api/categories") {
        return apiResponse({ expense: ["Food"], income: ["Salary"] });
      }
      return apiResponse({});
    });

    render(
      <UserContext.Provider value={{ user: { currency: "USD" } }}>
        <ReportsPage />
      </UserContext.Provider>
    );

    expect(await screen.findByText("Recurring Transactions")).toBeTruthy();
    expect(await screen.findByText("Rent")).toBeTruthy();
    // Labelled form controls (same id/htmlFor convention as the rest of the app).
    expect(screen.getByLabelText("Amount")).toBeTruthy();
    expect(screen.getByLabelText("Category")).toBeTruthy();
    expect(screen.getByLabelText("Repeats")).toBeTruthy();
  });

  it("creates a rule through POST /api/recurring", async () => {
    const posts = [];
    globalThis.__apiMock.mockImplementation(async (url, opts = {}) => {
      if (url === "/api/recurring" && opts.method === "POST") {
        posts.push(JSON.parse(opts.body));
        return apiResponse({ rule: { _id: "r2" } });
      }
      if (url === "/api/recurring") return apiResponse({ rules: [] });
      if (url === "/api/categories") {
        return apiResponse({ expense: ["Food", "Rent"], income: ["Salary"] });
      }
      return apiResponse({});
    });

    render(
      <UserContext.Provider value={{ user: { currency: "USD" } }}>
        <ReportsPage />
      </UserContext.Provider>
    );

    fireEvent.change(await screen.findByLabelText("Amount"), {
      target: { value: "1200" },
    });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "Rent" } });
    fireEvent.click(screen.getByText("Add Rule"));

    await waitFor(() => expect(posts.length).toBe(1));
    expect(posts[0]).toMatchObject({
      type: "expense",
      amount: 1200,
      category: "Rent",
      frequency: "monthly",
    });
  });
});

describe("MainLayout — Navigation & Mobile Drawer", () => {
  it("renders desktop navigation and starts with mobile drawer closed by default", async () => {
    globalThis.__apiMock.mockImplementation(async (url) => {
      if (url === "/api/user") return apiResponse({ accountName: "Sukhjot", currency: "USD" });
      return apiResponse({});
    });

    render(
      <MainLayout>
        <div>Content</div>
      </MainLayout>
    );

    // Desktop nav items are rendered
    expect(await screen.findByText("Content")).toBeTruthy();
    expect(screen.getByText("Finance Pro")).toBeTruthy();

    // On mobile phone, drawer is closed by default (no close button initially)
    expect(screen.queryByLabelText("Close sidebar")).toBeNull();

    // Clicking the toggle button opens the drawer
    const toggleButton = screen.getByLabelText("Toggle menu");
    fireEvent.click(toggleButton);

    // Now the mobile close button is visible
    const closeButton = await screen.findByLabelText("Close sidebar");
    expect(closeButton).toBeTruthy();

    // Clicking close button closes the mobile drawer
    fireEvent.click(closeButton);
    await waitFor(() => {
      expect(screen.queryByLabelText("Close sidebar")).toBeNull();
    });
  });
});

