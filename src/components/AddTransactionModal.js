// FILE: src/components/AddTransactionModal.js
// A reusable modal component for adding new transactions.

"use client";

import { useState, useEffect } from "react";
import { cn, formatCurrency } from "@/lib/utils";

export default function AddTransactionModal({
  isOpen,
  onClose,
  onTransactionAdded,
}) {
  const [type, setType] = useState("expense"); // 'expense' or 'income'
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const [categories, setCategories] = useState({ expense: [], income: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      // Fetch categories when modal opens
      const fetchCategories = async () => {
        const res = await fetch("/api/categories");
        const data = await res.json();
        setCategories(data);
        // Set default category
        if (type === "expense" && data.expense.length > 0) {
          setCategory(data.expense[0]);
        } else if (type === "income" && data.income.length > 0) {
          setCategory(data.income[0]);
        }
      };
      fetchCategories();
    }
  }, [isOpen, type]);

  if (!isOpen) return null;

  const handleTypeChange = (newType) => {
    setType(newType);
    setCategory(categories[newType][0] || "");
    setNewCategory("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    let finalCategory = category;
    if (category === "add_new") {
      if (!newCategory) {
        setError("Please enter a name for the new category.");
        setLoading(false);
        return;
      }
      // Create the new category first
      try {
        const res = await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newCategory, type }),
        });
        if (!res.ok) throw new Error("Failed to create category.");
        finalCategory = newCategory;
      } catch (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
    }

    try {
      const transactionData = {
        type,
        amount: parseFloat(amount),
        category: finalCategory,
        description,
        date,
      };

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transactionData),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to add transaction.");
      }

      onTransactionAdded(); // Callback to refresh dashboard data
      handleClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // Reset form state
    setType("expense");
    setAmount("");
    setCategory("");
    setNewCategory("");
    setDescription("");
    setDate(new Date().toISOString().split("T")[0]);
    setError("");
    onClose();
  };

  const currentCategories = categories[type] || [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md transform transition-all">
        {/* Header */}
        <div
          className={cn(
            "p-4 rounded-t-lg transition-colors duration-300",
            type === "expense" ? "bg-red-500" : "bg-green-500"
          )}
        >
          <div className="flex justify-around">
            <button
              onClick={() => handleTypeChange("expense")}
              className={cn(
                "px-6 py-2 rounded-full text-white font-semibold",
                type === "expense" && "bg-white/30"
              )}
            >
              Expense
            </button>
            <button
              onClick={() => handleTypeChange("income")}
              className={cn(
                "px-6 py-2 rounded-full text-white font-semibold",
                type === "income" && "bg-white/30"
              )}
            >
              Income
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-100 p-2 rounded">
              {error}
            </p>
          )}

          <div>
            <label
              htmlFor="amount"
              className="block text-sm font-medium text-gray-700"
            >
              Amount
            </label>
            <input
              type="number"
              id="amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              step="0.01"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md"
              placeholder="0.00"
            />
          </div>

          <div>
            <label
              htmlFor="category"
              className="block text-sm font-medium text-gray-700"
            >
              Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              {currentCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
              <option value="add_new">-- Add New Category --</option>
            </select>
          </div>

          {category === "add_new" && (
            <div>
              <label
                htmlFor="newCategory"
                className="block text-sm font-medium text-gray-700"
              >
                New Category Name
              </label>
              <input
                type="text"
                id="newCategory"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-gray-700"
            >
              Description (Optional)
            </label>
            <input
              type="text"
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label
              htmlFor="date"
              className="block text-sm font-medium text-gray-700"
            >
              Date
            </label>
            <input
              type="date"
              id="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-400"
            >
              {loading ? "Saving..." : "Save Transaction"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
