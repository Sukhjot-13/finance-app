// src/app/(main)/reports/page.js
"use client";

import { useState, useContext } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { formatCurrency, formatDateForInput } from "@/lib/utils";
import api from "@/lib/api";
import { UserContext } from "@/app/(main)/layout";
import { BarChart3, TrendingUp, TrendingDown, PiggyBank, Calendar, Sparkles, ArrowRight } from "lucide-react";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export default function ReportsPage() {
  const [startDate, setStartDate] = useState(
    formatDateForInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  );
  const [endDate, setEndDate] = useState(formatDateForInput(new Date()));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { user } = useContext(UserContext);

  const applyPreset = (type) => {
    const now = new Date();
    if (type === "thisMonth") {
      setStartDate(formatDateForInput(new Date(now.getFullYear(), now.getMonth(), 1)));
      setEndDate(formatDateForInput(now));
    } else if (type === "lastMonth") {
      setStartDate(formatDateForInput(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
      setEndDate(formatDateForInput(new Date(now.getFullYear(), now.getMonth(), 0)));
    } else if (type === "last30") {
      const past = new Date(now);
      past.setDate(past.getDate() - 30);
      setStartDate(formatDateForInput(past));
      setEndDate(formatDateForInput(now));
    } else if (type === "ytd") {
      setStartDate(formatDateForInput(new Date(now.getFullYear(), 0, 1)));
      setEndDate(formatDateForInput(now));
    }
  };

  const generateReport = async () => {
    if (!startDate || !endDate) {
      setError("Please pick both a start and an end date.");
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setError("Start date must be on or before the end date.");
      return;
    }
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const res = await api("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          startInstant: new Date(startDate + "T00:00:00").toISOString(),
          endInstant: new Date(endDate + "T23:59:59.999").toISOString(),
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to generate report.");
      }
      const data = await res.json();
      setReport(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        backgroundColor: "#18181b",
        titleColor: "#f4f4f5",
        bodyColor: "#a1a1aa",
        borderColor: "#27272a",
        borderWidth: 1,
        padding: 10,
        cornerRadius: 8,
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: "#71717a", font: { size: 11 } }
      },
      y: {
        grid: { color: "rgba(255, 255, 255, 0.05)" },
        ticks: { color: "#71717a", font: { size: 11 } }
      }
    }
  };

  const chartData = {
    labels: report?.expenseDetails.map((d) => d.category) || [],
    datasets: [
      {
        label: "Expenses",
        data: report?.expenseDetails.map((d) => d.total) || [],
        backgroundColor: "#f43f5e",
        borderRadius: 8,
        hoverBackgroundColor: "#fb7185",
      },
    ],
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Report Generator Controls */}
      <div className="bg-zinc-900/80 p-6 sm:p-8 rounded-2xl border border-zinc-800/90 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
            <BarChart3 size={20} />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
              Generate Report
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Select date bounds to review your income, categorized expenses, and net savings.
            </p>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="text-xs font-mono text-zinc-500 mr-1">Presets:</span>
          <button
            type="button"
            onClick={() => applyPreset("thisMonth")}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 transition-colors"
          >
            This Month
          </button>
          <button
            type="button"
            onClick={() => applyPreset("lastMonth")}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 transition-colors"
          >
            Last Month
          </button>
          <button
            type="button"
            onClick={() => applyPreset("last30")}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 transition-colors"
          >
            Last 30 Days
          </button>
          <button
            type="button"
            onClick={() => applyPreset("ytd")}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-950 border border-zinc-800 text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 transition-colors"
          >
            Year to Date
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[150px]">
            <label
              htmlFor="startDate"
              className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-2"
            >
              Start Date
            </label>
            <input
              type="date"
              id="startDate"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
            />
          </div>
          <div className="flex-1 min-w-[150px]">
            <label
              htmlFor="endDate"
              className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-2"
            >
              End Date
            </label>
            <input
              type="date"
              id="endDate"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
            />
          </div>
          <button
            onClick={generateReport}
            disabled={loading}
            className="px-6 py-2.5 bg-gradient-to-r from-emerald-400 to-teal-500 text-zinc-950 font-bold rounded-xl text-sm shadow-lg shadow-emerald-500/20 hover:from-emerald-300 hover:to-teal-400 transition-all disabled:opacity-50 active:scale-[0.98]"
          >
            {loading ? "Generating..." : "Generate"}
          </button>
        </div>
        {error && (
          <p className="mt-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-medium">
            {error}
          </p>
        )}
      </div>

      {/* Empty State when no report generated */}
      {!report && !loading && (
        <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-12 text-center backdrop-blur-sm">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800/60 flex items-center justify-center text-zinc-500 mx-auto mb-4 border border-zinc-700/50">
            <Sparkles size={28} className="text-emerald-400" />
          </div>
          <h3 className="text-base font-bold text-zinc-200 mb-1.5">No Report Generated Yet</h3>
          <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-6">
            Pick your preferred date range above and click &quot;Generate&quot; to inspect your cash flow analytics.
          </p>
          <button
            onClick={generateReport}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 hover:text-white hover:border-zinc-700 text-xs font-semibold transition-all shadow-sm"
          >
            Generate for Current Month
            <ArrowRight size={14} />
          </button>
        </div>
      )}

      {report && (
        <div className="space-y-8">
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-zinc-900/80 border border-zinc-800/90 p-6 rounded-2xl shadow-xl backdrop-blur-md relative overflow-hidden group">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 to-transparent" />
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-1">
                    Total Income
                  </h3>
                  <p className="text-3xl font-bold text-emerald-400 tracking-tight font-mono tabular-nums">
                    {formatCurrency(report.summary.totalIncome, user?.currency)}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <TrendingUp size={22} />
                </div>
              </div>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800/90 p-6 rounded-2xl shadow-xl backdrop-blur-md relative overflow-hidden group">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-rose-500 to-transparent" />
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-1">
                    Total Expenses
                  </h3>
                  <p className="text-3xl font-bold text-rose-400 tracking-tight font-mono tabular-nums">
                    {formatCurrency(report.summary.totalExpenses, user?.currency)}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <TrendingDown size={22} />
                </div>
              </div>
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800/90 p-6 rounded-2xl shadow-xl backdrop-blur-md relative overflow-hidden group">
              <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-teal-500 to-transparent" />
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-1">
                    Net Savings
                  </h3>
                  <p
                    className={`text-3xl font-bold tracking-tight font-mono tabular-nums ${
                      report.summary.netSavings >= 0 ? "text-teal-400" : "text-rose-400"
                    }`}
                  >
                    {formatCurrency(report.summary.netSavings, user?.currency)}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
                  <PiggyBank size={22} />
                </div>
              </div>
            </div>
          </div>

          {/* Charts & Breakdown Details */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-zinc-900/80 border border-zinc-800/90 p-6 rounded-2xl shadow-xl backdrop-blur-md">
              <h2 className="text-base font-bold text-zinc-100 tracking-tight mb-6 flex items-center gap-2">
                <BarChart3 size={18} className="text-rose-400" />
                Expense Breakdown
              </h2>
              {report.expenseDetails.length > 0 ? (
                <div className="h-64 sm:h-80">
                  <Bar options={chartOptions} data={chartData} />
                </div>
              ) : (
                <p className="text-xs text-zinc-500 py-12 text-center">No expenses in this period.</p>
              )}
            </div>

            <div className="bg-zinc-900/80 border border-zinc-800/90 p-6 rounded-2xl shadow-xl backdrop-blur-md">
              <h2 className="text-base font-bold text-zinc-100 tracking-tight mb-6 flex items-center gap-2">
                <TrendingUp size={18} className="text-emerald-400" />
                Income Sources
              </h2>
              <ul className="space-y-2.5">
                {report.incomeDetails.length > 0 ? (
                  report.incomeDetails.map((item) => (
                    <li
                      key={item.source}
                      className="flex justify-between items-center p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/70 hover:border-zinc-700 transition-colors"
                    >
                      <span className="font-semibold text-xs text-zinc-200 capitalize">{item.source}</span>
                      <span className="font-bold text-xs font-mono text-emerald-400 tabular-nums">
                        {formatCurrency(item.total, user?.currency)}
                      </span>
                    </li>
                  ))
                ) : (
                  <p className="text-xs text-zinc-500 py-12 text-center">No income in this period.</p>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
