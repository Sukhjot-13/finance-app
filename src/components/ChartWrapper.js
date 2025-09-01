// src/components/ChartWrapper.js
"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

// Dynamically import Chart.js components
const Pie = dynamic(() => import("react-chartjs-2").then(mod => ({ default: mod.Pie })), {
  ssr: false,
  loading: () => <ChartLoading />
});

function ChartLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-2"></div>
        <p>Loading chart...</p>
      </div>
    </div>
  );
}

export default function ChartWrapper({ data, options, type = "pie" }) {
  const [chartReady, setChartReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const initChart = async () => {
      try {
        const chartModule = await import("chart.js");
        const ChartJS = chartModule.Chart;
        const { ArcElement, Tooltip, Legend } = chartModule;
        ChartJS.register(ArcElement, Tooltip, Legend);
        setChartReady(true);
      } catch (err) {
        console.error("Failed to initialize chart:", err);
        setError("Failed to load chart");
      }
    };
    
    initChart();
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-red-500">
          <p>Failed to load chart</p>
        </div>
      </div>
    );
  }

  if (!chartReady) {
    return <ChartLoading />;
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
    <div className="flex-1 flex items-center justify-center" style={{ height: '300px' }}>
      <Pie data={data} options={options} />
    </div>
  );
}
