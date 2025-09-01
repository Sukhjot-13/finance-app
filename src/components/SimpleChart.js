// src/components/SimpleChart.js
"use client";

import { useState, useEffect } from "react";

export default function SimpleChart({ data, options }) {
  const [ChartComponent, setChartComponent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadChart = async () => {
      try {
        // Import Chart.js and react-chartjs-2 dynamically
        const [chartJS, reactChartJS2] = await Promise.all([
          import("chart.js"),
          import("react-chartjs-2")
        ]);

        // Register Chart.js components
        const { Chart, ArcElement, Tooltip, Legend } = chartJS;
        Chart.register(ArcElement, Tooltip, Legend);

        // Get the Pie component
        const { Pie } = reactChartJS2;
        setChartComponent(() => Pie);
        setLoading(false);
      } catch (err) {
        console.error("Chart loading error:", err);
        setError(err.message);
        setLoading(false);
      }
    };

    loadChart();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-2"></div>
          <p>Loading chart...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-red-500">
          <p>Chart failed to load</p>
          {process.env.NODE_ENV === "development" && (
            <p className="text-xs mt-2">{error}</p>
          )}
        </div>
      </div>
    );
  }

  if (!ChartComponent) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-slate-500">
          <p>Chart component not available</p>
        </div>
      </div>
    );
  }

  if (!data || !data.labels || data.labels.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-slate-500">
          <p>No data available for chart</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center" style={{ height: '300px', minHeight: '300px' }}>
      <ChartComponent data={data} options={options} />
    </div>
  );
}
