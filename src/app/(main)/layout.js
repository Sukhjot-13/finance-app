// src/app/(main)/layout.js
"use client";

import { useState, useEffect, useRef, createContext, useContext } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Home,
  List,
  BarChart2,
  Tags,
  LogOut,
  Menu,
  X,
  PiggyBank,
  User as UserIcon,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import api from "@/lib/api";

// Export the context so other components can use it.
// Shape: { user, setUser } — setUser lets pages (e.g. profile) update the
// shared user immediately so currency/name changes propagate app-wide
// without a full reload.
export const UserContext = createContext(null);

function Sidebar({ isOpen, onClose }) {
  const pathname = usePathname();
  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: Home },
    { href: "/transactions", label: "Transactions", icon: List },
    { href: "/reports", label: "Reports", icon: BarChart2 },
    { href: "/categories", label: "Categories", icon: Tags },
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
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-30 lg:hidden"
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
        className="fixed lg:relative inset-y-0 left-0 w-64 bg-zinc-900/90 border-r border-zinc-800/80 backdrop-blur-xl text-zinc-100 flex flex-col z-40 transform lg:translate-x-0 pt-safe pb-safe"
      >
        <div className="p-6 flex items-center justify-between border-b border-zinc-800/80">
          <Link href="/dashboard" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-zinc-950 shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
              <PiggyBank size={22} className="stroke-[2.5]" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                FinTrack
              </span>
              <span className="block text-[10px] uppercase font-mono tracking-widest text-emerald-400/80">
                Finance Pro
              </span>
            </div>
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-800/50"
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-6 space-y-1">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 font-mono">
            Navigation
          </p>
          <ul>
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={handleLinkClick}
                    className={`flex items-center px-3.5 py-2.5 my-1 rounded-xl text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.12)]"
                        : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 border border-transparent"
                    }`}
                  >
                    <Icon
                      className={`mr-3 transition-colors ${
                        isActive ? "text-emerald-400" : "text-zinc-500 group-hover:text-zinc-300"
                      }`}
                      size={18}
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Sidebar Footer badge */}
        <div className="p-4 m-3 rounded-2xl bg-zinc-950/60 border border-zinc-800/60">
          <div className="flex items-center gap-2 mb-1.5 text-xs font-medium text-emerald-400">
            <Sparkles size={14} />
            <span>Smart Tracking</span>
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Real-time balance, budgets, and automated reports.
          </p>
        </div>
      </motion.aside>
    </>
  );
}

function ProfileDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  // Two-step confirm so one stray click can't log the user out.
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const { user } = useContext(UserContext);
  const router = useRouter();
  const menuRef = useRef(null);

  // Close on outside click or Escape; proper menu semantics for a11y.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onPointerDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  const closeMenu = () => {
    setConfirmingLogout(false);
    setIsOpen(false);
  };

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
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => {
          if (isOpen) setConfirmingLogout(false);
          setIsOpen(!isOpen);
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Account menu"
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800/90 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-zinc-950 font-bold text-xs shadow-sm">
          {user.accountName ? user.accountName.charAt(0).toUpperCase() : <UserIcon size={14} />}
        </div>
        <span className="hidden sm:inline font-medium text-xs text-zinc-200">
          {user.accountName}
        </span>
        <ChevronDown size={14} className={`text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-56 bg-zinc-900/95 backdrop-blur-xl rounded-2xl shadow-2xl p-1.5 z-50 border border-zinc-800/90 divide-y divide-zinc-800/60"
            role="menu"
          >
            <div className="px-3 py-2">
              <p className="text-xs font-semibold text-zinc-200 truncate">{user.accountName}</p>
              <p className="text-[11px] text-zinc-400 truncate">{user.email}</p>
            </div>
            
            <div className="py-1">
              <Link
                href="/profile"
                onClick={closeMenu}
                className="flex items-center px-3 py-2 text-xs font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/70 rounded-xl transition-colors"
                role="menuitem"
              >
                <UserIcon size={15} className="mr-2.5 text-zinc-400" />
                Profile
              </Link>
            </div>

            <div className="pt-1">
              {confirmingLogout ? (
                <div className="p-3 bg-zinc-950/80 rounded-xl border border-rose-500/20">
                  <p className="text-xs font-medium text-zinc-300 mb-2.5">
                    Log out of FinTrack on this device?
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleLogout}
                      className="flex-1 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 px-3 py-1.5 rounded-lg shadow-sm transition-colors"
                      role="menuitem"
                    >
                      Yes, log out
                    </button>
                    <button
                      onClick={() => setConfirmingLogout(false)}
                      className="text-xs font-medium text-zinc-400 hover:text-zinc-200 px-2.5 py-1.5 rounded-lg hover:bg-zinc-800/70 transition-colors"
                      role="menuitem"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmingLogout(true)}
                  className="flex items-center w-full text-left px-3 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors"
                  role="menuitem"
                >
                  <LogOut className="mr-2.5" size={15} />
                  Logout
                </button>
              )}
            </div>
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
  const [loadError, setLoadError] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Only react to crossing the desktop/mobile boundary; resizing within
    // the same mode must not reopen a sidebar the user manually closed.
    let wasDesktop = window.innerWidth >= 1024;
    const onResize = () => {
      const isDesktop = window.innerWidth >= 1024;
      if (isDesktop !== wasDesktop) {
        setIsSidebarOpen(isDesktop);
        wasDesktop = isDesktop;
      }
    };
    window.addEventListener("resize", onResize);

    const fetchUser = async () => {
      try {
        const res = await api("/api/user");
        if (!res.ok) {
          throw new Error("Not authenticated");
        }
        const data = await res.json();
        setUser(data);
        setLoading(false);
      } catch (error) {
        console.error("Failed to fetch user:", error);
        // api() has already redirected to /login for definitive auth
        // failures — anything reaching here is transient. Show a retry
        // state instead of bouncing the user around.
        setLoading(false);
        setLoadError(true);
      }
    };

    fetchUser();

    return () => window.removeEventListener("resize", onResize);
  }, [router]);

  // Close the mobile sidebar when the route changes. Done as a render-time
  // adjustment (React's recommended pattern for "respond to prop change")
  // instead of a setState-in-effect, which causes cascading renders.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  }

  const getPageTitle = () => {
    if (pathname.includes("/dashboard")) return "Dashboard";
    if (pathname.includes("/transactions")) return "Transactions";
    if (pathname.includes("/reports")) return "Reports";
    if (pathname.includes("/categories")) return "Categories";
    if (pathname.includes("/profile")) return "Profile";
    return "FinTrack";
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 text-zinc-100">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-zinc-950 shadow-lg shadow-emerald-500/20 animate-pulse">
          <PiggyBank className="w-7 h-7" />
        </div>
        <p className="mt-4 text-xs font-mono tracking-wider text-zinc-400">Loading your finances...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-screen bg-zinc-950 p-6">
        <div className="text-center bg-zinc-900 border border-zinc-800 p-8 rounded-2xl shadow-2xl max-w-md">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
            <X size={24} />
          </div>
          <h2 className="text-lg font-bold text-zinc-100 mb-2">
            Couldn&apos;t load your account
          </h2>
          <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
            Something went wrong connecting to your session. Your stored records are safe.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-xl text-sm font-semibold transition-colors shadow-lg shadow-emerald-500/20"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <UserContext.Provider value={{ user, setUser }}>
      <div className="flex h-screen bg-zinc-950 overflow-hidden text-zinc-100 relative selection:bg-emerald-500/30 selection:text-emerald-300">
        {/* Ambient subtle glow effects */}
        <div className="absolute -top-40 left-1/4 w-96 h-96 bg-emerald-500/5 blur-[120px] pointer-events-none rounded-full" />
        <div className="absolute -bottom-40 right-10 w-96 h-96 bg-teal-500/5 blur-[120px] pointer-events-none rounded-full" />

        <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        
        <main className="flex-1 flex flex-col overflow-hidden relative z-10">
          <header className="bg-zinc-950/70 backdrop-blur-xl border-b border-zinc-800/80 px-4 sm:px-8 py-4 pt-[calc(1rem+env(safe-area-inset-top,0px))] lg:pt-4 sticky top-0 z-20">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className="lg:hidden text-zinc-400 hover:text-zinc-100 p-1.5 rounded-lg hover:bg-zinc-900 border border-zinc-800"
                  aria-label="Toggle menu"
                >
                  {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-zinc-100">
                    {getPageTitle()}
                  </h1>
                </div>
              </div>
              <ProfileDropdown />
            </div>
          </header>
          
          <div className="flex-1 overflow-y-auto p-4 sm:p-8">{children}</div>
        </main>
      </div>
    </UserContext.Provider>
  );
}
