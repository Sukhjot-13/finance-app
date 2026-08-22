// src/app/(auth)/welcome/page.js
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

export default function WelcomePage() {
  const [accountName, setAccountName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // Marks onboarding complete on the server so this screen is shown once —
  // skipping without it would bounce the user back here on every login.
  const completeOnboarding = async () => {
    try {
      await api("/api/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarded: true }),
      });
    } catch {
      // Non-fatal: worst case the user sees this screen one more time.
    }
    router.push("/dashboard");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await api("/api/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName, onboarded: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to set account name.");
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const skip = () => {
    // No name is fine — dashboard works without one.
    completeOnboarding();
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Welcome!</h1>
          <p className="mt-2 text-gray-600">
            {`Let's get your account set up. What should we call it?`}
          </p>
        </div>

        {error && (
          <p className="text-sm text-center text-red-600 bg-red-100 p-3 rounded-md">
            {error}
          </p>
        )}

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="accountName"
              className="block text-sm font-medium text-gray-700"
            >
              Account Name
            </label>
            <input
              id="accountName"
              name="accountName"
              type="text"
              required
              maxLength={60}
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="e.g., My Personal Finances"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400"
          >
            {loading ? "Saving..." : "Continue to Dashboard"}
          </button>
        </form>
        <button
          type="button"
          onClick={skip}
          disabled={loading}
          className="w-full text-sm text-center text-slate-500 hover:text-slate-700"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
