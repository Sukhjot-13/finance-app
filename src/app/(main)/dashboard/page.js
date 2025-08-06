// src/app/(main)/dashboard/page.js
"use client";

import { useState, useEffect } from "react";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, TrendingUp, TrendingDown, PiggyBank } from "lucide-react";
import AddTransactionDrawer from "@/components/AddTransactionDrawer"; // The new drawer

ChartJS.register(ArcElement, Tooltip, Legend);

// Redesigned StatCard with better aesthetics
function StatCard({ title, value, icon: Icon, colorClass = "text-slate-800" }) {
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm flex items-center space-x-4">
      <div className={`p-3 rounded-full bg-slate-100 ${colorClass}`}>
        <Icon size={24} />
      </div>
      <div>
        <h2 className="text-sm font-medium text-slate-500">{title}</h2>
        <p className={`text-2xl font-bold text-slate-800`}>{value}</p>
      </div>
    </div>
  );
}

// A simple skeleton loader for a better loading experience
function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-slate-200 h-24 rounded-xl"></div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 bg-slate-200 h-96 rounded-xl"></div>
        <div className="lg:col-span-2 bg-slate-200 h-96 rounded-xl"></div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reports/dashboard");
      if (!res.ok) throw new Error("Failed to fetch dashboard data");
      const result = await res.json();
      setData(result);
    } catch (error) {
      console.error(error);
      setData(null); // Ensure data is null on error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!data) {
    return (
      <div className="text-center p-10 text-red-500 bg-red-50 rounded-lg">
        Could not load dashboard data. Please try again later.
      </div>
    );
  }

  const pieData = {
    labels: data.expenseBreakdown.map((item) => item.category),
    datasets: [
      {
        data: data.expenseBreakdown.map((item) => item.total),
        backgroundColor: [
          "#ef4444",
          "#3b82f6",
          "#f97316",
          "#14b8a6",
          "#8b5cf6",
          "#eab308",
          "#d946ef",
        ],
        borderColor: "#ffffff",
        borderWidth: 2,
      },
    ],
  };

  const pieOptions = {
    responsive: true,
    plugins: { legend: { position: "bottom" } },
  };

  return (
    <>
      <AddTransactionDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onTransactionAdded={fetchData}
      />
      <div className="space-y-6 sm:space-y-8">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            title="Current Balance"
            value={formatCurrency(data.currentBalance)}
            icon={PiggyBank}
          />
          <StatCard
            title="Income This Month"
            value={formatCurrency(data.monthlyIncome)}
            icon={TrendingUp}
            colorClass="text-green-600"
          />
          <StatCard
            title="Expenses This Month"
            value={formatCurrency(data.monthlyExpenses)}
            icon={TrendingDown}
            colorClass="text-red-600"
          />
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Recent Transactions */}
          <div className="lg:col-span-3 bg-white p-6 rounded-xl shadow-sm">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              Recent Transactions
            </h2>
            <ul className="space-y-3">
              {data.recentTransactions.length > 0 ? (
                data.recentTransactions.map((t) => (
                  <li
                    key={t._id}
                    className="flex justify-between items-center p-2 -mx-2 rounded-md hover:bg-slate-50 transition-colors"
                  >
                    <div>
                      <p className="font-medium capitalize text-slate-700">
                        {t.description || t.category}
                      </p>
                      <p className="text-sm text-slate-500">
                        {formatDate(t.date)}
                      </p>
                    </div>
                    <p
                      className={`font-semibold ${
                        t.type === "income" ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {t.type === "income" ? "+" : "-"}{" "}
                      {formatCurrency(t.amount)}
                    </p>
                  </li>
                ))
              ) : (
                <p className="text-center text-slate-500 py-8">
                  No transactions yet.
                </p>
              )}
            </ul>
          </div>

          {/* Expense Chart */}
          <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm flex flex-col">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              Expense Breakdown
            </h2>
            {data.expenseBreakdown.length > 0 ? (
              <div className="flex-1 flex items-center justify-center h-64 md:h-auto">
                <Pie data={pieData} options={pieOptions} />
              </div>
            ) : (
              <div className="text-center text-slate-500 flex-1 flex items-center justify-center">
                <p>No expenses recorded this month.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => setIsDrawerOpen(true)}
        className="fixed bottom-6 right-6 lg:bottom-8 lg:right-8 bg-indigo-600 text-white p-4 rounded-full shadow-lg hover:bg-indigo-700 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 z-10"
        aria-label="Add new transaction"
      >
        <Plus size={28} />
      </button>
    </>
  );
}
