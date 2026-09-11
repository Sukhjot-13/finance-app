"use client";

import { useState, useEffect, useCallback, useContext } from "react";
import { motion } from "framer-motion";
import { formatCurrency } from "@/lib/utils";
import api from "@/lib/api";
import { UserContext } from "@/app/(main)/layout";
import { AlertCircle } from "lucide-react";

export default function BudgetProgress() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  // Bump to re-run the fetch (Retry button / refresh after budget edits).
  const [attempt, setAttempt] = useState(0);
  const { user } = useContext(UserContext);

  useEffect(() => {
    let cancelled = false;
    // Client-local month window + month key so the server compares against
    // the budget month the user actually means (and ignores future dates).
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    api(
      `/api/reports/budget-progress?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&month=${month}`
    )
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load budget progress");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setData(data);
        setLoadFailed(false);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setData(null);
          setLoadFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Retry is user-initiated: reset the visible states here, then bump
  // `attempt` so the fetch effect re-runs.
  const retry = () => {
    setLoading(true);
    setLoadFailed(false);
    setAttempt((n) => n + 1);
  };

  const fmt = (amount) => formatCurrency(amount, user?.currency);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 bg-zinc-800/60 rounded-xl" />
        ))}
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="bg-zinc-900/90 border border-rose-500/30 p-5 rounded-2xl shadow-xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <AlertCircle size={18} className="text-rose-400 shrink-0" />
          <p className="text-sm font-medium text-rose-300">
            Couldn&apos;t load your budgets. Please try again.
          </p>
        </div>
        <button
          onClick={retry}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const hasOverall = data?.overall;
  const hasCategories = data?.progress && data.progress.length > 0;

  if (!hasOverall && !hasCategories) return null;

  return (
    <div className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-6 backdrop-blur-md shadow-xl space-y-6">
      {/* Overall Budget */}
      {hasOverall && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono">
              Overall Monthly Budget
            </h3>
            <span className="text-xs font-mono font-medium text-zinc-300 bg-zinc-950 px-2.5 py-1 rounded-lg border border-zinc-800">
              {fmt(data.overall.spent)} / {fmt(data.overall.budget)}
            </span>
          </div>
          <div className="w-full bg-zinc-950 rounded-full h-3 overflow-hidden p-0.5 border border-zinc-800/80">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(data.overall.percentage, 100)}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className={`h-full rounded-full transition-all ${
                data.overall.overBudget
                  ? "bg-gradient-to-r from-rose-500 to-red-600 shadow-[0_0_12px_rgba(244,63,94,0.4)]"
                  : data.overall.percentage > 80
                  ? "bg-gradient-to-r from-amber-500 to-yellow-400 shadow-[0_0_12px_rgba(245,158,11,0.4)]"
                  : "bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_12px_rgba(16,185,129,0.3)]"
              }`}
            />
          </div>
          {data.overall.overBudget && (
            <p className="text-xs font-medium text-rose-400 mt-2 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500" />
              {fmt(data.overall.spent - data.overall.budget)} over budget
            </p>
          )}
          {data.totalSpent > 0 && (
            <p className="text-xs text-zinc-500 mt-2 font-mono">
              Total spent this month: <span className="text-zinc-300 font-sans">{fmt(data.totalSpent)}</span>
              {data.excludedSpent > 0 && (
                <span className="text-amber-400/90 ml-1.5">
                  (excl. {fmt(data.excludedSpent)} in one-time expenses)
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {/* Divider if both overall and per-category budgets exist */}
      {hasOverall && hasCategories && (
        <div className="border-t border-zinc-800/80"></div>
      )}

      {/* Per-Category Budgets */}
      {hasCategories && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono">
            By Category
          </h3>
          <div className="space-y-3.5">
            {data.progress.map((item) => (
              <div key={item.category} className="p-3 rounded-xl bg-zinc-950/50 border border-zinc-800/60">
                <div className="flex justify-between items-center text-xs mb-2">
                  <span className="font-semibold text-zinc-200 capitalize">
                    {item.category}
                  </span>
                  <span className="font-mono text-zinc-400">
                    {fmt(item.spent)} <span className="text-zinc-600">/</span> {fmt(item.budget)}
                  </span>
                </div>
                <div className="w-full bg-zinc-900 rounded-full h-2 overflow-hidden border border-zinc-800/50">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(item.percentage, 100)}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className={`h-full rounded-full ${
                      item.overBudget
                        ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]"
                        : item.percentage > 80
                        ? "bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.4)]"
                        : "bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                    }`}
                  />
                </div>
                {item.overBudget && (
                  <p className="text-[11px] font-medium text-rose-400 mt-1.5">
                    {fmt(item.spent - item.budget)} over budget
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
