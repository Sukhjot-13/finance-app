// src/components/BudgetManager.js
"use client";

import { useState, useEffect, useContext } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Trash2, Wallet } from "lucide-react";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { UserContext } from "@/app/(main)/layout";

const OVERALL_CATEGORY = "__total__";

export default function BudgetManager({ isOpen, onClose, onSaved }) {
  const [budgets, setBudgets] = useState({});
  // Snapshot of what the server had when the drawer opened. On Save,
  // entries the user CLEARED get deleted instead of silently persisting.
  const [originalBudgets, setOriginalBudgets] = useState({});
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { user } = useContext(UserContext);

  const fmt = (amount) => formatCurrency(amount, user?.currency);
  const month = getCurrentMonth();

  // Clearing the error here (not in the open-effect) keeps effects free of
  // synchronous setState.
  const handleClose = () => {
    setError("");
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;

    api("/api/categories")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load categories");
        return res.json();
      })
      .then((data) => setCategories(data.expense || []))
      .catch(console.error);

    api(`/api/budgets?month=${month}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load budgets");
        return res.json();
      })
      .then((data) => {
        const map = {};
        data.forEach((b) => {
          map[b.category] = b.amount;
        });
        setBudgets(map);
        setOriginalBudgets(map);
      })
      .catch(console.error);
  }, [isOpen, month]);

  const setBudget = (category, amount) => {
    setBudgets((prev) => ({
      ...prev,
      // Empty string marks "cleared"; numbers are parsed for saving.
      [category]: amount === "" ? "" : parseFloat(amount),
    }));
  };

  const deleteBudgetOnServer = async (category) => {
    const res = await api(
      `/api/budgets?category=${encodeURIComponent(category)}&month=${month}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      throw new Error("Failed to remove budget. Please try again.");
    }
  };

  const handleRemove = async (category) => {
    setError("");
    try {
      await deleteBudgetOnServer(category);
      setBudgets((prev) => {
        const next = { ...prev };
        delete next[category];
        return next;
      });
      setOriginalBudgets((prev) => {
        const next = { ...prev };
        delete next[category];
        return next;
      });
      onSaved?.();
    } catch (err) {
      console.error("Failed to remove budget:", err);
      setError(err.message || "Failed to remove budget.");
    }
  };

  const hasValue = (v) => v !== "" && v != null && v > 0;

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      // 1. Upsert every field with a positive value
      const entries = Object.entries(budgets).filter(([, amount]) => hasValue(amount));
      const upsertResults = await Promise.all(
        entries.map(([category, amount]) =>
          api("/api/budgets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ category, amount, month }),
          })
        )
      );
      if (upsertResults.some((res) => !res.ok)) {
        throw new Error("One or more budgets failed to save. Please try again.");
      }

      // 2. Delete budgets the user explicitly cleared (previously existed
      //    on the server but is now blank) so clearing a field really
      //    removes it instead of silently keeping the old limit.
      const cleared = Object.keys(originalBudgets).filter(
        (cat) => !hasValue(budgets[cat])
      );
      const deleteResults = await Promise.allSettled(
        cleared.map((cat) => deleteBudgetOnServer(cat))
      );
      if (deleteResults.some((r) => r.status === "rejected")) {
        throw new Error("Some removed budgets could not be deleted. Please retry.");
      }

      onSaved?.();
      onClose();
    } catch (err) {
      console.error("Failed to save budgets:", err);
      setError(err.message || "Failed to save budgets.");
    } finally {
      setSaving(false);
    }
  };

  const overallBudget = budgets[OVERALL_CATEGORY];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 z-40"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white z-50 shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold text-slate-800">
                Set Monthly Budgets
              </h2>
              <button
                onClick={handleClose}
                className="p-1 rounded-full hover:bg-slate-100"
              >
                <X size={20} className="text-slate-600" />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-6">
                <p className="text-sm text-slate-500">
                  Set an overall spending limit and per-category limits for this
                  month. Clearing a field removes that budget when you save.
                </p>

                {error && (
                  <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
                    {error}
                    <button
                      type="button"
                      onClick={() => setError("")}
                      className="ml-2 underline text-xs"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Overall Budget */}
                <div className="p-4 rounded-lg border-2 border-indigo-200 bg-indigo-50">
                  <div className="flex items-center gap-2 mb-3">
                    <Wallet size={18} className="text-indigo-600" />
                    <h3 className="text-sm font-semibold text-indigo-800">
                      Overall Monthly Budget
                    </h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Total spending limit"
                      value={overallBudget ?? ""}
                      onChange={(e) => setBudget(OVERALL_CATEGORY, e.target.value)}
                      className="flex-1 px-3 py-2 border border-indigo-300 rounded-md text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    {(overallBudget && overallBudget !== "") && (
                      <button
                        type="button"
                        onClick={() => handleRemove(OVERALL_CATEGORY)}
                        className="p-1 text-slate-400 hover:text-red-500"
                        title="Remove overall budget"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Warning: category budgets exceed overall */}
                {overallBudget && overallBudget !== "" ? (
                  (() => {
                    const categoryTotal = Object.entries(budgets)
                      .filter(([cat]) => cat !== OVERALL_CATEGORY)
                      .reduce((sum, [, amt]) => sum + (parseFloat(amt) || 0), 0);
                    if (categoryTotal > overallBudget) {
                      return (
                        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50">
                          <p className="text-sm font-medium text-amber-800">
                            Category budgets exceed your overall limit
                          </p>
                          <p className="text-xs text-amber-700 mt-1">
                            Combined category budgets ({fmt(categoryTotal)}) are over your
                            overall budget ({fmt(overallBudget)}) by{" "}
                            {fmt(categoryTotal - overallBudget)}. Consider adjusting your
                            overall budget or reducing some category limits.
                          </p>
                        </div>
                      );
                    }
                    return null;
                  })()
                ) : null}

                {/* Divider */}
                <div className="border-t border-slate-200"></div>

                {/* Per-Category Budgets */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">
                    Per-Category Limits
                  </h3>

                  {categories.length === 0 && (
                    <p className="text-center text-slate-400 py-8">
                      No expense categories found.
                    </p>
                  )}

                  {categories.map((cat) => (
                    <div
                      key={cat}
                      className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 mb-2"
                    >
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Amount"
                        value={budgets[cat] ?? ""}
                        onChange={(e) => setBudget(cat, e.target.value)}
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <span className="text-sm font-medium text-slate-700 w-28 capitalize">
                        {cat}
                      </span>
                      {(budgets[cat] && budgets[cat] !== "") && (
                        <button
                          type="button"
                          onClick={() => handleRemove(cat)}
                          className="p-1 text-slate-400 hover:text-red-500"
                          title="Remove budget"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="sticky bottom-0 p-4 border-t bg-slate-50">
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving..." : "Save Budgets"}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
