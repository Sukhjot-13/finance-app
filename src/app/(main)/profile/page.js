"use client";

import { useState, useEffect, useContext } from "react";
import { Save, LogOut, AlertTriangle } from "lucide-react";
import api from "@/lib/api";
import { UserContext } from "@/app/(main)/layout";

export default function ProfilePage() {
  // Shared context: updating via setUser propagates currency/name app-wide.
  const { user: contextUser, setUser } = useContext(UserContext);
  const [accountName, setAccountName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', text }
  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);

  useEffect(() => {
    // Refresh from the server so this page reflects other-tab changes;
    // definitive auth failures are handled inside api() itself.
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
          // non-JSON error body
        }
        throw new Error(message);
      }
      // Propagate to every page sharing UserContext (header name,
      // currency formatting) without a reload.
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
      // Cookies are cleared server-side; a hard navigation guarantees a
      // clean slate even if client state was mid-flight.
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
      <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Inline status banner (replaces alert()) */}
      {status && (
        <div
          className={`p-3 rounded-lg border text-sm flex items-center justify-between ${
            status.type === "success"
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          <span>{status.text}</span>
          <button
            onClick={() => setStatus(null)}
            className={`underline text-xs ${
              status.type === "success"
                ? "text-green-600 hover:text-green-800"
                : "text-red-500 hover:text-red-700"
            }`}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Profile Settings Card */}
      <div className="bg-white p-8 rounded-xl shadow-sm">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">
          Profile Settings
        </h2>
        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label
              htmlFor="accountName"
              className="block text-sm font-medium text-slate-700"
            >
              Account Name
            </label>
            <input
              id="accountName"
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700"
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={contextUser?.email || ""}
              disabled
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50 text-slate-500"
            />
          </div>
          <div>
            <label
              htmlFor="currency"
              className="block text-sm font-medium text-slate-700"
            >
              Preferred Currency
            </label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 bg-white"
            >
              <option value="USD">USD ($) - United States Dollar</option>
              <option value="INR">INR (₹) - Indian Rupee</option>
            </select>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-indigo-700 transition-colors disabled:bg-indigo-400"
            >
              <Save size={18} />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>

      {/* Security Settings Card */}
      <div className="bg-white p-8 rounded-xl shadow-sm">
        <h2 className="text-2xl font-bold text-slate-800 mb-6">Security</h2>
        <div className="mt-6 border-t pt-6">
          <h3 className="text-lg font-medium text-slate-700">Danger Zone</h3>
          <div className="mt-4 p-4 border border-red-300 bg-red-50 rounded-lg flex items-start gap-4">
            <AlertTriangle
              className="text-red-500 flex-shrink-0 mt-1"
              size={24}
            />
            <div>
              <h4 className="font-semibold text-red-800">
                Log Out From All Devices
              </h4>
              <p className="text-sm text-red-700 mt-1">
                This will immediately log you out of FinTrack on all of your
                computers, phones, and tablets. You will need to sign in again
                everywhere.
              </p>
              {confirmLogoutAll ? (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-sm font-medium text-red-700">
                    Are you sure?
                  </span>
                  <button
                    onClick={handleLogoutAll}
                    className="flex items-center gap-2 bg-red-600 text-white font-semibold py-2 px-3 rounded-lg shadow-sm hover:bg-red-700 transition-colors text-sm"
                  >
                    <LogOut size={16} />
                    Yes, Log Out Everywhere
                  </button>
                  <button
                    onClick={() => setConfirmLogoutAll(false)}
                    className="px-3 py-2 text-sm text-slate-600 hover:text-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleLogoutAll}
                  className="mt-3 flex items-center gap-2 bg-red-600 text-white font-semibold py-2 px-3 rounded-lg shadow-sm hover:bg-red-700 transition-colors text-sm"
                >
                  <LogOut size={16} />
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
