// src/components/RecurringManager.js
"use client";

import { useCallback, useEffect, useState } from "react";
import { Repeat, Trash2, Play, Pause } from "lucide-react";
import api from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";
import { defaultExpenseCategories, defaultIncomeCategories } from "@/lib/constants";
import { UserContext } from "@/app/(main)/layout";
import { useContext } from "react";

const EMPTY = { expense: [], income: [] };

/**
 * Minimal management surface for recurring-transaction rules
 * (GET/POST /api/recurring, PATCH/DELETE /api/recurring/[id]).
 *
 * This existed only as a tested API with zero UI callers, so the 12-run
 * catch-up engine was invisible and unreachable. Rules are materialized on
 * the next dashboard load (throttled to once per 60s per user), so a rule
 * created here can take up to a minute to appear as a transaction.
 */
export default function RecurringManager() {
  const { user } = useContext(UserContext);
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type: "expense",
    amount: "",
    category: "",
    frequency: "monthly",
    dayOfMonth: "1",
    dayOfWeek: "1",
  });

  const load = useCallback(async () => {
    try {
      const res = await api("/api/recurring");
      if (!res.ok) throw new Error("Failed to fetch recurring rules");
      const data = await res.json();
      setRules(Array.isArray(data?.rules) ? data.rules : []);
      setError("");
    } catch {
      setError("Couldn't load your recurring transactions. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    api("/api/categories")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setCategories({ expense: data.expense || [], income: data.income || [] }))
      .catch(() => {});
  }, [load]);

  const options = form.type === "expense" ? categories.expense : categories.income;
  const defaults = form.type === "expense" ? defaultExpenseCategories : defaultIncomeCategories;
  const categoryOptions = options.length > 0 ? options : defaults;

  const handleCreate = async (e) => {
    e.preventDefault();
    const amountNum = Number(form.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    if (!form.category.trim()) {
      setError("Choose a category.");
      return;
    }
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const res = await api("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: form.type,
          amount: amountNum,
          category: form.category.trim(),
          frequency: form.frequency,
          dayOfMonth: Number(form.dayOfMonth),
          dayOfWeek: Number(form.dayOfWeek),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create the rule.");
      }
      setForm((f) => ({ ...f, amount: "" }));
      setStatus("Rule created. It will appear on your next dashboard load.");
      await load();
    } catch (err) {
      setError(err.message || "Failed to create the rule.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule) => {
    setError("");
    setStatus("");
    try {
      const res = await api(`/api/recurring/${rule._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !rule.active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update the rule.");
      }
      await load();
    } catch (err) {
      setError(err.message || "Failed to update the rule.");
    }
  };

  const handleDelete = async (rule) => {
    setError("");
    setStatus("");
    try {
      const res = await api(`/api/recurring/${rule._id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete the rule.");
      }
      setStatus("Rule deleted. Transactions it already created were kept.");
      await load();
    } catch (err) {
      setError(err.message || "Failed to delete the rule.");
    }
  };

  return (
    <div className="bg-zinc-900/80 p-6 sm:p-8 rounded-2xl border border-zinc-800/90 shadow-xl backdrop-blur-md space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center justify-center">
          <Repeat size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold tracking-tight text-zinc-100">
            Recurring Transactions
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Rent, salary and subscriptions are added automatically once per
            minute while you use the app.
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3 text-xs font-medium text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center justify-between gap-2"
        >
          <span>{error}</span>
          <button
            onClick={() => setError("")}
            className="underline text-rose-400 hover:text-rose-200"
          >
            Dismiss
          </button>
        </div>
      )}

      {status && (
        <div
          role="status"
          className="p-3 text-xs font-medium text-sky-300 bg-sky-500/10 border border-sky-500/30 rounded-xl"
        >
          {status}
        </div>
      )}

      <form onSubmit={handleCreate} className="grid grid-cols-2 sm:grid-cols-6 gap-3 items-end">
        <div className="col-span-1">
          <label
            htmlFor="rec-type"
            className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-1.5"
          >
            Type
          </label>
          <select
            id="rec-type"
            value={form.type}
            onChange={(e) =>
              setForm((f) => ({ ...f, type: e.target.value, category: "" }))
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </div>
        <div className="col-span-1">
          <label
            htmlFor="rec-amount"
            className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-1.5"
          >
            Amount
          </label>
          <input
            id="rec-amount"
            type="number"
            step="0.01"
            min="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
            required
          />
        </div>
        <div className="col-span-1">
          <label
            htmlFor="rec-category"
            className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-1.5"
          >
            Category
          </label>
          <select
            id="rec-category"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
            required
          >
            <option value="" disabled>
              Select
            </option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-1">
          <label
            htmlFor="rec-frequency"
            className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-1.5"
          >
            Repeats
          </label>
          <select
            id="rec-frequency"
            value={form.frequency}
            onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
          >
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <div className="col-span-1">
          <label
            htmlFor="rec-day"
            className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-1.5"
          >
            {form.frequency === "monthly" ? "Day (1-28)" : "Weekday"}
          </label>
          <input
            id="rec-day"
            type="number"
            min={form.frequency === "monthly" ? 1 : 0}
            max={form.frequency === "monthly" ? 28 : 6}
            value={form.frequency === "monthly" ? form.dayOfMonth : form.dayOfWeek}
            onChange={(e) =>
              setForm((f) =>
                form.frequency === "monthly"
                  ? { ...f, dayOfMonth: e.target.value }
                  : { ...f, dayOfWeek: e.target.value }
              )
            }
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm font-mono text-zinc-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
            required
          />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <button
            type="submit"
            disabled={saving}
            className="w-full px-4 py-2 bg-gradient-to-r from-emerald-400 to-teal-500 text-zinc-950 font-bold rounded-xl text-xs shadow-lg shadow-emerald-500/20 hover:from-emerald-300 hover:to-teal-400 transition-all disabled:opacity-50"
          >
            {saving ? "Adding..." : "Add Rule"}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-xs text-zinc-500">Loading rules…</p>
      ) : rules.length === 0 ? (
        <p className="text-xs text-zinc-500">
          No recurring rules yet. Add one above and it will post itself
          automatically on each due date.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-800/60 rounded-xl border border-zinc-800/70">
          {rules.map((rule) => (
            <li
              key={rule._id}
              className="flex items-center justify-between gap-3 p-3.5 flex-wrap"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-200 capitalize">
                  {rule.category}
                  <span className="ml-2 text-xs font-mono text-zinc-500">
                    {rule.type === "income" ? "+" : "-"}
                    {formatCurrency(rule.amount, user?.currency)}
                  </span>
                </p>
                <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                  {rule.frequency === "weekly" ? "Weekly" : `Monthly on day ${rule.dayOfMonth}`}
                  {rule.nextRunAt ? ` · next ${formatDate(rule.nextRunAt)}` : ""}
                  {rule.active ? "" : " · paused"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggle(rule)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-zinc-300 hover:text-emerald-400 px-2.5 py-1 rounded-lg hover:bg-zinc-800/60 transition-colors"
                >
                  {rule.active ? <Pause size={12} /> : <Play size={12} />}
                  {rule.active ? "Pause" : "Resume"}
                </button>
                <button
                  onClick={() => handleDelete(rule)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-zinc-400 hover:text-rose-400 px-2.5 py-1 rounded-lg hover:bg-zinc-800/60 transition-colors"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
