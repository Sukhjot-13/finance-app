"use client";

// Root-level error boundary. Covers errors thrown in page segments below the
// root layout (the root layout itself would need global-error.js, which
// replaces the entire document — intentionally not used to keep styling).
import { useEffect } from "react";

export default function RootError({ error, reset }) {
  useEffect(() => {
    console.error("App segment error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 p-6">
      <div className="text-center bg-white p-8 rounded-xl shadow-md max-w-md">
        <h2 className="text-xl font-bold text-slate-800 mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
