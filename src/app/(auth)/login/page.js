// app/(auth)/login/page.js
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PiggyBank, ArrowRight, Mail, KeyRound, Sparkles } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState(1); // 1 for email, 2 for OTP
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [resendIn, setResendIn] = useState(0);
  const router = useRouter();

  // Cooldown ticker for the resend button on step 2.
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [resendIn]);

  useEffect(() => {
    const checkSession = async () => {
      try {
        let res = await fetch("/api/user");
        if (!res.ok && res.status === 401) {
          const refreshRes = await fetch("/api/auth/refresh", {
            method: "POST",
          });
          if (refreshRes.ok) {
            res = await fetch("/api/user");
          }
        }
        if (res.ok) {
          router.replace("/dashboard");
          return;
        }
      } catch {
      }
      setCheckingSession(false);
    };
    checkSession();
  }, [router]);

  if (checkingSession) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-zinc-100">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-zinc-950 shadow-lg shadow-emerald-500/20 animate-pulse">
          <PiggyBank className="w-7 h-7" />
        </div>
      </div>
    );
  }

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to send OTP. Please try again.");
      }
      setStep(2);
      setResendIn(30);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendIn > 0 || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to resend OTP. Please try again.");
      }
      setResendIn(30);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Invalid OTP.");

      if (data.isNewUser) {
        router.push("/welcome");
      } else {
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-950 p-4 relative overflow-hidden text-zinc-100 selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* Background ambient lighting */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-emerald-500/10 blur-[130px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-40 right-10 w-[400px] h-[400px] bg-teal-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-md space-y-6 relative z-10">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-400 to-teal-500 flex items-center justify-center text-zinc-950 mx-auto shadow-xl shadow-emerald-500/20 mb-4">
            <PiggyBank size={30} className="stroke-[2.5]" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">
            Sign In to FinTrack
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-zinc-400">
            {step === 1
              ? "Enter your email to get a login code."
              : `We sent a code to ${email}.`}
          </p>
        </div>

        <div className="bg-zinc-900/85 border border-zinc-800/90 p-6 sm:p-8 rounded-3xl shadow-2xl backdrop-blur-xl space-y-5 relative overflow-hidden">
          {/* Subtle accent bar on top of the card */}
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-transparent" />

          {error && (
            <div className="text-xs text-center text-rose-300 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl font-medium">
              {error}
            </div>
          )}

          {step === 1 ? (
            <form className="space-y-4" onSubmit={handleSendOtp}>
              <div>
                <label htmlFor="email" className="sr-only">
                  Email address
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 transition-all shadow-inner"
                    placeholder="Email address"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center py-3 px-4 rounded-xl text-sm font-bold text-zinc-950 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all"
              >
                {loading ? "Sending..." : "Send Code"}
              </button>
            </form>
          ) : (
            <form className="space-y-5" onSubmit={handleVerifyOtp} id="otp-form">
              <div>
                <label htmlFor="otp" className="sr-only">
                  One-Time Password
                </label>
                <input
                  id="otp"
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength="6"
                  required
                  value={otp}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setOtp(val);
                    if (val.length === 6) {
                      setTimeout(() => {
                        document.getElementById("otp-form")?.requestSubmit();
                      }, 100);
                    }
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                    if (pasted) {
                      setOtp(pasted);
                      if (pasted.length === 6) {
                        setTimeout(() => {
                          document.getElementById("otp-form")?.requestSubmit();
                        }, 100);
                      }
                    }
                  }}
                  className="w-full text-center tracking-[0.5em] sm:tracking-[0.8em] py-3.5 px-4 bg-zinc-950 border border-zinc-800 rounded-xl text-2xl font-mono font-bold text-emerald-400 placeholder-zinc-700 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 transition-all shadow-inner"
                  placeholder="______"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center py-3 px-4 rounded-xl text-sm font-bold text-zinc-950 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all"
              >
                {loading ? "Verifying..." : "Sign In"}
              </button>
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendIn > 0 || loading}
                  className="w-full text-xs font-semibold text-center text-emerald-400 hover:text-emerald-300 disabled:text-zinc-600 disabled:cursor-not-allowed transition-colors"
                >
                  {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setError("");
                    setOtp("");
                    setResendIn(0);
                  }}
                  className="w-full text-xs text-center text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Use a different email
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
