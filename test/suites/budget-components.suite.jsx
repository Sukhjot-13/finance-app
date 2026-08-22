// test/suites/budget-components.suite.jsx
// BudgetProgress (B1 error/retry) + BudgetManager (B2 load-error banner, U2 escape)
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BudgetProgress from "@/components/BudgetProgress";
import BudgetManager from "@/components/BudgetManager";
import { UserContext } from "@/app/(main)/layout";

const apiResponse = (body, ok = true) => ({
  ok,
  json: async () => body,
});

const renderWithUser = (ui) =>
  render(<UserContext.Provider value={{ user: { currency: "USD" } }}>{ui}</UserContext.Provider>);

beforeEach(() => {
  globalThis.__apiMock.mockReset();
});

describe("BudgetProgress (B1: failures are visible + retryable)", () => {
  const PROGRESS_URL = /\/api\/reports\/budget-progress/;

  it("renders overall + per-category bars on success", async () => {
    globalThis.__apiMock.mockImplementationOnce(async () =>
      apiResponse({
        overall: { budget: 1000, spent: 500, percentage: 50, overBudget: false },
        progress: [{ category: "Food", budget: 400, spent: 380, percentage: 95, overBudget: false }],
        totalSpent: 500,
        excludedSpent: 25,
      })
    );

    renderWithUser(<BudgetProgress />);

    await waitFor(() => expect(screen.getByText("Overall Monthly Budget")).toBeTruthy());
    expect(screen.getByText("$500.00 / $1,000.00")).toBeTruthy();
    expect(screen.getByText("By Category")).toBeTruthy();
    // exclusion note renders
    expect(screen.getByText(/excl\. \$25\.00 in one-time expenses/)).toBeTruthy();
  });

  it("shows an explicit error banner with Retry instead of vanishing (B1)", async () => {
    globalThis.__apiMock.mockImplementationOnce(async () => {
      throw new Error("network down");
    });

    renderWithUser(<BudgetProgress />);

    const retry = await screen.findByText("Retry");
    expect(screen.getByText(/Couldn't load your budgets/)).toBeTruthy();

    // Retry refetches and recovers into a normal render
    globalThis.__apiMock.mockImplementationOnce(async () =>
      apiResponse({
        overall: { budget: 100, spent: 10, percentage: 10, overBudget: false },
        progress: [],
        totalSpent: 10,
        excludedSpent: 0,
      })
    );
    fireEvent.click(retry);

    await waitFor(() =>
      expect(screen.getByText("Overall Monthly Budget")).toBeTruthy()
    );
  });

  it("returns null when there is genuinely nothing to show", async () => {
    globalThis.__apiMock.mockImplementationOnce(async () =>
      apiResponse({ overall: null, progress: [], totalSpent: 0, excludedSpent: 0 })
    );
    const { container } = renderWithUser(<BudgetProgress />);
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });
});

describe("BudgetManager (B2 load errors, U2 Escape)", () => {
  const open = (props = {}) => renderWithUser(<BudgetManager isOpen onClose={() => {}} {...props} />);

  beforeEach(() => {
    globalThis.__apiMock.mockImplementation(async (url) => {
      if (url.includes("/api/categories")) {
        return apiResponse({ expense: ["Food", "Transport"], income: [], allCustom: [] });
      }
      if (url.startsWith("/api/budgets")) {
        return apiResponse([
          { category: "__total__", amount: 500 },
          { category: "Food", amount: 200 },
        ]);
      }
      return apiResponse({}, false);
    });
  });

  it("renders overall + per-category inputs pre-filled from the server", async () => {
    open();
    expect(await screen.findByDisplayValue("500")).toBeTruthy();
    expect(await screen.findByDisplayValue("200")).toBeTruthy();
  });

  it("shows a load-error banner with Retry — never an empty form (B2)", async () => {
    globalThis.__apiMock.mockReset();
    globalThis.__apiMock.mockRejectedValue(new Error("db down"));

    open();
    const retry = await screen.findByText("Retry");
    expect(screen.getByText(/Couldn't load your budgets/)).toBeTruthy();
    // save button hidden while the drawer couldn't load anything
    expect(screen.queryByText("Save Budgets")).toBeNull();

    // recovery path re-runs the loads
    globalThis.__apiMock.mockImplementation(async (url) => {
      if (url.includes("/api/categories"))
        return apiResponse({ expense: ["Food"], income: [] , allCustom: []});
      return apiResponse([{ category: "__total__", amount: 300 }]);
    });
    fireEvent.click(retry);
    expect(await screen.findByDisplayValue("300")).toBeTruthy();
    expect(await screen.findByText("Save Budgets")).toBeTruthy();
  });

  it("Escape closes via the shared overlay hook (U2/U3)", async () => {
    const onClose = vi.fn();
    renderWithUser(<BudgetManager isOpen onClose={onClose} />);
    await screen.findByDisplayValue("500");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("dialog semantics present (U3)", () => {
    const { container } = open();
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("saving DELETES budgets whose fields were cleared", async () => {
    const calls = [];
    globalThis.__apiMock.mockReset();
    globalThis.__apiMock.mockImplementation(async (url, opts = {}) => {
      calls.push({ url, method: opts.method || "GET" });
      if (url.includes("/api/categories"))
        return apiResponse({ expense: ["Food"], income: [], allCustom: [] });
      if (opts.method === "DELETE") return apiResponse({ message: "ok" });
      return apiResponse([{ category: "Food", amount: 200 }]);
    });

    open();
    const foodInput = await screen.findByLabelText("Food budget");
    fireEvent.change(foodInput, { target: { value: "" } }); // cleared!

    fireEvent.click(screen.getByText("Save Budgets"));
    await waitFor(() =>
      expect(
        calls.some((c) => c.method === "DELETE" && c.url.includes("category=Food"))
      ).toBe(true)
    );
    // and no upsert was attempted for the cleared category
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });
});
