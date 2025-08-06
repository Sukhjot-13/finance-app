// app/(auth)/login/page.js
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PiggyBank } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState(1); // 1 for email, 2 for OTP
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

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
      if (!res.ok) throw new Error("Failed to send OTP. Please try again.");
      setStep(2);
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
      const data = await res.json();
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
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="w-full max-w-md p-8 space-y-8">
        <div className="text-center">
          <PiggyBank size={48} className="mx-auto text-indigo-600" />
          <h1 className="mt-4 text-3xl font-bold text-slate-900">
            Sign In to FinTrack
          </h1>
          <p className="mt-2 text-slate-600">
            {step === 1
              ? "Enter your email to get a login code."
              : `We sent a code to ${email}.`}
          </p>
        </div>

        <div className="bg-white p-8 rounded-xl shadow-md space-y-6">
          {error && (
            <p className="text-sm text-center text-red-600 bg-red-100 p-3 rounded-md">
              {error}
            </p>
          )}

          {step === 1 ? (
            <form className="space-y-6" onSubmit={handleSendOtp}>
              <div>
                <label htmlFor="email" className="sr-only">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Email address"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400"
              >
                {loading ? "Sending..." : "Send Code"}
              </button>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleVerifyOtp}>
              <div>
                <label htmlFor="otp" className="sr-only">
                  One-Time Password
                </label>
                <input
                  id="otp"
                  name="otp"
                  type="text"
                  maxLength="6"
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full text-center tracking-[0.5em] sm:tracking-[1em] px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="______"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400"
              >
                {loading ? "Verifying..." : "Sign In"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setError("");
                  setOtp("");
                }}
                className="w-full text-sm text-center text-indigo-600 hover:text-indigo-500"
              >
                Use a different email
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
