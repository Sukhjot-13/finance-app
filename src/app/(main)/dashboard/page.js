// FILE: src/app/(main)/dashboard/page.js
// The main dashboard page for the user.

"use client";

import { useState, useEffect } from "react";
import { Pie } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PlusCircle, TrendingUp, TrendingDown, PiggyBank } from "lucide-react";
import AddTransactionModal from "@/components/AddTransactionModal";

ChartJS.register(ArcElement, Tooltip, Legend);

function StatCard({
  title,
  value,
  icon,
  colorClass = "text-gray-900",
  bgColorClass = "bg-white",
}) {
  const Icon = icon;
  return (
    <div
      className={`p-6 rounded-lg shadow-md flex items-center space-x-4 ${bgColorClass}`}
    >
      <div
        className={`p-3 rounded-full ${colorClass
          .replace("text", "bg")
          .replace("600", "100")}`}
      >
        <Icon className={colorClass} size={24} />
      </div>
      <div>
        <h2 className="text-sm font-medium text-gray-500">{title}</h2>
        <p className={`text-3xl font-bold`}>{value}</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reports/dashboard");
      if (!res.ok) throw new Error("Failed to fetch dashboard data");
      const result = await res.json();
      setData(result);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="text-center p-10 font-semibold">Loading Dashboard...</div>
    );
  }

  if (!data) {
    return (
      <div className="text-center p-10 text-red-500">
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
    plugins: {
      legend: {
        position: "bottom",
      },
    },
  };

  return (
    <>
      <AddTransactionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onTransactionAdded={fetchData}
      />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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
          bgColorClass="bg-green-50"
        />
        <StatCard
          title="Expenses This Month"
          value={formatCurrency(data.monthlyExpenses)}
          icon={TrendingDown}
          colorClass="text-red-600"
          bgColorClass="bg-red-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3 bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-lg font-semibold mb-4">Recent Transactions</h2>
          <ul className="space-y-3">
            {data.recentTransactions.length > 0 ? (
              data.recentTransactions.map((t) => (
                <li
                  key={t._id}
                  className="flex justify-between items-center p-2 rounded-md hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="font-medium capitalize">
                      {t.description || t.category}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatDate(t.date)}
                    </p>
                  </div>
                  <p
                    className={`font-semibold ${
                      t.type === "income" ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {t.type === "income" ? "+" : "-"} {formatCurrency(t.amount)}
                  </p>
                </li>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">
                No transactions yet.
              </p>
            )}
          </ul>
        </div>

        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-md flex flex-col">
          <h2 className="text-lg font-semibold mb-4">Expense Breakdown</h2>
          {data.expenseBreakdown.length > 0 ? (
            <div className="flex-1 flex items-center justify-center h-64 md:h-auto">
              <Pie data={pieData} options={pieOptions} />
            </div>
          ) : (
            <div className="text-center text-gray-500 flex-1 flex items-center justify-center">
              <p>No expenses recorded this month.</p>
            </div>
          )}
        </div>
      </div>
      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-8 right-8 bg-indigo-600 text-white p-4 rounded-full shadow-lg hover:bg-indigo-700 transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        <PlusCircle size={28} />
      </button>
    </>
  );
}
