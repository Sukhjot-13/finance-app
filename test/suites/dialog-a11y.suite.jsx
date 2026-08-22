// test/suites/dialog-a11y.suite.js — src/lib/useDialogA11y.js
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState, useRef } from "react";
import { render, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useDialogA11y } from "@/lib/useDialogA11y";

function Harness({ open, onClose }) {
  const ref = useRef(null);
  useDialogA11y({ ref, isOpen: open, onClose });
  if (!open) return null;
  return (
    <div ref={ref} data-testid="dialog">
      <button onClick={() => {}}>First</button>
      <input data-autofocus placeholder="autofocused" />
      <button>Last</button>
    </div>
  );
}

describe("useDialogA11y", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    // an outside trigger to receive restored focus
    const trigger = document.createElement("button");
    trigger.id = "trigger";
    trigger.textContent = "Trigger";
    document.body.appendChild(trigger);
    trigger.focus();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("locks body scroll while open and restores it on close", () => {
    const onClose = vi.fn();
    const { rerender, unmount } = render(<Harness open onClose={onClose} />);
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<Harness open={false} onClose={onClose} />);
    expect(document.body.style.overflow).toBe("");
  });

  it("moves focus into the dialog ([data-autofocus] wins) and restores it on close", async () => {
    const onClose = vi.fn();
    const view = render(<Harness open onClose={onClose} />);

    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByPlaceholderText("autofocused")
      )
    );

    view.rerender(<Harness open={false} onClose={onClose} />);
    await waitFor(() =>
      expect(document.activeElement).toBe(document.getElementById("trigger"))
    );
  });

  it("Escape closes exactly once", () => {
    const onClose = vi.fn();
    render(<Harness open onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Tab wraps from LAST focusable back to FIRST", () => {
    const { container } = render(<Harness open onClose={() => {}} />);

    // scope to the dialog — the outside #trigger button must not interfere
    const [first, last] = within(container).getAllByRole("button");
    last.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: false });

    expect(document.activeElement).toBe(first);
  });

  it("Shift+Tab wraps from FIRST focusable forward to LAST", () => {
    const { container } = render(<Harness open onClose={() => {}} />);

    const [first, last] = within(container).getAllByRole("button");
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(last);
  });

  it("does nothing while closed (no listeners, no scroll lock)", () => {
    const onClose = vi.fn();
    render(<Harness open={false} onClose={onClose} />);

    expect(document.body.style.overflow).not.toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
