// src/app/(main)/layout.js
"use client";

import { useState, useEffect, createContext, useContext } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Home,
  List,
  BarChart2,
  LogOut,
  Menu,
  X,
  PiggyBank,
  User as UserIcon,
  ChevronDown,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import api from "@/lib/api";

// Export the context so other components can use it
export const UserContext = createContext(null);

function Sidebar({ isOpen, onClose }) {
  const pathname = usePathname();
  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: Home },
    { href: "/transactions", label: "Transactions", icon: List },
    { href: "/reports", label: "Reports", icon: BarChart2 },
  ];

  const handleLinkClick = () => {
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
      </motion.aside>
    </>
  );
}

function ProfileDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const user = useContext(UserContext);
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch (error) {
      console.error("An error occurred during logout:", error);
    } finally {
      router.push("/login");
    }
  };

  if (!user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 focus:outline-none"
      >
        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
          <UserIcon size={20} className="text-indigo-600" />
        </div>
        <span className="hidden sm:inline font-medium">{user.accountName}</span>
        <ChevronDown size={16} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50 border border-slate-200"
          >
            <Link
              href="/profile"
              onClick={() => setIsOpen(false)}
              className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Profile
            </Link>
            <button
              onClick={handleLogout}
              className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              <LogOut className="inline mr-2" size={16} />
              Logout
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function MainLayout({ children }) {
  const [user, setUser] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const checkScreenSize = () => {
      setIsSidebarOpen(window.innerWidth >= 1024);
    };
    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);

    const fetchUser = async () => {
      try {
        const res = await api("/api/user");
        if (!res.ok) {
          throw new Error("Not authenticated");
        }
        const data = await res.json();
        setUser(data);
        // Only set loading to false after successfully fetching the user
        setLoading(false);
      } catch (error) {
        console.error("Failed to fetch user:", error);
        // If there's an error, redirect to login. The component will unmount.
        router.push("/login");
      }
    };

    fetchUser();

    return () => window.removeEventListener("resize", checkScreenSize);
  }, [router]);

  useEffect(() => {
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  }, [pathname]);

  const getPageTitle = () => {
    if (pathname.includes("/dashboard")) return "Dashboard";
    if (pathname.includes("/transactions")) return "Transactions";
    if (pathname.includes("/reports")) return "Reports";
    if (pathname.includes("/profile")) return "Profile";
    return "FinTrack";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <PiggyBank className="w-12 h-12 text-indigo-600 animate-bounce" />
      </div>
    );
  }

  return (
    <UserContext.Provider value={user}>
      <div className="flex h-screen bg-slate-50 overflow-hidden">
        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="bg-white border-b border-slate-200 p-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4">
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
              </div>
              <ProfileDropdown />
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
        </main>
      </div>
    </UserContext.Provider>
  );
}
