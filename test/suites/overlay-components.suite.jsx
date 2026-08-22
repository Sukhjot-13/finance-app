// test/suites/overlay-components.suite.jsx
// AddTransactionDrawer + EditTransactionModal — dialog semantics, Escape,
// error surfacing inside the modal (page banners would hide behind overlay).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AddTransactionDrawer from "@/components/AddTransactionDrawer";
import { EditTransactionModal } from "@/app/(main)/transactions/page";

beforeEach(() => {
  globalThis.__apiMock.mockReset();
  globalThis.__apiMock.mockImplementation(async (url) => ({
    ok: true,
    json: async () => ({ expense: ["Food"], income: ["Salary"], allCustom: [] }),
  }));
});

describe("AddTransactionDrawer", () => {
  const open = (props = {}) =>
    render(
      <AddTransactionDrawer isOpen onClose={() => {}} onTransactionAdded={() => {}} {...props} />
    );

  it("exposes dialog semantics and autofocuses the amount field (U3)", async () => {
    const { container } = open();
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("0.00")).toBeTruthy();
    });
  });

  it("Escape closes through the shared hook", async () => {
    const onClose = vi.fn();
    open({ onClose });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("switching type resets the chosen category (stale selection guard)", async () => {
    // self-sufficient mock so this test never depends on suite-level state
    globalThis.__apiMock.mockReset();
    globalThis.__apiMock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ expense: ["Food"], income: ["Salary"], allCustom: [] }),
    }));
    open();

    // categories arrive asynchronously — wait for the option to exist
    const categorySelect = screen.getByLabelText(/Category/);
    await waitFor(() =>
      expect(
        Array.from(categorySelect.options).some((o) => o.value === "Food")
      ).toBe(true)
    );

    fireEvent.change(categorySelect, { target: { value: "Food" } });
    expect(categorySelect.value).toBe("Food");

    // flip to Income — the expense category must not leak across types
    fireEvent.click(screen.getByRole("button", { name: /Income/i }));

    // category selection reset to the disabled placeholder immediately
    const selectAfter = screen.getByLabelText(/Category/);
    expect(selectAfter.value).toBe("");
  });

  it("'Add new category' reveals a name input capped at 50 chars", async () => {
    open();

    fireEvent.change(screen.getByLabelText(/Category/), {
      target: { value: "add_new" },
    });

    const input = screen.getByLabelText(/New Category Name/);
    expect(input.getAttribute("maxlength")).toBe("50");
  });

  it("submits noon-local instants so calendar dates survive timezones", async () => {
    const onAdded = vi.fn();
    const calls = [];
    globalThis.__apiMock.mockImplementation(async (url, opts = {}) => {
      calls.push({ url, opts });
      if (opts.method === "POST" && url === "/api/transactions") {
        return { ok: true, json: async () => ({}) };
      }
      return { ok: true, json: async () => ({ expense: ["Food"], income: [], allCustom: [] }) };
    });

    const { container } = open({ onTransactionAdded: onAdded });

    await waitFor(() => expect(screen.getByPlaceholderText("0.00")).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "12.5" } });

    const categorySelect = screen.getByLabelText(/Category/);
    await waitFor(() =>
      expect(
        Array.from(categorySelect.options).some((o) => o.value === "Food")
      ).toBe(true)
    );
    fireEvent.change(categorySelect, { target: { value: "Food" } });
    fireEvent.change(container.querySelector('input[type="date"]'), {
      target: { value: "2026-08-15" },
    });

    fireEvent.click(screen.getByText("Save Transaction"));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/transactions")).toBe(true));

    const body = JSON.parse(calls.find((c) => c.url === "/api/transactions").opts.body);
    const sent = new Date(body.date);
    expect(sent.getHours()).toBe(12); // local noon — never midnight UTC math
    expect(body.amount).toBe(12.5);
    expect(onAdded).toHaveBeenCalledTimes(1);
  });
});

describe("EditTransactionModal", () => {
  const transaction = {
    _id: "t1",
    type: "expense",
    amount: 5,
    category: "Food",
    date: "2026-08-01T12:00:00Z",
    description: "snack",
    excludeFromBudget: false,
  };

  const categoriesOk = async () => ({
    ok: true,
    json: async () => ({ expense: ["Food"], income: [], allCustom: [] }),
  });

  it("renders with dialog semantics + description field", async () => {
    globalThis.__apiMock.mockImplementationOnce(categoriesOk);
    render(<EditTransactionModal transaction={transaction} onClose={() => {}} onSave={() => {}} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-label")).toBe("Edit Transaction");
    expect(screen.getByDisplayValue("snack")).toBeTruthy();
  });

  it("shows save failures INSIDE the modal (modalError), keeping it open", async () => {
    globalThis.__apiMock.mockImplementationOnce(categoriesOk);
    const onSave = vi.fn(async () => ({ ok: false, message: "Server said no." }));

    render(<EditTransactionModal transaction={transaction} onClose={() => {}} onSave={onSave} />);

    fireEvent.click(screen.getByText("Save Changes"));
    expect(await screen.findByText("Server said no.")).toBeTruthy();
    // modal stays open for correction
    expect(screen.getByText("Save Changes")).toBeTruthy();
  });

  it("sends ONLY editable fields — never echoes _id/userId back", async () => {
    globalThis.__apiMock.mockImplementationOnce(categoriesOk);
    let captured;
    const onSave = vi.fn(async (fields) => {
      captured = fields;
      return { ok: true };
    });

    render(<EditTransactionModal transaction={transaction} onClose={() => {}} onSave={onSave} />);

    fireEvent.click(screen.getByText("Save Changes"));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    expect(Object.keys(captured).sort()).toEqual([
      "amount",
      "category",
      "date",
      "description",
      "excludeFromBudget",
      "type",
    ]);
  });
});
