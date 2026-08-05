"use client";

import { useState, useEffect, useContext } from "react";
import { motion } from "framer-motion";
import { formatCurrency } from "@/lib/utils";
import { UserContext } from "@/app/(main)/layout";

export default function BudgetProgress() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const user = useContext(UserContext);

  useEffect(() => {
    fetch("/api/reports/budget-progress")
      .then((res) => res.json())
      .then((data) => setData(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const fmt = (amount) => formatCurrency(amount, user?.currency);

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 bg-slate-200 rounded" />
        ))}
      </div>
    );
  }

  const hasOverall = data?.overall;
  const hasCategories = data?.progress && data.progress.length > 0;

  if (!hasOverall && !hasCategories) return null;

  return (
    <div className="bg-white p-5 rounded-xl shadow-sm space-y-5">
      {/* Overall Budget */}
      {hasOverall && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
              Overall Monthly Budget
            </h3>
            <span className="text-sm text-slate-500">
              {fmt(data.overall.spent)} / {fmt(data.overall.budget)}
            </span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${data.overall.percentage}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className={`h-full rounded-full ${
                data.overall.overBudget
                  ? "bg-red-500"
                  : data.overall.percentage > 80
                  ? "bg-amber-500"
                  : "bg-indigo-500"
              }`}
            />
          </div>
          {data.overall.overBudget && (
            <p className="text-xs text-red-500 mt-1">
              {fmt(data.overall.spent - data.overall.budget)} over budget
            </p>
          )}
          {data.totalSpent > 0 && (
            <p className="text-xs text-slate-400 mt-1">
              Total spent this month: {fmt(data.totalSpent)}
              {data.excludedSpent > 0 && (
                <span className="text-amber-600">
                  {" "}
                  (excl. {fmt(data.excludedSpent)} in one-time expenses)
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {/* Divider if both overall and per-category budgets exist */}
      {hasOverall && hasCategories && (
        <div className="border-t border-slate-100"></div>
      )}

      {/* Per-Category Budgets */}
      {hasCategories && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            By Category
          </h3>
          {data.progress.map((item) => (
            <div key={item.category}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-slate-700 capitalize">
                  {item.category}
                </span>
                <span className="text-slate-500">
                  {fmt(item.spent)} / {fmt(item.budget)}
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${item.percentage}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className={`h-full rounded-full ${
                    item.overBudget
                      ? "bg-red-500"
                      : item.percentage > 80
                      ? "bg-amber-500"
                      : "bg-indigo-500"
                  }`}
                />
              </div>
              {item.overBudget && (
                <p className="text-xs text-red-500 mt-0.5">
                  {fmt(item.spent - item.budget)} over budget
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
