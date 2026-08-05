// src/app/(main)/transactions/page.js
"use client";

import { useState, useEffect, useCallback, useContext } from "react";
import { formatCurrency, formatDate, formatDateForInput } from "@/lib/utils";
import api from "@/lib/api";
import { Trash2, Edit, X, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { UserContext } from "@/app/(main)/layout";

// Edit Transaction Modal Component
function EditTransactionModal({ transaction, onClose, onSave }) {
  // Normalize the stored date to "YYYY-MM-DD" (local timezone) so the date
  // input shows exactly the date the user sees in the list. Dates are stored
  // as instants, so they must be converted with the viewer's local getters.
  const [formData, setFormData] = useState({
    ...transaction,
    date: formatDateForInput(new Date(transaction.date)),
  });
  const [categories, setCategories] = useState({ expense: [], income: [] });
  const [newCategory, setNewCategory] = useState("");
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);

  useEffect(() => {
    setFormData({
      ...transaction,
      date: formatDateForInput(new Date(transaction.date)),
    });
    const fetchCategories = async () => {
      const res = await api("/api/categories");
      const data = await res.json();
      setCategories(data);
    };
    fetchCategories();
  }, [transaction]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "category" && value === "add_new") {
      setIsAddingNewCategory(true);
      setFormData((prev) => ({ ...prev, category: "" }));
    } else {
      setIsAddingNewCategory(false);
      // Checkboxes expose their checked state via `checked`, not `value`
      // (value is the string "on"/"").
      const nextValue = e.target.type === "checkbox" ? e.target.checked : value;
      setFormData((prev) => ({ ...prev, [name]: nextValue }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    let finalCategory = formData.category;
    if (isAddingNewCategory) {
      if (!newCategory) {
        alert("Please enter a name for the new category.");
        return;
      }
      try {
        const res = await api("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newCategory, type: formData.type }),
        });
        if (!res.ok) throw new Error("Failed to create category.");
        finalCategory = newCategory;
      } catch (err) {
        alert(err.message);
        return;
      }
    }
    // Send the date as an instant at 12:00 noon in the user's local timezone,
    // matching AddTransactionDrawer (see the comment there).
    await onSave({
      ...formData,
      category: finalCategory,
      date: new Date(formData.date + "T12:00:00"),
    });
  };

  const currentCategories = formData.type === 'expense' ? categories.expense : categories.income;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    >
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -50, opacity: 0 }}
        className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md"
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Edit Transaction</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
            <X size={24} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Amount</label>
              <input
                type="number" name="amount" value={formData.amount}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Category</label>
              <select
                name="category"
                value={isAddingNewCategory ? "add_new" : formData.category}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                required
              >
                <option value="" disabled>Select a category</option>
                {currentCategories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
                <option value="add_new">-- Add New Category --</option>
              </select>
            </div>
            {isAddingNewCategory && (
              <div>
                <label className="block text-sm font-medium text-gray-700">New Category Name</label>
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  required
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700">Date</label>
              <input
                type="date" name="date" value={formData.date}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <input
                type="text" name="description" value={formData.description || ''}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              />
            </div>
            {formData.type === "expense" && (
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="excludeFromBudget"
                  checked={!!formData.excludeFromBudget}
                  onChange={handleChange}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-700">
                    One-time expense
                  </span>
                  <span className="block text-xs text-gray-500">
                    Don't count this in my monthly budget
                  </span>
                </span>
              </label>
            )}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700">
              Save Changes
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// Transaction card for mobile view
function TransactionCard({ transaction, userCurrency, onEdit, onDelete }) {
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-2 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${
                transaction.type === "income"
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {transaction.type}
            </span>
            <span className="text-sm font-medium text-slate-700 truncate">
              {transaction.category}
            </span>
            {transaction.excludeFromBudget && (
              <span className="shrink-0 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                One-time
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">{formatDate(transaction.date)}</p>
        </div>
        <span
          className={`shrink-0 text-base font-semibold ${
            transaction.type === "income" ? "text-green-600" : "text-red-600"
          }`}
        >
          {formatCurrency(transaction.amount, userCurrency)}
        </span>
      </div>
      {transaction.description && (
        <p className="text-xs text-slate-500 truncate">{transaction.description}</p>
      )}
      <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
        <button
          onClick={() => onEdit(transaction)}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 px-2 py-1 rounded hover:bg-slate-50"
        >
          <Edit size={13} />
          Edit
        </button>
        {deleting ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => { onDelete(transaction._id); setDeleting(false); }}
              className="flex items-center gap-1 text-xs text-red-600 px-2 py-1 rounded hover:bg-red-50"
            >
              <Trash2 size={13} />
              Confirm
            </button>
            <button
              onClick={() => setDeleting(false)}
              className="text-xs text-slate-400 px-2 py-1 rounded hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setDeleting(true)}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 px-2 py-1 rounded hover:bg-slate-50"
          >
            <Trash2 size={13} />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

// Main Page Component
export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [filters, setFilters] = useState({
    search: "",
    type: "all",
    category: "all",
    startDate: "",
    endDate: "",
  });
  const user = useContext(UserContext);

  const categories = [...new Set(transactions.map((t) => t.category))].sort();

  useEffect(() => {
    let result = [...transactions];

    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (t) =>
          t.description?.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q)
      );
    }

    if (filters.type !== "all") {
      result = result.filter((t) => t.type === filters.type);
    }

    if (filters.category !== "all") {
      result = result.filter((t) => t.category === filters.category);
    }

    if (filters.startDate) {
      result = result.filter((t) => new Date(t.date) >= new Date(filters.startDate));
    }

    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      result = result.filter((t) => new Date(t.date) <= end);
    }

    setFilteredTransactions(result);
  }, [transactions, filters]);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api("/api/transactions");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setTransactions(data);
      setError("");
    } catch (err) {
      console.error("Error fetching transactions:", err);
      setError("Failed to load transactions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      await api(`/api/transactions/${id}`, { method: "DELETE" });
      setDeletingId(null);
      setError("");
      fetchTransactions();
    } catch (err) {
      console.error("Error deleting transaction:", err);
      setError("Failed to delete transaction.");
      setDeletingId(null);
    }
  };

  const handleSaveEdit = async (updatedTransaction) => {
    try {
      const res = await api(`/api/transactions/${updatedTransaction._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedTransaction),
      });
      if (!res.ok) throw new Error("Failed to update");
      setEditingTransaction(null);
      setError("");
      fetchTransactions();
    } catch (err) {
      console.error("Error updating transaction:", err);
      setError("Failed to update transaction.");
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex justify-between">
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-slate-200 rounded w-24" />
                <div className="h-3 bg-slate-100 rounded w-16" />
              </div>
              <div className="h-5 bg-slate-200 rounded w-20" />
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="h-3 bg-slate-100 rounded w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <AnimatePresence>
        {editingTransaction && (
          <EditTransactionModal
            transaction={editingTransaction}
            onClose={() => setEditingTransaction(null)}
            onSave={handleSaveEdit}
          />
        )}
      </AnimatePresence>

      <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md">
        <h1 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">All Transactions</h1>

        {/* Inline error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
            <button onClick={() => setError("")} className="ml-2 text-red-500 hover:text-red-700 underline text-xs">
              Dismiss
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3">
          <input
            type="text"
            placeholder="Search..."
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            className="w-full sm:flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
          <div className="flex gap-2 flex-wrap">
            <select
              value={filters.type}
              onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
              className="flex-1 sm:flex-none px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <select
              value={filters.category}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
              className="flex-1 sm:flex-none px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
              className="flex-1 sm:flex-none px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 min-w-0 sm:min-w-[130px]"
              title="Start date"
            />
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
              className="flex-1 sm:flex-none px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 min-w-0 sm:min-w-[130px]"
              title="End date"
            />
          </div>
        </div>

        {(filters.search || filters.type !== "all" || filters.category !== "all" || filters.startDate || filters.endDate) && (
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
            <span>{filteredTransactions.length} result{filteredTransactions.length !== 1 ? "s" : ""}</span>
            <button
              onClick={() => setFilters({ search: "", type: "all", category: "all", startDate: "", endDate: "" })}
              className="text-indigo-600 hover:text-indigo-800 underline"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Desktop: Table view */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-xs font-medium text-slate-500 uppercase">Date</th>
                <th className="p-3 text-xs font-medium text-slate-500 uppercase">Type</th>
                <th className="p-3 text-xs font-medium text-slate-500 uppercase">Category</th>
                <th className="p-3 text-xs font-medium text-slate-500 uppercase">Amount</th>
                <th className="p-3 text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((t) => (
                <tr key={t._id} className="border-b hover:bg-gray-50">
                  <td className="p-3 text-sm">{formatDate(t.date)}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        t.type === "income"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {t.type}
                    </span>
                  </td>
                  <td className="p-3 text-sm">
                    {t.category}
                    {t.excludeFromBudget && (
                      <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        One-time
                      </span>
                    )}
                  </td>
                  <td
                    className={`p-3 text-sm font-semibold ${
                      t.type === "income" ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {formatCurrency(t.amount, user?.currency)}
                  </td>
                  <td className="p-3">
                    {deletingId === t._id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(t._id)}
                          className="text-xs text-red-600 px-2 py-1 rounded hover:bg-red-50 font-medium"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="text-xs text-slate-400 px-2 py-1 rounded hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingTransaction(t)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-md hover:bg-slate-100"
                          title="Edit"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => setDeletingId(t._id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-slate-100"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredTransactions.length === 0 && (
            <p className="text-center py-10 text-gray-500">
              {transactions.length === 0
                ? "You have no transactions."
                : "No transactions match your filters."}
            </p>
          )}
        </div>

        {/* Mobile: Card view */}
        <div className="sm:hidden space-y-3">
          {filteredTransactions.map((t) => (
            <TransactionCard
              key={t._id}
              transaction={t}
              userCurrency={user?.currency}
              onEdit={setEditingTransaction}
              onDelete={handleDelete}
            />
          ))}
          {filteredTransactions.length === 0 && (
            <p className="text-center py-10 text-gray-500">
              {transactions.length === 0
                ? "You have no transactions."
                : "No transactions match your filters."}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
