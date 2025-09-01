// src/components/ChartDebug.js
"use client";

import { useState, useEffect } from "react";

export default function ChartDebug({ data, options }) {
  const [debugInfo, setDebugInfo] = useState({
    window: typeof window !== "undefined",
    document: typeof document !== "undefined",
    chartJS: false,
    reactChartJS2: false,
    error: null,
    dataReceived: !!data,
    dataLabels: data?.labels?.length || 0,
  });

  useEffect(() => {
    const checkDependencies = async () => {
      try {
        // Check if Chart.js can be imported
        const chartJS = await import("chart.js");
        setDebugInfo(prev => ({ ...prev, chartJS: true }));

        // Check if react-chartjs-2 can be imported
        const reactChartJS2 = await import("react-chartjs-2");
        setDebugInfo(prev => ({ ...prev, reactChartJS2: true }));

        console.log("Chart dependencies loaded successfully");
      } catch (error) {
        console.error("Chart dependency error:", error);
        setDebugInfo(prev => ({ ...prev, error: error.message }));
      }
    };

    checkDependencies();
  }, []);

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
      <h3 className="text-sm font-semibold text-yellow-800 mb-2">Chart Debug Info</h3>
      <div className="text-xs text-yellow-700 space-y-1">
        <p>Window available: {debugInfo.window ? "✅" : "❌"}</p>
        <p>Document available: {debugInfo.document ? "✅" : "❌"}</p>
        <p>Chart.js loaded: {debugInfo.chartJS ? "✅" : "❌"}</p>
        <p>React-ChartJS-2 loaded: {debugInfo.reactChartJS2 ? "✅" : "❌"}</p>
        <p>Data received: {debugInfo.dataReceived ? "✅" : "❌"}</p>
        <p>Data labels count: {debugInfo.dataLabels}</p>
        {debugInfo.error && (
          <p className="text-red-600">Error: {debugInfo.error}</p>
        )}
      </div>
    </div>
  );
}
