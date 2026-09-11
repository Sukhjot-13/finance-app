"use client";

// Route-segment error boundary for the main app shell. Catches render/data
// errors in (main) pages so a crash shows a recoverable screen instead of a
// white page. Next.js excludes its own redirect/notFound errors automatically.
import { useEffect } from "react";

export default function MainError({ error, reset }) {
  useEffect(() => {
    console.error("Main app segment error:", error);
  }, [error]);

  return (
    <div className="text-center p-10 bg-zinc-900 border border-rose-500/20 rounded-2xl max-w-md mx-auto shadow-xl">
      <h2 className="text-lg font-bold text-rose-300 mb-2">
        Something went wrong
      </h2>
      <p className="text-sm text-zinc-400 mb-6">
        An unexpected error occurred while loading this page.
      </p>
      <button
        onClick={reset}
        className="w-full px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-emerald-500/20"
      >
        Try again
      </button>
    </div>
  );
}
