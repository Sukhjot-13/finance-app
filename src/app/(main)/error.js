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
    <div className="text-center p-10 bg-red-50 rounded-lg">
      <h2 className="text-lg font-semibold text-red-700 mb-2">
        Something went wrong
      </h2>
      <p className="text-sm text-slate-600 mb-4">
        An unexpected error occurred while loading this page.
      </p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700"
      >
        Try again
      </button>
    </div>
  );
}
