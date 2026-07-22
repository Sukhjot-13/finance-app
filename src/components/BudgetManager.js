"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Trash2, Wallet } from "lucide-react";

const OVERALL_CATEGORY = "__total__";

export default function BudgetManager({ isOpen, onClose, onSaved }) {
  const [budgets, setBudgets] = useState({});
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);

  const month = getCurrentMonth();

  useEffect(() => {
    if (!isOpen) return;

    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => setCategories(data.expense || []));

    fetch(`/api/budgets?month=${month}`)
      .then((res) => res.json())
      .then((data) => {
        const map = {};
        data.forEach((b) => {
          map[b.category] = b.amount;
        });
        setBudgets(map);
      })
      .catch(console.error);
  }, [isOpen, month]);

  const setBudget = (category, amount) => {
    setBudgets((prev) => ({
      ...prev,
      [category]: amount ? parseFloat(amount) : "",
    }));
  };

  const removeBudget = async (category) => {
    try {
      const res = await fetch(`/api/budgets?category=${category}&month=${month}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setBudgets((prev) => {
          const next = { ...prev };
          delete next[category];
          return next;
        });
        onSaved?.();
      }
    } catch (error) {
      console.error("Failed to remove budget:", error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const promises = Object.entries(budgets).map(([category, amount]) => {
        if (!amount || amount <= 0) return Promise.resolve();
        return fetch("/api/budgets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category, amount, month }),
        });
      });
      await Promise.all(promises);
      onSaved?.();
      onClose();
    } catch (error) {
      console.error("Failed to save budgets:", error);
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
            onClick={onClose}
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
                onClick={onClose}
                className="p-1 rounded-full hover:bg-slate-100"
              >
                <X size={20} className="text-slate-600" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <p className="text-sm text-slate-500">
                Set an overall spending limit and per-category limits for this month.
              </p>

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
                  {overallBudget && (
                    <button
                      onClick={() => removeBudget(OVERALL_CATEGORY)}
                      className="p-1 text-slate-400 hover:text-red-500"
                      title="Remove overall budget"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Warning: category budgets exceed overall */}
              {overallBudget && (
                (() => {
                  const categoryTotal = Object.entries(budgets)
                    .filter(([cat]) => cat !== OVERALL_CATEGORY)
                    .reduce((sum, [, amt]) => sum + (parseFloat(amt) || 0), 0);
                  if (categoryTotal > overallBudget) {
                    return (
                      <div className="p-3 rounded-lg border border-amber-200 bg-amber-50">
                        <p className="text-sm font-medium text-amber-800">
                          ⚠️ Category budgets exceed your overall limit
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                          Combined category budgets (${categoryTotal.toFixed(0)}) are over your overall budget
                          (${overallBudget.toFixed(0)}) by ${(categoryTotal - overallBudget).toFixed(0)}.
                          Consider adjusting your overall budget or reducing some category limits.
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()
              )}

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
                    {budgets[cat] && (
                      <button
                        onClick={() => removeBudget(cat)}
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

            <div className="p-4 border-t bg-slate-50">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400"
              >
                {saving ? "Saving..." : "Save Budgets"}
              </button>
            </div>
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
