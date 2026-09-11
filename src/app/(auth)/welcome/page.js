// src/app/(auth)/welcome/page.js
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PiggyBank, Sparkles } from "lucide-react";
import api from "@/lib/api";

export default function WelcomePage() {
  const [accountName, setAccountName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const completeOnboarding = async () => {
    try {
      await api("/api/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarded: true }),
      });
    } catch {
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
    completeOnboarding();
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-950 p-4 relative overflow-hidden text-zinc-100 selection:bg-emerald-500/30 selection:text-emerald-300">
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-emerald-500/10 blur-[130px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-400 to-teal-500 flex items-center justify-center text-zinc-950 mx-auto shadow-xl shadow-emerald-500/20 mb-4">
            <Sparkles size={28} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">Welcome!</h1>
          <p className="mt-2 text-xs sm:text-sm text-zinc-400">
            {`Let's get your account set up. What should we call it?`}
          </p>
        </div>

        <div className="bg-zinc-900/85 border border-zinc-800/90 p-6 sm:p-8 rounded-3xl shadow-2xl backdrop-blur-xl space-y-5 relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-transparent" />

          {error && (
            <div className="text-xs text-center text-rose-300 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl font-medium">
              {error}
            </div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="accountName"
                className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-2"
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
                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 transition-all shadow-inner"
                placeholder="e.g., My Personal Finances"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-3.5 px-4 rounded-xl text-sm font-bold text-zinc-950 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all"
            >
              {loading ? "Saving..." : "Continue to Dashboard"}
            </button>
          </form>
          <button
            type="button"
            onClick={skip}
            disabled={loading}
            className="w-full text-xs text-center text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
