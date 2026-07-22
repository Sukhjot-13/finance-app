"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { defaultExpenseCategories, defaultIncomeCategories } from "@/lib/constants";

export default function CategoriesPage() {
  const [categories, setCategories] = useState({ expense: [], income: [], allCustom: [] });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("expense");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");

  const fetchCategories = async () => {
    try {
      const res = await fetch("/api/categories");
      const data = await res.json();
      setCategories(data);
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  // Only show custom categories (no built-in defaults)
  const allCustoms = categories.allCustom.map((c) => ({ ...c, isDefault: false }));
  const displayItems = allCustoms.filter((item) => {
    if (filter === "all") return true;
    return item.type === filter;
  });

  // Check if a category name matches a built-in default
  const isDefaultCategory = (name, type) => {
    if (type === "expense") return defaultExpenseCategories.includes(name);
    if (type === "income") return defaultIncomeCategories.includes(name);
    return false;
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
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

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), type: newType }),
      });
      if (!res.ok) {
        const data = await res.json();
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
      <div className="animate-pulse space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 bg-slate-200 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Categories</h1>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          <Plus size={16} />
          Add Category
        </button>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-wrap items-end gap-3">
          {error && (
            <p className="w-full text-sm text-red-600">{error}</p>
          )}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Category name"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 disabled:bg-indigo-400"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => { setShowAddForm(false); setNewName(""); }}
              className="px-3 py-2 text-sm text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Inline error banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError("")} className="text-red-500 hover:text-red-700 underline text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {["all", "expense", "income"].map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize ${
              filter === tab
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {tab === "all" ? "All" : tab}
          </button>
        ))}
      </div>

      {/* Categories list */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 divide-y divide-slate-100">
        {displayItems.length === 0 && (
          <p className="text-center text-slate-400 py-10">
            {filter === "all"
              ? "No custom categories yet. Click \"Add Category\" to create one."
              : `No custom ${filter} categories yet.`}
          </p>
        )}
        {displayItems.map((item) => (
          <div key={item._id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <span
                className={`w-2 h-2 rounded-full ${
                  item.type === "expense" ? "bg-red-400" : "bg-green-400"
                }`}
              />
              <div>
                <span className="font-medium text-slate-700 capitalize">{item.name}</span>
                {isDefaultCategory(item.name, item.type) && (
                  <span className="ml-2 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    Matches default
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase text-slate-400 mr-2">{item.type}</span>
              {deletingId === item._id ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleDelete(item._id)}
                    className="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 rounded hover:bg-red-100"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setDeletingId(null)}
                    className="px-2 py-1 text-xs text-slate-400 hover:text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeletingId(item._id)}
                  className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-slate-100"
                  title="Delete"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
