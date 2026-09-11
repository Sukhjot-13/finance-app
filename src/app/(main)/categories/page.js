// src/app/(main)/categories/page.js
"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Pencil, Tags, Check, X, Tag, FolderPlus } from "lucide-react";
import api from "@/lib/api";
import { defaultExpenseCategories, defaultIncomeCategories } from "@/lib/constants";

export default function CategoriesPage() {
  const [categories, setCategories] = useState({ expense: [], income: [], allCustom: [] });
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [filter, setFilter] = useState("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("expense");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [savingRename, setSavingRename] = useState(false);
  const [error, setError] = useState("");

  const fetchCategories = async () => {
    try {
      const res = await api("/api/categories");
      if (!res.ok) throw new Error("Failed to fetch categories");
      const data = await res.json();
      setCategories(data);
      setFetchFailed(false);
    } catch (error) {
      console.error("Failed to fetch categories:", error);
      setFetchFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCategories();
  }, []);

  const allCustoms = categories.allCustom.map((c) => ({ ...c, isDefault: false }));
  const displayItems = allCustoms.filter((item) => {
    if (filter === "all") return true;
    return item.type === filter;
  });

  const isDefaultCategory = (name, type) => {
    if (type === "expense") return defaultExpenseCategories.includes(name);
    if (type === "income") return defaultIncomeCategories.includes(name);
    return false;
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      const res = await api(`/api/categories/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Failed to delete category");
        setDeletingId(null);
        return;
      }
      setDeletingId(null);
      setError("");
      fetchCategories();
    } catch (error) {
      setError("Failed to delete category");
      setDeletingId(null);
    }
  };

  const handleRenameStart = (item) => {
    setRenamingId(item._id);
    setRenameValue(item.name);
    setError("");
  };

  const handleRenameCancel = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  const handleRenameSubmit = async (_id) => {
    if (!renameValue.trim()) return;
    setSavingRename(true);
    try {
      const res = await api(`/api/categories/${_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Failed to rename category");
        return;
      }
      setRenamingId(null);
      setRenameValue("");
      setError("");
      fetchCategories();
    } catch {
      setError("Failed to rename category");
    } finally {
      setSavingRename(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await api("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), type: newType }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Failed to create category");
        setSaving(false);
        return;
      }
      setNewName("");
      setShowAddForm(false);
      setError("");
      fetchCategories();
    } catch (error) {
      setError("Failed to create category");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4 max-w-4xl mx-auto">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-zinc-900/60 border border-zinc-800/80 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Top Header Card */}
      <div className="bg-zinc-900/80 border border-zinc-800/90 p-6 sm:p-8 rounded-2xl shadow-xl backdrop-blur-md space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
              <Tags size={20} />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
                Categories
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Customize your income and expense categories for tailored budgeting.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setNewType(filter === "income" ? "income" : "expense");
              setShowAddForm(true);
            }}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-400 to-teal-500 text-zinc-950 font-bold px-4 py-2.5 rounded-xl text-xs shadow-lg shadow-emerald-500/20 hover:from-emerald-300 hover:to-teal-400 transition-all active:scale-[0.98]"
          >
            <Plus size={16} className="stroke-[3]" />
            Add Category
          </button>
        </div>

        {/* Add Category Form */}
        {showAddForm && (
          <form onSubmit={handleAdd} className="bg-zinc-950 p-5 rounded-2xl border border-emerald-500/30 flex flex-wrap items-end gap-3.5 shadow-inner">
            {error && (
              <p className="w-full text-xs font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl">{error}</p>
            )}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-1.5">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
                placeholder="Category name"
                maxLength={50}
                autoFocus
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-1.5">Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 cursor-pointer"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-4 py-2 rounded-xl text-xs transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => { setShowAddForm(false); setNewName(""); }}
                className="px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Inline error banner */}
        {error && !showAddForm && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 flex items-center justify-between text-xs font-medium text-rose-300">
            <p>{error}</p>
            <button onClick={() => setError("")} className="underline text-rose-400 hover:text-rose-200">
              Dismiss
            </button>
          </div>
        )}

        {/* Fetch failure banner */}
        {fetchFailed && !loading && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3.5 flex items-center justify-between text-xs font-medium text-rose-300">
            <p>Couldn&apos;t load your categories. Please try again.</p>
            <button
              onClick={fetchCategories}
              className="px-3 py-1 bg-rose-500/20 text-rose-200 rounded-lg hover:bg-rose-500/30 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800 w-fit">
          {["all", "expense", "income"].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                filter === tab
                  ? "bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {tab === "all" ? "All" : tab}
            </button>
          ))}
        </div>

        {/* Categories list */}
        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 divide-y divide-zinc-800/60 overflow-hidden">
          {displayItems.length === 0 && !fetchFailed && (
            <div className="p-10 text-center text-zinc-500 text-xs">
              <p>
                {filter === "all"
                  ? 'No custom categories yet. Click "Add Category" to create one.'
                  : `No custom ${filter} categories yet.`}
              </p>
            </div>
          )}
          {displayItems.map((item) => (
            <div key={item._id} className="flex items-center justify-between p-4 hover:bg-zinc-900/40 transition-colors">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    item.type === "expense" ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                  }`}
                />
                {renamingId === item._id ? (
                  <div className="flex items-center gap-2 w-full max-w-md">
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameSubmit(item._id);
                        if (e.key === "Escape") handleRenameCancel();
                      }}
                      maxLength={50}
                      autoFocus
                      className="flex-1 bg-zinc-900 border border-emerald-500/40 rounded-xl px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <button
                      onClick={() => handleRenameSubmit(item._id)}
                      disabled={savingRename || !renameValue.trim()}
                      className="px-3 py-1.5 text-xs font-bold bg-emerald-500 text-zinc-950 rounded-xl hover:bg-emerald-400 disabled:opacity-40 transition-all"
                    >
                      {savingRename ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={handleRenameCancel}
                      className="px-2.5 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-zinc-200 capitalize">{item.name}</span>
                    {isDefaultCategory(item.name, item.type) && (
                      <span className="text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-md border border-amber-500/20">
                        Matches default
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono uppercase font-bold text-zinc-500 tracking-wider mr-1">
                  {item.type}
                </span>
                {deletingId === item._id ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-zinc-400 hidden sm:inline">
                      Move to &quot;Other&quot;?
                    </span>
                    <button
                      onClick={() => handleDelete(item._id)}
                      className="px-2.5 py-1 text-xs font-semibold text-rose-300 bg-rose-500/20 rounded-lg hover:bg-rose-500/30 transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                  </div>
                ) : renamingId === item._id ? null : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleRenameStart(item)}
                      className="p-1.5 text-zinc-400 hover:text-emerald-400 rounded-lg hover:bg-zinc-800/60 transition-colors"
                      title="Rename"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => setDeletingId(item._id)}
                      className="p-1.5 text-zinc-400 hover:text-rose-400 rounded-lg hover:bg-zinc-800/60 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Built-in Defaults Reference */}
      <div className="bg-zinc-900/40 border border-zinc-800/60 p-6 rounded-2xl backdrop-blur-sm space-y-4">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono">
          System Default Categories
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/60">
            <h4 className="text-xs font-semibold text-rose-400 mb-2.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              Default Expenses
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {defaultExpenseCategories.map((c) => (
                <span key={c} className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-900 text-zinc-300 border border-zinc-800">
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800/60">
            <h4 className="text-xs font-semibold text-emerald-400 mb-2.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Default Incomes
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {defaultIncomeCategories.map((c) => (
                <span key={c} className="text-[11px] px-2.5 py-1 rounded-lg bg-zinc-900 text-zinc-300 border border-zinc-800">
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
