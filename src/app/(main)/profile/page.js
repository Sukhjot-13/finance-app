"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Save, LogOut, AlertTriangle } from "lucide-react";

export default function ProfilePage() {
  const [user, setUser] = useState(null);
  const [accountName, setAccountName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/user")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch user data");
        return res.json();
      })
      .then((data) => {
        setUser(data);
        setAccountName(data.accountName || "");
        setCurrency(data.currency || "USD");
        setLoading(false);
      })
      .catch(() => router.push("/login"));
  }, [router]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/user", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountName, currency }),
      });
      if (!res.ok) throw new Error("Failed to save profile");
      alert("Profile saved successfully!");
    } catch (error) {
      console.error(error);
      alert("Error saving profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoutAll = async () => {
    if (
      window.confirm(
        "Are you sure you want to log out from all devices? This action is irreversible."
      )
    ) {
      try {
        await fetch("/api/auth/logout-all", { method: "POST" });
        router.push("/login");
      } catch (error) {
        console.error("Failed to log out from all devices", error);
        alert("Could not log out from all devices.");
      }
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
              <button
                onClick={handleLogoutAll}
                className="mt-3 flex items-center gap-2 bg-red-600 text-white font-semibold py-2 px-3 rounded-lg shadow-sm hover:bg-red-700 transition-colors text-sm"
              >
                <LogOut size={16} />
                Log Out From All Devices
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
