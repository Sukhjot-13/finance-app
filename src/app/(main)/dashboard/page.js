// src/app/(main)/dashboard/page.js
"use client";

import { useState, useEffect, useCallback, useContext, useRef } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  PieChart as PieIcon,
  Receipt,
} from "lucide-react";
import AddTransactionDrawer from "@/components/AddTransactionDrawer";
import SimpleChart from "@/components/SimpleChart";
import BudgetProgress from "@/components/BudgetProgress";
import BudgetManager from "@/components/BudgetManager";
import api from "@/lib/api";

import { UserContext } from "@/app/(main)/layout";

function StatCard({ title, value, icon: Icon, colorClass = "text-emerald-400", bgGlow = "from-emerald-500/10 to-transparent", iconBg = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" }) {
  return (
    <div className="relative group bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-6 backdrop-blur-md shadow-xl overflow-hidden hover:border-zinc-700/80 transition-all duration-200">
      {/* Top subtle gradient highlight */}
      <div className={`absolute top-0 inset-x-0 h-1 bg-gradient-to-r ${bgGlow} opacity-60 group-hover:opacity-100 transition-opacity`} />
      
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-semibold tracking-wider text-zinc-400 uppercase font-mono mb-1.5">
            {title}
          </h2>
          <p className="text-3xl font-bold tracking-tight text-zinc-100 tabular-nums">
            {value}
          </p>
        </div>
        <div className={`p-3.5 rounded-2xl border ${iconBg} shadow-sm group-hover:scale-105 transition-transform shrink-0`}>
          <Icon size={24} />
        </div>
      </div>
    </div>
  );
}

// Curated modern fintech palette for dark themes
function generateSliceColors(count) {
  const basePalette = [
    "#10b981", // emerald
    "#8b5cf6", // violet
    "#06b6d4", // cyan
    "#f59e0b", // amber
    "#f43f5e", // rose
    "#3b82f6", // blue
    "#d946ef", // fuchsia
    "#14b8a6", // teal
  ];
  return Array.from({ length: count }, (_, i) => {
    if (i < basePalette.length) return basePalette[i];
    return `hsl(${(i * 137.5) % 360}, 75%, 60%)`;
  });
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-zinc-900/60 border border-zinc-800/80 h-32 rounded-2xl"></div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 bg-zinc-900/60 border border-zinc-800/80 h-96 rounded-2xl"></div>
        <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800/80 h-96 rounded-2xl"></div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isBudgetOpen, setIsBudgetOpen] = useState(false);
  const [budgetVersion, setBudgetVersion] = useState(0);
  const { user } = useContext(UserContext);

  const fetchSeq = useRef(0);

  const fetchData = useCallback(async () => {
    const seq = ++fetchSeq.current;
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const res = await api(
        `/api/reports/dashboard?start=${encodeURIComponent(monthStart.toISOString())}&end=${encodeURIComponent(monthEnd.toISOString())}`
      );
      if (!res.ok) throw new Error("Failed to fetch dashboard data");
      const result = await res.json();
      if (fetchSeq.current === seq) setData(result);
    } catch (error) {
      console.error(error);
      if (fetchSeq.current === seq) setData(null);
    } finally {
      if (fetchSeq.current === seq) setLoading(false);
    }
  }, []);

  const refreshWithSkeleton = () => {
    setLoading(true);
    setData(null);
    fetchData();
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") fetchData();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [fetchData]);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!data) {
    return (
      <div className="text-center p-12 text-rose-400 bg-zinc-900/90 border border-rose-500/20 rounded-2xl shadow-xl max-w-lg mx-auto">
        <p className="font-semibold text-lg mb-2">Could not load dashboard data</p>
        <p className="text-xs text-zinc-400 mb-6">Please check your network connection and try again.</p>
        <button
          onClick={fetchData}
          className="px-5 py-2.5 bg-emerald-500 text-zinc-950 rounded-xl text-sm font-semibold hover:bg-emerald-400 transition-colors shadow-lg shadow-emerald-500/20"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const pieData = {
    labels: data.expenseBreakdown.map((item) => item.category),
    datasets: [
      {
        data: data.expenseBreakdown.map((item) => item.total),
        backgroundColor: generateSliceColors(data.expenseBreakdown.length),
        borderColor: "#18181b",
        borderWidth: 3,
        hoverOffset: 6,
      },
    ],
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          usePointStyle: true,
          pointStyle: "circle",
          padding: 16,
          color: "#a1a1aa",
          font: {
            size: 11,
            family: "inherit",
          },
        },
      },
    },
    cutout: "68%",
  };

  return (
    <>
      <AddTransactionDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onTransactionAdded={() => {
          refreshWithSkeleton();
          setBudgetVersion((v) => v + 1);
        }}
      />
      <div className="space-y-8 pb-24 sm:pb-12 max-w-7xl mx-auto">
        {/* Top 3 Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            title="Current Balance"
            value={formatCurrency(data.currentBalance, user?.currency)}
            icon={PiggyBank}
            colorClass="text-emerald-400"
            bgGlow="from-emerald-500 via-teal-500 to-transparent"
            iconBg="bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          />
          <StatCard
            title="Income This Month"
            value={formatCurrency(data.monthlyIncome, user?.currency)}
            icon={TrendingUp}
            colorClass="text-teal-400"
            bgGlow="from-teal-500 via-emerald-500 to-transparent"
            iconBg="bg-teal-500/10 text-teal-400 border-teal-500/20"
          />
          <StatCard
            title="Expenses This Month"
            value={formatCurrency(data.monthlyExpenses, user?.currency)}
            icon={TrendingDown}
            colorClass="text-rose-400"
            bgGlow="from-rose-500 via-red-500 to-transparent"
            iconBg="bg-rose-500/10 text-rose-400 border-rose-500/20"
          />
        </div>

        {/* Middle Section: Recent Transactions & Expense Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Recent Transactions List */}
          <div className="lg:col-span-3 bg-zinc-900/80 border border-zinc-800/90 p-6 rounded-2xl shadow-xl backdrop-blur-md flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <Receipt size={18} className="text-emerald-400" />
                <h2 className="text-base font-bold tracking-tight text-zinc-100">
                  Recent Transactions
                </h2>
              </div>
              <span className="text-xs font-mono text-zinc-500">
                {data.recentTransactions.length} recorded
              </span>
            </div>

            <ul className="space-y-2.5 flex-1">
              {data.recentTransactions.length > 0 ? (
                data.recentTransactions.map((t) => (
                  <li
                    key={t._id}
                    className="flex justify-between items-center p-3 rounded-xl hover:bg-zinc-800/40 border border-transparent hover:border-zinc-800/60 transition-all duration-150 group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-semibold ${
                        t.type === "income"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-zinc-800 text-zinc-300 border border-zinc-700/60"
                      }`}>
                        {t.type === "income" ? (
                          <ArrowUpRight size={18} className="text-emerald-400" />
                        ) : (
                          <ArrowDownRight size={18} className="text-rose-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold capitalize text-sm text-zinc-200 group-hover:text-white transition-colors">
                            {t.description || t.category}
                          </p>
                          {t.excludeFromBudget && (
                            <span className="text-[10px] font-mono uppercase bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-md border border-amber-500/20">
                              One-time
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 font-mono mt-0.5">
                          {formatDate(t.date)}
                        </p>
                      </div>
                    </div>
                    <p
                      className={`font-semibold text-sm tabular-nums ${
                        t.type === "income" ? "text-emerald-400" : "text-zinc-200"
                      }`}
                    >
                      {t.type === "income" ? "+" : "-"}{" "}
                      {formatCurrency(t.amount, user?.currency)}
                    </p>
                  </li>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center flex-1">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-800/60 flex items-center justify-center text-zinc-500 mb-3 border border-zinc-700/40">
                    <Receipt size={22} />
                  </div>
                  <p className="text-sm font-medium text-zinc-300">No transactions yet.</p>
                  <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                    Start tracking your cash flow by clicking the add button below.
                  </p>
                </div>
              )}
            </ul>
          </div>

          {/* Expense Breakdown Pie/Donut Chart */}
          <div className="lg:col-span-2 bg-zinc-900/80 border border-zinc-800/90 p-6 rounded-2xl shadow-xl backdrop-blur-md flex flex-col">
            <div className="flex items-center gap-2.5 mb-4">
              <PieIcon size={18} className="text-teal-400" />
              <h2 className="text-base font-bold tracking-tight text-zinc-100">
                Expense Breakdown
              </h2>
            </div>

            {data.expenseBreakdown && data.expenseBreakdown.length > 0 ? (
              <div className="flex-1 flex items-center justify-center min-h-[260px] relative">
                <SimpleChart data={pieData} options={pieOptions} />
              </div>
            ) : (
              <div className="text-center flex-1 flex flex-col items-center justify-center py-12">
                <div className="w-24 h-24 rounded-full border-2 border-dashed border-zinc-800 flex items-center justify-center mb-3 text-zinc-600">
                  <PieIcon size={28} />
                </div>
                <p className="text-sm font-medium text-zinc-400">No expenses recorded this month.</p>
                <p className="text-xs text-zinc-500 mt-1">
                  Expenses will be categorized into this visual ring.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Budget Progress Section */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3 lg:col-start-2">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Wallet size={18} className="text-emerald-400" />
                <h2 className="text-base font-bold tracking-tight text-zinc-100">
                  Budgets
                </h2>
              </div>
              <button
                onClick={() => setIsBudgetOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition-all shadow-sm"
              >
                <Wallet size={14} />
                Set Budgets
              </button>
            </div>
            <BudgetProgress key={budgetVersion} />
          </div>
        </div>
      </div>

      <BudgetManager
        isOpen={isBudgetOpen}
        onClose={() => setIsBudgetOpen(false)}
        onSaved={() => setBudgetVersion((v) => v + 1)}
      />

      <button
        onClick={() => setIsDrawerOpen(true)}
        className="fixed bottom-6 right-6 lg:bottom-8 lg:right-8 bg-gradient-to-r from-emerald-500 to-teal-400 text-zinc-950 p-4 rounded-full shadow-[0_0_25px_rgba(16,185,129,0.35)] hover:shadow-[0_0_35px_rgba(16,185,129,0.55)] transition-all hover:scale-110 active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-400 z-30"
        aria-label="Add new transaction"
      >
        <Plus size={28} className="stroke-[2.5]" />
      </button>
    </>
  );
}
