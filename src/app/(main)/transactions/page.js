// src/app/(main)/transactions/page.js
"use client";

import { useState, useEffect, useContext, useRef } from "react";
import { formatCurrency, formatDate, formatDateForInput } from "@/lib/utils";
import api from "@/lib/api";
import { useDialogA11y } from "@/lib/useDialogA11y";
import { Trash2, Edit, X, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { UserContext } from "@/app/(main)/layout";

// Edit Transaction Modal Component (exported for tests)
export function EditTransactionModal({ transaction, onClose, onSave }) {
  // Normalize the stored date to "YYYY-MM-DD" (local timezone) so the date
  // input shows exactly the date the user sees in the list. Dates are stored
  // as instants, so they must be converted with the viewer's local getters.
  const [formData, setFormData] = useState(() => ({
    ...transaction,
    date: formatDateForInput(new Date(transaction.date)),
  }));
  const [categories, setCategories] = useState({ expense: [], income: [] });
  const [newCategory, setNewCategory] = useState("");
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [modalError, setModalError] = useState("");
  const [saving, setSaving] = useState(false);
  const panelRef = useRef(null);

  // Escape closes, focus is trapped inside, body scroll locks while open,
  // and focus returns to the trigger on close (shared overlay behavior).
  useDialogA11y({ ref: panelRef, isOpen: true, onClose });

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await api("/api/categories");
        if (!res.ok) throw new Error("Failed to load categories");
        const data = await res.json();
        setCategories(data);
      } catch (err) {
        console.error("Failed to fetch categories:", err);
      }
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
    setModalError("");
    let finalCategory = formData.category;
    if (isAddingNewCategory) {
      if (!newCategory) {
        setModalError("Please enter a name for the new category.");
        return;
      }
      try {
        const res = await api("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newCategory.trim(), type: formData.type }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || "Failed to create category.");
        }
        finalCategory = newCategory.trim();
        setIsAddingNewCategory(false);
        setCategoryAfterSave(finalCategory);
      } catch (err) {
        setModalError(err.message);
        return;
      }
    }
    // Send the date as an instant at 12:00 noon in the user's local timezone,
    // matching AddTransactionDrawer (see the comment there). Send only the
    // editable fields — never echo _id/userId/timestamps back to the server.
    setSaving(true);
    try {
      const result = await onSave({
        type: formData.type,
        amount: formData.amount,
        category: finalCategory,
        date: new Date(formData.date + "T12:00:00"),
        description: formData.description,
        excludeFromBudget: !!formData.excludeFromBudget,
      });
      // Parent keeps the modal open on failure and reports back here.
      if (result && !result.ok) {
        setModalError(result.message || "Failed to update transaction.");
      }
    } finally {
      setSaving(false);
    }
  };

  const setCategoryAfterSave = (value) => {
    setFormData((prev) => ({ ...prev, category: value }));
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
        ref={panelRef}
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -50, opacity: 0 }}
        className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md"
        role="dialog"
        aria-modal="true"
        aria-label="Edit Transaction"
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Edit Transaction</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800">
            <X size={24} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          {modalError && (
            <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
              {modalError}
            </p>
          )}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Type</label>
              <div className="mt-1 flex gap-2">
                {["expense", "income"].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, type: t, category: "" }));
                      setIsAddingNewCategory(false);
                    }}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium border capitalize ${
                      formData.type === t
                        ? t === "expense"
                          ? "bg-red-50 border-red-300 text-red-700"
                          : "bg-green-50 border-green-300 text-green-700"
                        : "border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Amount</label>
              <input
                type="number" name="amount" value={formData.amount}
                onChange={handleChange}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                step="0.01"
                min="0.01"
                required
                data-autofocus
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
                maxLength={200}
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
                    {"Don't count this in my monthly budget"}
                  </span>
                </span>
              </label>
            )}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-md text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:bg-indigo-400"
            >
              {saving ? "Saving..." : "Save Changes"}
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
const PAGE_SIZE = 50;

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [pageInfo, setPageInfo] = useState({ page: 1, totalPages: 1, total: 0 });
  const [page, setPage] = useState(1);
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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryOptions, setCategoryOptions] = useState([]);
  const { user } = useContext(UserContext);

  // Debounce the search box so typing doesn't hammer the server.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  // Category filter options come from the merged defaults+custom list
  // (server-side paging means the current page no longer holds every
  // category ever used).
  useEffect(() => {
    let cancelled = false;
    api("/api/categories")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load categories");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const names = [
          ...(data.expense || []),
          ...(data.income || []),
        ].sort((a, b) => a.localeCompare(b));
        setCategoryOptions(names);
      })
      .catch((err) =>
        console.error("Failed to load category options:", err)
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const buildQueryString = (targetPage) => {
    const params = new URLSearchParams();
    params.set("page", String(targetPage));
    params.set("limit", String(PAGE_SIZE));
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (filters.type !== "all") params.set("type", filters.type);
    if (filters.category !== "all") params.set("category", filters.category);
    if (filters.startDate) {
      params.set(
        "from",
        new Date(filters.startDate + "T00:00:00").toISOString()
      );
    }
    if (filters.endDate) {
      params.set(
        "to",
        new Date(filters.endDate + "T23:59:59.999").toISOString()
      );
    }
    return params.toString();
  };

  // Server-side filtered + paginated fetch. Runs whenever the page number
  // or any filter changes (search is debounced).
  useEffect(() => {
    let cancelled = false;
    api(`/api/transactions?${buildQueryString(page)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setTransactions(data.transactions || []);
        setPageInfo({
          page: data.page || page,
          totalPages: data.totalPages || 1,
          total: data.total ?? 0,
        });
        setError("");
      })
      .catch((err) => {
        console.error("Error fetching transactions:", err);
        if (!cancelled) setError("Failed to load transactions.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, filters.type, filters.category, filters.startDate, filters.endDate]);

  // Filter updates always snap back to page 1.
  const updateFilter = (key, value) => {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const clearFilters = () => {
    setPage(1);
    setFilters({ search: "", type: "all", category: "all", startDate: "", endDate: "" });
  };

  const hasActiveFilters =
    Boolean(filters.search.trim()) ||
    filters.type !== "all" ||
    filters.category !== "all" ||
    Boolean(filters.startDate) ||
    Boolean(filters.endDate);

  const refetchCurrentPage = () => {
    api(`/api/transactions?${buildQueryString(page)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((data) => {
        setTransactions(data.transactions || []);
        setPageInfo((prev) => ({
          ...prev,
          total: data.total ?? prev.total,
          totalPages: data.totalPages || prev.totalPages,
        }));
        setError("");
      })
      .catch(console.error);
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      const res = await api(`/api/transactions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      setDeletingId(null);
      setError("");
      // If this was the only row on a page past the first, stepping back
      // avoids stranding the user on an empty page ("Page 3 of 2").
      if (transactions.length === 1 && page > 1) {
        setPage((p) => Math.max(p - 1, 1));
      } else {
        refetchCurrentPage();
      }
    } catch (err) {
      console.error("Error deleting transaction:", err);
      setError("Failed to delete transaction.");
      setDeletingId(null);
    }
  };

  const handleSaveEdit = async (id, updatedFields) => {
    try {
      const res = await api(`/api/transactions/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedFields),
      });
      if (!res.ok) {
        let message = "Failed to update transaction.";
        try {
          const data = await res.json();
          if (data?.message) message = data.message;
        } catch {
          // non-JSON error body
        }
        throw new Error(message);
      }
      setEditingTransaction(null);
      setError("");
      refetchCurrentPage();
      return { ok: true };
    } catch (err) {
      console.error("Error updating transaction:", err);
      // Return the failure so the open edit modal can show it inline —
      // a page-level banner would be hidden behind the modal overlay.
      return { ok: false, message: err.message || "Failed to update transaction." };
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
            onSave={(fields) => handleSaveEdit(editingTransaction._id, fields)}
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
            onChange={(e) => updateFilter("search", e.target.value)}
            className="w-full sm:flex-1 px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
          />
          <div className="flex gap-2 flex-wrap">
            <select
              value={filters.type}
              onChange={(e) => updateFilter("type", e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <select
              value={filters.category}
              onChange={(e) => updateFilter("category", e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="all">All Categories</option>
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => updateFilter("startDate", e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 min-w-0 sm:min-w-[130px]"
              title="Start date"
            />
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => updateFilter("endDate", e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 min-w-0 sm:min-w-[130px]"
              title="End date"
            />
          </div>
        </div>

        {(hasActiveFilters || pageInfo.total > 0) && (
          <div className="mb-4 flex items-center justify-between gap-2 flex-wrap text-sm text-slate-500">
            <span>
              {pageInfo.total} transaction{pageInfo.total !== 1 ? "s" : ""}
              {hasActiveFilters ? " match your filters" : ""}
            </span>
            {pageInfo.totalPages > 1 && (
              <span className="text-xs">
                Page {pageInfo.page} of {pageInfo.totalPages}
              </span>
            )}
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-indigo-600 hover:text-indigo-800 underline">
                Clear filters
              </button>
            )}
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
                <th className="p-3 text-xs font-medium text-slate-500 uppercase">Description</th>
                <th className="p-3 text-xs font-medium text-slate-500 uppercase">Amount</th>
                <th className="p-3 text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
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
                  <td className="p-3 text-sm text-slate-500 max-w-[220px] truncate" title={t.description || ""}>
                    {t.description || "—"}
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
          {transactions.length === 0 && (
            <p className="text-center py-10 text-gray-500">
              {hasActiveFilters
                ? "No transactions match your filters."
                : "You have no transactions."}
            </p>
          )}
        </div>

        {/* Mobile: Card view */}
        <div className="sm:hidden space-y-3">
          {transactions.map((t) => (
            <TransactionCard
              key={t._id}
              transaction={t}
              userCurrency={user?.currency}
              onEdit={setEditingTransaction}
              onDelete={handleDelete}
            />
          ))}
          {transactions.length === 0 && (
            <p className="text-center py-10 text-gray-500">
              {hasActiveFilters
                ? "No transactions match your filters."
                : "You have no transactions."}
            </p>
          )}
        </div>

        {/* Pagination */}
        {pageInfo.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={pageInfo.page <= 1}
              className="px-4 py-2 text-sm rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500">
              Page {pageInfo.page} of {pageInfo.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, pageInfo.totalPages))}
              disabled={pageInfo.page >= pageInfo.totalPages}
              className="px-4 py-2 text-sm rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </>
  );
}
