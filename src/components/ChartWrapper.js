// src/components/ChartWrapper.js
"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

// Dynamically import Chart.js components with better error handling
const Pie = dynamic(
  () => 
    import("react-chartjs-2")
      .then((mod) => {
        console.log("Chart.js module loaded successfully");
        return { default: mod.Pie };
      })
      .catch((error) => {
        console.error("Failed to load Chart.js:", error);
        throw error;
      }),
  {
    ssr: false,
    loading: () => <ChartLoading />,
  }
);

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
  const [debugInfo, setDebugInfo] = useState("");

  useEffect(() => {
    const initChart = async () => {
      try {
        setDebugInfo("Starting chart initialization...");
        
        // Check if we're in browser environment
        if (typeof window === "undefined") {
          setDebugInfo("Not in browser environment");
          return;
        }

        setDebugInfo("Importing Chart.js...");
        const chartModule = await import("chart.js");
        
        setDebugInfo("Chart.js imported, registering components...");
        const ChartJS = chartModule.Chart;
        const { ArcElement, Tooltip, Legend } = chartModule;
        
        ChartJS.register(ArcElement, Tooltip, Legend);
        
        setDebugInfo("Chart.js registered successfully");
        setChartReady(true);
      } catch (err) {
        console.error("Failed to initialize chart:", err);
        setError(`Failed to load chart: ${err.message}`);
        setDebugInfo(`Error: ${err.message}`);
      }
    };
    
    // Add a small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      initChart();
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);

  // Debug mode - show debug info in development
  if (process.env.NODE_ENV === "development" && debugInfo) {
    console.log("ChartWrapper Debug:", debugInfo);
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center text-red-500">
          <p>Failed to load chart</p>
          {process.env.NODE_ENV === "development" && (
            <p className="text-xs mt-2">{error}</p>
          )}
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
          {process.env.NODE_ENV === "development" && data && (
            <p className="text-xs mt-2">Data: {JSON.stringify(data)}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center" style={{ height: '300px', minHeight: '300px' }}>
      <Pie data={data} options={options} />
    </div>
  );
}
