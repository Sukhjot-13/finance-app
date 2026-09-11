// src/app/(main)/transactions/page.js
"use client";

import { useState, useEffect, useContext, useRef } from "react";
import { formatCurrency, formatDate, formatDateForInput } from "@/lib/utils";
import api from "@/lib/api";
import { useDialogA11y } from "@/lib/useDialogA11y";
import { Trash2, Edit, X, Search, Filter, ArrowUpRight, ArrowDownRight, Calendar, ArrowLeft, ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { UserContext } from "@/app/(main)/layout";

// Edit Transaction Modal Component (exported for tests)
export function EditTransactionModal({ transaction, onClose, onSave }) {
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
      const nextValue = e.target.type === "checkbox" ? e.target.checked : value;
      setFormData((prev) => ({ ...prev, [name]: nextValue }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setModalError("");
    let finalCategory = formData.category;
    if (isAddingNewCategory) {
      if (!newCategory.trim()) {
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
      className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4"
    >
      <motion.div
        ref={panelRef}
        initial={{ y: -20, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: -20, opacity: 0, scale: 0.96 }}
        className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-6 w-full max-w-md text-zinc-100"
        role="dialog"
        aria-modal="true"
        aria-label="Edit Transaction"
      >
        <div className="flex justify-between items-center mb-5 pb-3 border-b border-zinc-800">
          <h2 className="text-base font-bold tracking-tight text-zinc-100">Edit Transaction</h2>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-800/60 transition-colors">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {modalError && (
            <p className="p-3 text-xs font-medium text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl">
              {modalError}
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-1.5">Type</label>
            <div className="flex gap-2">
              {["expense", "income"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setFormData((prev) => ({
                      ...prev,
                      type: t,
                      category: "",
                      ...(t === "income" ? { excludeFromBudget: false } : {}),
                    }));
                    setIsAddingNewCategory(false);
                  }}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${
                    formData.type === t
                      ? t === "expense"
                        ? "bg-rose-600 border-rose-500 text-white shadow-sm"
                        : "bg-emerald-600 border-emerald-500 text-white shadow-sm"
                      : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-1.5">Amount</label>
            <input
              type="number"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
              step="0.01"
              min="0.01"
              required
              data-autofocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-1.5">Category</label>
            <select
              name="category"
              value={isAddingNewCategory ? "add_new" : formData.category}
              onChange={handleChange}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 cursor-pointer"
              required
            >
              <option value="" disabled className="bg-zinc-900 text-zinc-500">Select a category</option>
              {currentCategories.map((cat) => (
                <option key={cat} value={cat} className="bg-zinc-900 text-zinc-200">{cat}</option>
              ))}
              <option value="add_new" className="bg-zinc-900 text-emerald-400 font-semibold">+ Add New Category</option>
            </select>
          </div>

          {isAddingNewCategory && (
            <div className="p-3 bg-zinc-950 rounded-xl border border-emerald-500/30 space-y-1.5">
              <label className="block text-xs font-semibold text-emerald-400 uppercase tracking-wider font-mono">New Category Name</label>
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                maxLength={50}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-1.5">Date</label>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-1.5">Description</label>
            <input
              type="text"
              name="description"
              value={formData.description || ''}
              onChange={handleChange}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
              maxLength={200}
            />
          </div>

          {formData.type === "expense" && (
            <label className="flex items-start gap-3 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 cursor-pointer hover:border-zinc-700">
              <input
                type="checkbox"
                name="excludeFromBudget"
                checked={!!formData.excludeFromBudget}
                onChange={handleChange}
                className="mt-0.5 h-4 w-4 rounded bg-zinc-900 border-zinc-700 text-emerald-500 focus:ring-emerald-500/40 cursor-pointer"
              />
              <div>
                <span className="block text-xs font-semibold text-zinc-200">
                  One-time expense
                </span>
                <span className="block text-[11px] text-zinc-400">
                  {"Don't count this in my monthly budget"}
                </span>
              </div>
            </label>
          )}

          <div className="pt-3 flex justify-end gap-2.5 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-gradient-to-r from-emerald-400 to-teal-500 text-zinc-950 font-bold px-5 py-2 rounded-xl text-xs shadow-lg shadow-emerald-500/20 hover:from-emerald-300 hover:to-teal-400 transition-all disabled:opacity-50"
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
    <div className="bg-zinc-950/70 rounded-xl border border-zinc-800/80 p-4 space-y-3 shadow-md">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider font-mono ${
                transaction.type === "income"
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
              }`}
            >
              {transaction.type}
            </span>
            <span className="text-sm font-semibold text-zinc-200 truncate capitalize">
              {transaction.category}
            </span>
            {transaction.excludeFromBudget && (
              <span className="shrink-0 text-[10px] font-mono uppercase text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                One-time
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 font-mono mt-1">{formatDate(transaction.date)}</p>
        </div>
        <span
          className={`shrink-0 text-base font-bold tabular-nums ${
            transaction.type === "income" ? "text-emerald-400" : "text-zinc-100"
          }`}
        >
          {transaction.type === "income" ? "+" : "-"}{" "}
          {formatCurrency(transaction.amount, userCurrency)}
        </span>
      </div>
      {transaction.description && (
        <p className="text-xs text-zinc-400 truncate pl-0.5">{transaction.description}</p>
      )}
      <div className="flex items-center gap-2 pt-2 border-t border-zinc-800/60">
        <button
          onClick={() => onEdit(transaction)}
          className="flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-emerald-400 px-2.5 py-1 rounded-lg hover:bg-zinc-800/60 transition-colors"
        >
          <Edit size={13} />
          Edit
        </button>
        {deleting ? (
          <div className="flex items-center gap-1.5 ml-auto">
            <button
              onClick={() => { onDelete(transaction._id); setDeleting(false); }}
              className="flex items-center gap-1 text-xs font-semibold text-rose-300 bg-rose-500/20 px-2.5 py-1 rounded-lg hover:bg-rose-500/30 transition-colors"
            >
              <Trash2 size={13} />
              Confirm
            </button>
            <button
              onClick={() => setDeleting(false)}
              className="text-xs text-zinc-400 px-2 py-1 rounded-lg hover:bg-zinc-800/60"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setDeleting(true)}
            className="flex items-center gap-1 text-xs font-medium text-zinc-400 hover:text-rose-400 px-2.5 py-1 rounded-lg hover:bg-zinc-800/60 transition-colors ml-auto"
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

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

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
          ...new Set([...(data.expense || []), ...(data.income || [])]),
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
        }
        throw new Error(message);
      }
      setEditingTransaction(null);
      setError("");
      refetchCurrentPage();
      return { ok: true };
    } catch (err) {
      console.error("Error updating transaction:", err);
      return { ok: false, message: err.message || "Failed to update transaction." };
    }
  };

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-zinc-900/60 rounded-2xl border border-zinc-800/80 p-5">
            <div className="flex justify-between">
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-zinc-800 rounded w-28" />
                <div className="h-3 bg-zinc-800/60 rounded w-16" />
              </div>
              <div className="h-5 bg-zinc-800 rounded w-24" />
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

      <div className="bg-zinc-900/80 p-6 sm:p-8 rounded-2xl border border-zinc-800/90 shadow-xl backdrop-blur-md space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">All Transactions</h1>
        </div>

        {/* Inline error */}
        {error && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs font-medium text-rose-300 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError("")} className="text-xs underline text-rose-400 hover:text-rose-200">
              Dismiss
            </button>
          </div>
        )}

        {/* Filters bar */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
          <div className="relative w-full sm:flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search..."
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 transition-all"
            />
          </div>
          <div className="flex gap-2.5 flex-wrap">
            <select
              value={filters.type}
              onChange={(e) => updateFilter("type", e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 cursor-pointer"
            >
              <option value="all">All Types</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <select
              value={filters.category}
              onChange={(e) => updateFilter("category", e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 cursor-pointer"
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
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 min-w-0 sm:min-w-[130px]"
              title="Start date"
            />
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => updateFilter("endDate", e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 min-w-0 sm:min-w-[130px]"
              title="End date"
            />
          </div>
        </div>

        {(hasActiveFilters || pageInfo.total > 0) && (
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-zinc-400 px-1">
            <span>
              <span className="font-bold text-zinc-200">{pageInfo.total}</span> transaction{pageInfo.total !== 1 ? "s" : ""}
              {hasActiveFilters ? " match your filters" : ""}
            </span>
            {pageInfo.totalPages > 1 && (
              <span className="font-mono text-zinc-500">
                Page {pageInfo.page} of {pageInfo.totalPages}
              </span>
            )}
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-emerald-400 hover:text-emerald-300 underline font-medium">
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Desktop: Table view */}
        <div className="hidden sm:block overflow-x-auto rounded-xl border border-zinc-800/80">
          <table className="w-full text-left">
            <thead className="bg-zinc-950/80 border-b border-zinc-800/80">
              <tr>
                <th className="p-3.5 text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wider">Date</th>
                <th className="p-3.5 text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wider">Type</th>
                <th className="p-3.5 text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wider">Category</th>
                <th className="p-3.5 text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wider">Description</th>
                <th className="p-3.5 text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wider">Amount</th>
                <th className="p-3.5 text-xs font-mono font-semibold text-zinc-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {transactions.map((t) => (
                <tr key={t._id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="p-3.5 text-xs font-mono text-zinc-400">{formatDate(t.date)}</td>
                  <td className="p-3.5">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider font-mono ${
                        t.type === "income"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}
                    >
                      {t.type}
                    </span>
                  </td>
                  <td className="p-3.5 text-sm font-semibold text-zinc-200 capitalize">
                    {t.category}
                    {t.excludeFromBudget && (
                      <span className="ml-2 text-[10px] font-mono uppercase text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                        One-time
                      </span>
                    )}
                  </td>
                  <td className="p-3.5 text-sm text-zinc-400 max-w-[240px] truncate" title={t.description || ""}>
                    {t.description || "—"}
                  </td>
                  <td
                    className={`p-3.5 text-sm font-bold font-mono tabular-nums ${
                      t.type === "income" ? "text-emerald-400" : "text-zinc-200"
                    }`}
                  >
                    {t.type === "income" ? "+" : "-"}{" "}
                    {formatCurrency(t.amount, user?.currency)}
                  </td>
                  <td className="p-3.5 text-right">
                    {deletingId === t._id ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleDelete(t._id)}
                          className="text-xs font-semibold text-rose-300 bg-rose-500/20 px-2.5 py-1 rounded-lg hover:bg-rose-500/30 transition-colors"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="text-xs text-zinc-400 px-2 py-1 rounded-lg hover:bg-zinc-800/60"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditingTransaction(t)}
                          className="p-1.5 text-zinc-400 hover:text-emerald-400 rounded-lg hover:bg-zinc-800/60 transition-colors"
                          title="Edit"
                        >
                          <Edit size={15} />
                        </button>
                        <button
                          onClick={() => setDeletingId(t._id)}
                          className="p-1.5 text-zinc-400 hover:text-rose-400 rounded-lg hover:bg-zinc-800/60 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {transactions.length === 0 && (
            <p className="text-center py-12 text-sm text-zinc-500">
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
            <p className="text-center py-12 text-sm text-zinc-500">
              {hasActiveFilters
                ? "No transactions match your filters."
                : "You have no transactions."}
            </p>
          )}
        </div>

        {/* Pagination */}
        {pageInfo.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-3 pt-4 border-t border-zinc-800/80">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={pageInfo.page <= 1}
              className="flex items-center gap-1 px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ArrowLeft size={14} />
              Previous
            </button>
            <span className="text-xs font-mono text-zinc-400 px-2">
              Page {pageInfo.page} of {pageInfo.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, pageInfo.totalPages))}
              disabled={pageInfo.page >= pageInfo.totalPages}
              className="flex items-center gap-1 px-4 py-2 text-xs font-semibold rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Next
              <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
