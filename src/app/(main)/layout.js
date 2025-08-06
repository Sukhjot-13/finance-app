// src/app/(main)/layout.js
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, List, BarChart2, PlusCircle, LogOut } from "lucide-react";

function Sidebar() {
  const pathname = usePathname();
  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: Home },
    { href: "/transactions", label: "Transactions", icon: List },
    { href: "/reports", label: "Reports", icon: BarChart2 },
  ];

  return (
    <aside className="w-64 bg-gray-800 text-white flex flex-col">
      <div className="p-6 text-2xl font-semibold">FinTrack</div>
      <nav className="flex-1 px-4">
        <ul>
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex items-center p-3 my-1 rounded-lg hover:bg-gray-700 ${
                  pathname === item.href ? "bg-gray-900" : ""
                }`}
              >
                <item.icon className="mr-3" />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={() => {
            // This would be an API call in a real app
            document.cookie =
              "accessToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
            window.location.href = "/login";
          }}
          className="flex items-center w-full p-3 rounded-lg hover:bg-gray-700"
        >
          <LogOut className="mr-3" />
          Logout
        </button>
      </div>
    </aside>
  );
}

export default function MainLayout({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch("/api/user")
      .then((res) => res.json())
      .then((data) => setUser(data));
  }, []);

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white shadow-sm p-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold">
              {user ? `Welcome, ${user.accountName}` : "Loading..."}
            </h1>
            {/* AddTransactionModal will be triggered from here or a dedicated button */}
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </main>
    </div>
  );
}
