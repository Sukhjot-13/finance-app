// src/app/(main)/profile/page.js
"use client";

import { useState, useEffect, useContext } from "react";
import { Save, LogOut, AlertTriangle, User as UserIcon, Shield, CheckCircle2 } from "lucide-react";
import api from "@/lib/api";
import { UserContext } from "@/app/(main)/layout";

export default function ProfilePage() {
  const { user: contextUser, setUser } = useContext(UserContext);
  const [accountName, setAccountName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api("/api/user")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch user data");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setUser(data);
        setAccountName(data.accountName || "");
        setCurrency(data.currency || "USD");
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setUser]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await api("/api/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName, currency }),
      });
      if (!res.ok) {
        let message = "Failed to save profile";
        try {
          const data = await res.json();
          if (data?.message) message = data.message;
        } catch {
        }
        throw new Error(message);
      }
      setUser((prev) => ({ ...prev, accountName, currency }));
      setStatus({ type: "success", text: "Profile saved successfully." });
    } catch (error) {
      console.error(error);
      setStatus({
        type: "error",
        text: error.message || "Error saving profile.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoutAll = async () => {
    if (!confirmLogoutAll) {
      setConfirmLogoutAll(true);
      return;
    }
    setConfirmLogoutAll(false);
    try {
      await api("/api/auth/logout-all", { method: "POST" });
      window.location.href = "/login";
    } catch (error) {
      console.error("Failed to log out from all devices", error);
      setStatus({
        type: "error",
        text: "Could not log out from all devices. Please log in and try again.",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-64 text-zinc-500">
        <div className="w-10 h-10 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mb-3" />
        <span className="text-xs font-mono">Loading profile...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Inline status banner */}
      {status && (
        <div
          className={`p-4 rounded-2xl border text-xs font-semibold flex items-center justify-between shadow-lg ${
            status.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/30 text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {status.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{status.text}</span>
          </div>
          <button
            onClick={() => setStatus(null)}
            className={`underline text-xs ${
              status.type === "success"
                ? "text-emerald-400 hover:text-emerald-200"
                : "text-rose-400 hover:text-rose-200"
            }`}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* User Header Profile Card */}
      <div className="bg-zinc-900/80 border border-zinc-800/90 p-6 sm:p-8 rounded-2xl shadow-xl backdrop-blur-md flex items-center gap-5">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-zinc-950 font-bold text-2xl shadow-lg shadow-emerald-500/20 shrink-0">
          {accountName ? accountName.charAt(0).toUpperCase() : <UserIcon size={28} />}
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            {accountName || "Your Account"}
          </h1>
          <p className="text-xs text-zinc-400 font-mono mt-0.5">{contextUser?.email}</p>
          <span className="inline-block mt-2 text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Verified Account
          </span>
        </div>
      </div>

      {/* Profile Settings Card */}
      <div className="bg-zinc-900/80 border border-zinc-800/90 p-6 sm:p-8 rounded-2xl shadow-xl backdrop-blur-md space-y-6">
        <div>
          <h2 className="text-base font-bold text-zinc-100 tracking-tight">
            Account Preferences
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Update your public name and default reporting currency.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label
              htmlFor="accountName"
              className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-2"
            >
              Account Name
            </label>
            <input
              id="accountName"
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              maxLength={60}
              placeholder="e.g., Personal Finances"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 transition-all"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-2"
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={contextUser?.email || ""}
              disabled
              className="w-full bg-zinc-950/40 border border-zinc-800/60 rounded-xl px-4 py-2.5 text-sm text-zinc-500 cursor-not-allowed font-mono"
            />
            <span className="block text-[11px] text-zinc-500 mt-1">
              Email is managed by OTP authentication and cannot be edited.
            </span>
          </div>

          <div>
            <label
              htmlFor="currency"
              className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono mb-2"
            >
              Preferred Currency
            </label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 cursor-pointer"
            >
              <option value="USD" className="bg-zinc-900 text-zinc-100">USD ($) - United States Dollar</option>
              <option value="INR" className="bg-zinc-900 text-zinc-100">INR (₹) - Indian Rupee</option>
            </select>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-400 to-teal-500 text-zinc-950 font-bold py-2.5 px-6 rounded-xl shadow-lg shadow-emerald-500/20 hover:from-emerald-300 hover:to-teal-400 transition-all disabled:opacity-50 active:scale-[0.98] text-xs"
            >
              <Save size={15} />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      {/* Security Settings Card */}
      <div className="bg-zinc-900/80 border border-zinc-800/90 p-6 sm:p-8 rounded-2xl shadow-xl backdrop-blur-md space-y-6">
        <div className="flex items-center gap-2.5">
          <Shield size={18} className="text-rose-400" />
          <h2 className="text-base font-bold text-zinc-100 tracking-tight">Security & Sessions</h2>
        </div>

        <div className="border-t border-zinc-800/80 pt-6">
          <div className="p-5 border border-rose-500/20 bg-rose-500/5 rounded-2xl flex items-start gap-4">
            <AlertTriangle
              className="text-rose-400 shrink-0 mt-0.5"
              size={22}
            />
            <div className="space-y-1.5 flex-1">
              <h4 className="text-sm font-bold text-rose-300">
                Log Out From All Devices
              </h4>
              <p className="text-xs text-zinc-400 leading-relaxed">
                This will immediately invalidate active refresh tokens across all of your
                computers, phones, and tablets. You will need to sign in again everywhere.
              </p>
              {confirmLogoutAll ? (
                <div className="mt-4 p-3 bg-zinc-950/80 rounded-xl border border-rose-500/30 flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-semibold text-rose-300">
                    Are you sure?
                  </span>
                  <button
                    onClick={handleLogoutAll}
                    className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-bold py-2 px-3.5 rounded-xl shadow-md transition-colors text-xs"
                  >
                    <LogOut size={14} />
                    Yes, Log Out Everywhere
                  </button>
                  <button
                    onClick={() => setConfirmLogoutAll(false)}
                    className="px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleLogoutAll}
                  className="mt-3 inline-flex items-center gap-2 bg-rose-600/90 hover:bg-rose-600 text-white font-bold py-2 px-4 rounded-xl shadow-md transition-colors text-xs"
                >
                  <LogOut size={14} />
                  Log Out From All Devices
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
