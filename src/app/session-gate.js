// src/app/session-gate.js
//
// Client-side fallback for the root page. Rendered when the server-side
// verifyAuth() check fails (access cookie missing or its 15-minute lifetime
// has lapsed). Instead of bouncing the user straight to /login — which used
// to force a full OTP re-login despite a perfectly valid 30-day refresh
// session — it attempts ONE silent refresh first:
//   success -> /dashboard
//   failure (401 / network) -> /login
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PiggyBank } from "lucide-react";

export default function SessionGate() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const decide = async () => {
      try {
        const res = await fetch("/api/auth/refresh", { method: "POST" });
        if (!cancelled) router.replace(res.ok ? "/dashboard" : "/login");
      } catch {
        if (!cancelled) router.replace("/login");
      }
    };
    decide();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-100">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-zinc-950 shadow-lg shadow-emerald-500/20 animate-pulse">
        <PiggyBank className="w-7 h-7" />
      </div>
    </div>
  );
}
