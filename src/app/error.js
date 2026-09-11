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
    <div className="flex items-center justify-center min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="text-center bg-zinc-900 border border-zinc-800 p-8 rounded-2xl shadow-2xl max-w-md">
        <h2 className="text-xl font-bold text-zinc-100 mb-2">
          Something went wrong
        </h2>
        <p className="text-sm text-zinc-400 mb-6">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          className="w-full px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-emerald-500/20"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
