// src/app/(main)/layout.js
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  List,
  BarChart2,
  LogOut,
  Menu,
  X,
  PiggyBank,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

function Sidebar({ isOpen, onClose, onLogout }) {
  const pathname = usePathname();
  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: Home },
    { href: "/transactions", label: "Transactions", icon: List },
    { href: "/reports", label: "Reports", icon: BarChart2 },
  ];

  const handleLinkClick = () => {
    // Only close the sidebar on mobile when a link is clicked
    if (window.innerWidth < 1024) {
      onClose();
    }
  };

  const sidebarVariants = {
    hidden: { x: "-100%" },
    visible: { x: "0%" },
  };

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-20 lg:hidden"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial="hidden"
        animate={isOpen ? "visible" : "hidden"}
        exit="hidden"
        variants={sidebarVariants}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="fixed lg:relative inset-y-0 left-0 w-64 bg-slate-800 text-white flex-col z-30 transform lg:translate-x-0 flex"
      >
        <div className="p-6 text-2xl font-bold flex items-center gap-2 border-b border-slate-700">
          <PiggyBank className="text-indigo-400" />
          FinTrack
        </div>
        <nav className="flex-1 px-4 py-4">
          <ul>
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={handleLinkClick}
                  className={`flex items-center p-3 my-1 rounded-lg transition-colors
                  ${
                    pathname === item.href
                      ? "bg-indigo-600 text-white font-semibold"
                      : "hover:bg-slate-700"
                  }`}
                >
                  <item.icon className="mr-3" size={20} />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="p-4 border-t border-slate-700">
          <button
            onClick={onLogout} // Use the logout handler passed via props
            className="flex items-center w-full p-3 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <LogOut className="mr-3" size={20} />
            Logout
          </button>
        </div>
      </motion.aside>
    </>
  );
}

export default function MainLayout({ children }) {
  const [user, setUser] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsSidebarOpen(window.innerWidth >= 1024);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);

    fetch("/api/user")
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Not authenticated");
      })
      .then((data) => setUser(data))
      .catch(() => {
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
      });

    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  const pathname = usePathname();

  useEffect(() => {
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  }, [pathname]);

  const getPageTitle = () => {
    if (pathname.includes("/dashboard")) return "Dashboard";
    if (pathname.includes("/transactions")) return "Transactions";
    if (pathname.includes("/reports")) return "Reports";
    return "FinTrack";
  };

  const handleLogout = async () => {
    try {
      // Call the logout API endpoint to invalidate the session on the server
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (error) {
      console.error("An error occurred during logout:", error);
    } finally {
      // Always redirect to login page on the client side
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onLogout={handleLogout}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-slate-200 p-4">
          <div className="flex justify-between items-center">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="lg:hidden text-slate-600 hover:text-slate-900"
              aria-label="Toggle menu"
            >
              {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <h1 className="text-xl font-semibold text-slate-800">
              {getPageTitle()}
            </h1>
            <div className="flex items-center gap-4">
              <div className="text-sm text-slate-600 hidden sm:block">
                {user ? `Welcome, ${user.accountName}` : "..."}
              </div>
              <button
                onClick={handleLogout}
                className="text-slate-600 hover:text-slate-900"
                aria-label="Logout"
              >
                <LogOut size={24} />
              </button>
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
