// src/components/BudgetManager.js
"use client";

import { useState, useEffect, useContext, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Trash2, Wallet, AlertCircle, AlertTriangle } from "lucide-react";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { useDialogA11y } from "@/lib/useDialogA11y";
import { UserContext } from "@/app/(main)/layout";

const OVERALL_CATEGORY = "__total__";

export default function BudgetManager({ isOpen, onClose, onSaved }) {
  const [budgets, setBudgets] = useState({});
  const [originalBudgets, setOriginalBudgets] = useState({});
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const panelRef = useRef(null);
  const { user } = useContext(UserContext);

  useDialogA11y({ ref: panelRef, isOpen, onClose: handleClose });

  const fmt = (amount) => formatCurrency(amount, user?.currency);
  const month = getCurrentMonth();

  function handleClose() {
    setError("");
    setLoadError(false);
    onClose();
  }

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    Promise.all([
      api("/api/categories").then(async (res) => {
        if (!res.ok) throw new Error("Failed to load categories");
        return res.json();
      }),
      api(`/api/budgets?month=${month}`).then(async (res) => {
        if (!res.ok) throw new Error("Failed to load budgets");
        return res.json();
      }),
    ])
      .then(([categoriesData, budgetsData]) => {
        if (cancelled) return;
        setCategories(categoriesData.expense || []);
        const map = {};
        budgetsData.forEach((b) => {
          map[b.category] = b.amount;
        });
        setBudgets(map);
        setOriginalBudgets(map);
        setLoadError(false);
      })
      .catch((err) => {
        console.error("Failed to load budget manager data:", err);
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, month, attempt]);

  const setBudget = (category, amount) => {
    setBudgets((prev) => ({
      ...prev,
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
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-40"
          />
          <motion.div
            ref={panelRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-zinc-900 border-l border-zinc-800 text-zinc-100 z-50 shadow-2xl flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label="Set Monthly Budgets"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800/80 bg-zinc-900/90 backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <Wallet size={18} className="text-emerald-400" />
                <h2 className="text-base font-bold text-zinc-100 tracking-tight">
                  Set Monthly Budgets
                </h2>
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto flex flex-col">
              <div className="p-6 space-y-6 flex-1">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Set an overall spending limit and per-category limits for this
                  month. Clearing a field removes that budget when you save.
                </p>

                {/* Load failure banner */}
                {loadError && (
                  <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs font-medium text-rose-300 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={16} className="shrink-0 text-rose-400" />
                      <span>Couldn&apos;t load your budgets. Please try again.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setLoadError(false);
                        setAttempt((n) => n + 1);
                      }}
                      className="shrink-0 px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 font-semibold hover:bg-rose-500/30 transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {error && (
                  <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-300 flex items-center justify-between">
                    <span>{error}</span>
                    <button
                      type="button"
                      onClick={() => setError("")}
                      className="text-xs underline text-rose-400 hover:text-rose-200"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {!loadError && (
                  <>
                    {/* Overall Budget Box */}
                    <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 space-y-3">
                      <div className="flex items-center gap-2">
                        <Wallet size={16} className="text-emerald-400" />
                        <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300 font-mono">
                          Overall Monthly Budget
                        </h3>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <input
                          id="overall-budget-input"
                          type="number"
                          step="0.01"
                          min="1"
                          placeholder="Total spending limit"
                          value={overallBudget ?? ""}
                          onChange={(e) => setBudget(OVERALL_CATEGORY, e.target.value)}
                          aria-label="Overall monthly budget"
                          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm font-mono font-medium text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
                        />
                        {(overallBudget && overallBudget !== "") && (
                          <button
                            type="button"
                            onClick={() => handleRemove(OVERALL_CATEGORY)}
                            className="p-2 text-zinc-500 hover:text-rose-400 hover:bg-zinc-800/60 rounded-lg transition-colors"
                            title="Remove overall budget"
                            aria-label="Remove overall budget"
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
                            <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 space-y-1">
                              <div className="flex items-center gap-1.5 font-semibold text-xs text-amber-200">
                                <AlertTriangle size={14} className="text-amber-400" />
                                <span>Category budgets exceed your overall limit</span>
                              </div>
                              <p className="text-[11px] text-amber-400/90 leading-relaxed">
                                Combined category budgets ({fmt(categoryTotal)}) are over your
                                overall budget ({fmt(overallBudget)}) by{" "}
                                {fmt(categoryTotal - overallBudget)}. Consider adjusting your limits.
                              </p>
                            </div>
                          );
                        }
                        return null;
                      })()
                    ) : null}

                    {/* Divider */}
                    <div className="border-t border-zinc-800/80"></div>

                    {/* Per-Category Budgets */}
                    <div className="space-y-3">
                      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                        Per-Category Limits
                      </h3>

                      {categories.length === 0 && (
                        <p className="text-center text-zinc-500 py-6 text-xs">
                          No expense categories found.
                        </p>
                      )}

                      <div className="space-y-2">
                        {categories.map((cat) => (
                          <div
                            key={cat}
                            className="flex items-center gap-2.5 p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80"
                          >
                            <span className="text-xs font-semibold text-zinc-300 w-28 capitalize truncate pl-1">
                              {cat}
                            </span>
                            <input
                              type="number"
                              step="0.01"
                              min="1"
                              placeholder="Amount"
                              value={budgets[cat] ?? ""}
                              onChange={(e) => setBudget(cat, e.target.value)}
                              className="flex-1 bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
                              aria-label={`${cat} budget`}
                            />
                            {(budgets[cat] && budgets[cat] !== "") && (
                              <button
                                type="button"
                                onClick={() => handleRemove(cat)}
                                className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-zinc-800/60 rounded-md transition-colors"
                                title="Remove budget"
                                aria-label={`Remove ${cat} budget`}
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {!loadError && (
                <div className="sticky bottom-0 p-5 border-t border-zinc-800/80 bg-zinc-900/95 backdrop-blur-md">
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-3.5 px-4 rounded-xl text-sm font-bold text-zinc-950 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all"
                  >
                    {saving ? "Saving..." : "Save Budgets"}
                  </button>
                </div>
              )}
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
