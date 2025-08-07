// src/app/(main)/reports/page.js
"use client";

import { useState, useContext } from "react"; // Import useContext
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
import { formatCurrency } from "@/lib/utils";
import { UserContext } from "@/app/(main)/layout"; // Import UserContext

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
    new Date(new Date().setDate(1)).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const user = useContext(UserContext); // Get user from context

  const generateReport = async () => {
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate }),
      });
      if (!res.ok) throw new Error("Failed to generate report.");
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
    plugins: {
      legend: { display: false },
      title: { display: true, text: "Spending by Category" },
    },
  };

  const chartData = {
    labels: report?.expenseDetails.map((d) => d.category) || [],
    datasets: [
      {
        label: "Expenses",
        data: report?.expenseDetails.map((d) => d.total) || [],
        backgroundColor: "#ef4444",
      },
    ],
  };

  return (
    <div className="space-y-8">
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold mb-4">Generate Report</h1>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label
              htmlFor="startDate"
              className="block text-sm font-medium text-gray-700"
            >
              Start Date
            </label>
            <input
              type="date"
              id="startDate"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 p-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label
              htmlFor="endDate"
              className="block text-sm font-medium text-gray-700"
            >
              End Date
            </label>
            <input
              type="date"
              id="endDate"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 p-2 border border-gray-300 rounded-md"
            />
          </div>
          <button
            onClick={generateReport}
            disabled={loading}
            className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-400"
          >
            {loading ? "Generating..." : "Generate"}
          </button>
        </div>
        {error && <p className="mt-4 text-red-600">{error}</p>}
      </div>

      {report && (
        <div className="space-y-8">
          {/* Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-green-50 p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold text-green-800">
                Total Income
              </h3>
              <p className="text-3xl font-bold text-green-600">
                {formatCurrency(report.summary.totalIncome, user?.currency)}
              </p>
            </div>
            <div className="bg-red-50 p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold text-red-800">
                Total Expenses
              </h3>
              <p className="text-3xl font-bold text-red-600">
                {formatCurrency(report.summary.totalExpenses, user?.currency)}
              </p>
            </div>
            <div className="bg-blue-50 p-6 rounded-lg shadow-md">
              <h3 className="text-lg font-semibold text-blue-800">
                Net Savings
              </h3>
              <p
                className={`text-3xl font-bold ${
                  report.summary.netSavings >= 0
                    ? "text-blue-600"
                    : "text-red-600"
                }`}
              >
                {formatCurrency(report.summary.netSavings, user?.currency)}
              </p>
            </div>
          </div>

          {/* Details */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-bold mb-4">Expense Breakdown</h2>
              {report.expenseDetails.length > 0 ? (
                <Bar options={chartOptions} data={chartData} />
              ) : (
                <p>No expenses in this period.</p>
              )}
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-bold mb-4">Income Sources</h2>
              <ul className="space-y-2">
                {report.incomeDetails.length > 0 ? (
                  report.incomeDetails.map((item) => (
                    <li
                      key={item.source}
                      className="flex justify-between p-2 rounded hover:bg-gray-50"
                    >
                      <span>{item.source}</span>
                      <span className="font-semibold">
                        {formatCurrency(item.total, user?.currency)}
                      </span>
                    </li>
                  ))
                ) : (
                  <p>No income in this period.</p>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
