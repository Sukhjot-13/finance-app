// FILE: src/app/(main)/transactions/page.js
// Page for viewing and managing all transactions.

"use client";

import { useState, useEffect } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Trash2, Edit } from "lucide-react";

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = async () => {
    setLoading(true);
    const res = await fetch("/api/transactions");
    const data = await res.json();
    setTransactions(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const handleDelete = async (id) => {
    if (confirm("Are you sure you want to delete this transaction?")) {
      await fetch(`/api/transactions/${id}`, { method: "DELETE" });
      fetchTransactions(); // Refresh list
    }
  };

  if (loading)
    return <div className="text-center p-10">Loading transactions...</div>;

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-6">All Transactions</h1>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">Type</th>
              <th className="p-3">Category</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr key={t._id} className="border-b hover:bg-gray-50">
                <td className="p-3">{formatDate(t.date)}</td>
                <td className="p-3 capitalize">
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
                <td className="p-3">{t.category}</td>
                <td
                  className={`p-3 font-semibold ${
                    t.type === "income" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {formatCurrency(t.amount)}
                </td>
                <td className="p-3">
                  <button
                    onClick={() =>
                      alert("Edit functionality not yet implemented.")
                    }
                    className="text-gray-500 hover:text-indigo-600 mr-2"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(t._id)}
                    className="text-gray-500 hover:text-red-600"
                  >
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {transactions.length === 0 && (
          <p className="text-center py-10 text-gray-500">
            You have no transactions.
          </p>
        )}
      </div>
    </div>
  );
}
