// src/components/AddTransactionDrawer.js
"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Plus, Minus } from "lucide-react";
import { formatDateForInput } from "@/lib/utils"; // We will create this helper function

// A custom segmented control for a nicer UI
function SegmentedControl({ value, onChange, options }) {
  return (
    <div className="flex w-full bg-slate-200 rounded-lg p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`w-1/2 rounded-md p-2 text-sm font-medium transition-colors relative
            ${
              value === opt.value
                ? "text-white"
                : "text-slate-600 hover:bg-slate-300"
            }`}
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            {opt.icon} {opt.label}
          </span>
          {value === opt.value && (
            <motion.div
              layoutId="segmented-control-active-pill"
              className={`absolute inset-0 rounded-md ${
                opt.value === "expense" ? "bg-red-500" : "bg-green-500"
              }`}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
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
  const [date, setDate] = useState(formatDateForInput(new Date()));
  const [description, setDescription] = useState("");

  const [categories, setCategories] = useState({ expense: [], income: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Fetch categories when the drawer is opened for the first time
    if (isOpen && categories.expense.length === 0) {
      fetch("/api/categories")
        .then((res) => res.json())
        .then((data) => setCategories(data));
    }
  }, [isOpen]);

  // Reset form when type changes
  useEffect(() => {
    setCategory("");
  }, [type]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          amount: parseFloat(amount),
          category,
          date,
          description,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to add transaction.");
      }

      onTransactionAdded(); // This will refetch the dashboard data
      handleClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Reset form state on close
    setType("expense");
    setAmount("");
    setCategory("");
    setDate(formatDateForInput(new Date()));
    setDescription("");
    setError("");
    onClose();
  };

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
                Add Transaction
              </h2>
              <button
                onClick={handleClose}
                className="p-1 rounded-full hover:bg-slate-100"
              >
                <X size={20} className="text-slate-600" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex-1 overflow-y-auto p-6 space-y-6"
            >
              {error && (
                <p className="text-sm text-center text-red-600 bg-red-100 p-3 rounded-md">
                  {error}
                </p>
              )}

              <SegmentedControl
                value={type}
                onChange={setType}
                options={[
                  {
                    label: "Expense",
                    value: "expense",
                    icon: <Minus size={16} />,
                  },
                  {
                    label: "Income",
                    value: "income",
                    icon: <Plus size={16} />,
                  },
                ]}
              />

              <div>
                <label
                  htmlFor="amount"
                  className="block text-sm font-medium text-slate-700"
                >
                  Amount
                </label>
                <input
                  id="amount"
                  type="number"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label
                  htmlFor="category"
                  className="block text-sm font-medium text-slate-700"
                >
                  Category
                </label>
                <select
                  id="category"
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="" disabled>
                    Select a category...
                  </option>
                  {currentCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="date"
                  className="block text-sm font-medium text-slate-700"
                >
                  Date
                </label>
                <input
                  id="date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-slate-700"
                >
                  Description (Optional)
                </label>
                <input
                  id="description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g., Coffee with friends"
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </form>

            <div className="p-4 border-t bg-slate-50">
              <button
                type="submit"
                form="add-transaction-form" // This ties the button to the form
                onClick={handleSubmit}
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed"
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
