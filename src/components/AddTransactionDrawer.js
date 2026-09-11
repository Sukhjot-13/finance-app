// src/components/AddTransactionDrawer.js
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Plus, Minus, Calendar, Tag, FileText, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";
import { formatDateForInput } from "@/lib/utils";
import { useDialogA11y } from "@/lib/useDialogA11y";

// A custom segmented control for a modern fintech UI
function SegmentedControl({ value, onChange, options }) {
  return (
    <div className="flex w-full bg-zinc-950 rounded-xl p-1 border border-zinc-800">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`w-1/2 rounded-lg py-2.5 text-xs font-bold uppercase tracking-wider transition-colors relative ${
            value === opt.value
              ? "text-white"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            {opt.icon} {opt.label}
          </span>
          {value === opt.value && (
            <motion.div
              layoutId="segmented-control-active-pill"
              className={`absolute inset-0 rounded-lg shadow-sm ${
                opt.value === "expense" ? "bg-rose-600" : "bg-emerald-600"
              }`}
              transition={{ type: "spring", stiffness: 350, damping: 28 }}
            />
          )}
        </button>
      ))}
    </div>
  );
}

export default function AddTransactionDrawer({
  isOpen,
  onClose,
  onTransactionAdded,
}) {
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [date, setDate] = useState(formatDateForInput(new Date()));
  const [description, setDescription] = useState("");
  const [excludeFromBudget, setExcludeFromBudget] = useState(false);

  const [categories, setCategories] = useState({ expense: [], income: [], allCustom: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef(null);

  const fetchCategories = () => {
    api("/api/categories")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load categories");
        return res.json();
      })
      .then((data) => setCategories(data))
      .catch((err) => console.error("Failed to fetch categories:", err));
  };

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
    }
  }, [isOpen]);

  const handleTypeChange = (value) => {
    setType(value);
    setCategory("");
    setIsAddingNewCategory(false);
  };

  const handleCategoryChange = (e) => {
    const { value } = e.target;
    if (value === "add_new") {
      setIsAddingNewCategory(true);
      setCategory("");
    } else {
      setIsAddingNewCategory(false);
      setCategory(value);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    let finalCategory = category;
    if (isAddingNewCategory) {
      if (!newCategory.trim()) {
        setError("Please enter a name for the new category.");
        setLoading(false);
        return;
      }
      try {
        const res = await api("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newCategory.trim(), type }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || "Failed to create category.");
        }
        finalCategory = newCategory.trim();
        setIsAddingNewCategory(false);
        setNewCategory("");
        setCategory(finalCategory);
        fetchCategories();
      } catch (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
    }

    try {
      const res = await api("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          amount: parseFloat(amount),
          category: finalCategory,
          date: new Date(date + "T12:00:00"),
          description,
          excludeFromBudget,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to add transaction.");
      }

      onTransactionAdded();
      handleClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = useCallback(() => {
    setType("expense");
    setAmount("");
    setCategory("");
    setNewCategory("");
    setIsAddingNewCategory(false);
    setDate(formatDateForInput(new Date()));
    setDescription("");
    setExcludeFromBudget(false);
    setError("");
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  useDialogA11y({ ref: panelRef, isOpen, onClose: handleClose });

  const currentCategories =
    type === "expense" ? categories.expense : categories.income;

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
            aria-hidden="true"
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
            aria-label="Add Transaction"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800/80 bg-zinc-900/90 backdrop-blur-md">
              <h2 className="text-base font-bold text-zinc-100 tracking-tight">
                Add Transaction
              </h2>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
                aria-label="Close dialog"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form
              id="add-transaction-form"
              onSubmit={handleSubmit}
              className="flex-1 overflow-y-auto px-6 py-6 space-y-6"
            >
              {error && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium text-center">
                  {error}
                </div>
              )}

              <SegmentedControl
                value={type}
                onChange={handleTypeChange}
                options={[
                  {
                    label: "Expense",
                    value: "expense",
                    icon: <Minus size={14} className="stroke-[3]" />,
                  },
                  {
                    label: "Income",
                    value: "income",
                    icon: <Plus size={14} className="stroke-[3]" />,
                  },
                ]}
              />

              {/* Amount Field */}
              <div>
                <label
                  htmlFor="amount"
                  className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-2"
                >
                  Amount
                </label>
                <div className="relative">
                  <input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    data-autofocus
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3.5 text-2xl font-bold font-mono tracking-tight text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 transition-all shadow-inner"
                  />
                </div>
              </div>

              {/* Category Select */}
              <div>
                <label
                  htmlFor="category"
                  className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-2"
                >
                  Category
                </label>
                <select
                  id="category"
                  required
                  value={isAddingNewCategory ? "add_new" : category}
                  onChange={handleCategoryChange}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-3 text-sm font-medium text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 transition-all cursor-pointer"
                >
                  <option value="" disabled className="bg-zinc-900 text-zinc-500">
                    Select a category...
                  </option>
                  {currentCategories.map((cat) => (
                    <option key={cat} value={cat} className="bg-zinc-900 text-zinc-200">
                      {cat}
                    </option>
                  ))}
                  <option value="add_new" className="bg-zinc-900 text-emerald-400 font-semibold">
                    + Add New Category
                  </option>
                </select>
              </div>

              {isAddingNewCategory && (
                <div className="p-4 rounded-xl bg-zinc-950 border border-emerald-500/30 space-y-2">
                  <label
                    htmlFor="newCategory"
                    className="block text-xs font-semibold text-emerald-400 uppercase tracking-wider font-mono"
                  >
                    New Category Name
                  </label>
                  <input
                    id="newCategory"
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    maxLength={50}
                    placeholder="e.g., Streaming Services"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
                  />
                </div>
              )}

              {/* Date Field */}
              <div>
                <label
                  htmlFor="date"
                  className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-2"
                >
                  Date
                </label>
                <input
                  id="date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-3 text-sm font-medium text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 transition-all"
                />
              </div>

              {/* Description Field */}
              <div>
                <label
                  htmlFor="description"
                  className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-2"
                >
                  Description (Optional)
                </label>
                <input
                  id="description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={200}
                  placeholder="e.g., Dinner with colleagues"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-3 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 transition-all"
                />
              </div>

              {/* One-time expense option */}
              {type === "expense" && (
                <label className="flex items-start gap-3 p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 cursor-pointer hover:border-zinc-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={excludeFromBudget}
                    onChange={(e) => setExcludeFromBudget(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded bg-zinc-900 border-zinc-700 text-emerald-500 focus:ring-emerald-500/40 focus:ring-offset-0 cursor-pointer"
                  />
                  <div>
                    <span className="block text-xs font-semibold text-zinc-200">
                      One-time expense
                    </span>
                    <span className="block text-[11px] text-zinc-400 mt-0.5">
                      {"Don't count this in my monthly budget"}
                    </span>
                  </div>
                </label>
              )}
            </form>

            {/* Footer */}
            <div className="p-5 border-t border-zinc-800/80 bg-zinc-900/90">
              <button
                type="submit"
                form="add-transaction-form"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl text-sm font-bold text-zinc-950 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all"
              >
                {loading ? "Saving..." : "Save Transaction"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
