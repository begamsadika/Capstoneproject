import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Heart,
  LayoutGrid,
  LogOut,
  Loader2,
  ShoppingCart,
  Store,
  User,
  Users,
} from "lucide-react";
import { WelloraLogoMark } from "./components/WelloraLogoMark";
import type { AdminPage } from "./layout/AdminLayout";
import { getAdminStats, type AdminStats } from "./api/admin";

type AdminNav = "dashboard" | "users" | "vendors" | "partners" | "profile";

const STAT_DEFS = [
  { label: "Total Users", key: "total_users" as keyof AdminStats, icon: Users },
  { label: "Total Vendors", key: "total_vendors" as keyof AdminStats, icon: Store },
  { label: "Total Partners", key: "total_partners" as keyof AdminStats, icon: Heart },
  { label: "Orders Today", key: "orders_today" as keyof AdminStats, icon: ShoppingCart },
];

const navItemClass = (active: boolean) =>
  active
    ? "flex w-full items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5 text-left text-base font-semibold text-slate-900"
    : "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-base font-medium text-slate-600 transition hover:bg-slate-100";


interface AdminDashboardProps {
  onNavigate?: (page: AdminPage) => void;
  onLogout?: () => void;
}

export function AdminDashboard({ onNavigate, onLogout }: AdminDashboardProps) {
  const [activeNav, setActiveNav] = useState<AdminNav>("dashboard");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  // ── Real stats from backend ──
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    getAdminStats()
      .then(setStats)
      .catch(() => { /* silently fall back to showing "–" */ })
      .finally(() => setStatsLoading(false));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(e.target as Node)
      ) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNavClick = (nav: AdminNav) => {
    setActiveNav(nav);
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
      return;
    }
    localStorage.clear();
    window.location.reload();
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-100 text-slate-900">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6">
        <div className="mb-8 flex items-center gap-2 px-1">
          <WelloraLogoMark size="md" />
          <span className="text-xl font-semibold tracking-tight text-wellora">
            Wellora
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          <button
            type="button"
            onClick={() => handleNavClick("dashboard")}
            className={navItemClass(activeNav === "dashboard")}
          >
            <LayoutGrid className="h-4 w-4 shrink-0" />
            Dashboard
          </button>
          <button
            type="button"
            onClick={() =>
              onNavigate
                ? onNavigate("manage-users")
                : handleNavClick("users")
            }
            className={navItemClass(activeNav === "users")}
          >
            <User className="h-4 w-4 shrink-0" />
            Manage Users
          </button>
          <button
            type="button"
            onClick={() =>
              onNavigate
                ? onNavigate("manage-vendors")
                : handleNavClick("vendors")
            }
            className={navItemClass(activeNav === "vendors")}
          >
            <Store className="h-4 w-4 shrink-0" />
            Manage Vendors
          </button>
          <button
            type="button"
            onClick={() =>
              onNavigate
                ? onNavigate("manage-partners")
                : handleNavClick("partners")
            }
            className={navItemClass(activeNav === "partners")}
          >
            <Heart className="h-4 w-4 shrink-0" />
            Manage Partners
          </button>
          <button
            type="button"
            onClick={() => handleNavClick("profile")}
            className={navItemClass(activeNav === "profile")}
          >
            <User className="h-4 w-4 shrink-0" />
            Admin Profile
          </button>
        </nav>

        <button
          type="button"
          onClick={handleLogout}
          className="mt-auto flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-base font-medium text-red-600 transition hover:bg-red-50"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Log Out
        </button>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div className="flex items-center gap-2">
            <WelloraLogoMark size="sm" />
            <span className="text-base font-semibold text-wellora">Wellora</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-full p-2 text-slate-600 hover:bg-slate-100"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
            </button>
            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setProfileMenuOpen((open) => !open)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sky-600 ring-2 ring-slate-200 transition hover:ring-wellora/50"
                aria-label="Open profile menu"
              >
                <User className="h-5 w-5" />
              </button>
              {profileMenuOpen && (
                <div className="absolute right-0 z-10 mt-2 w-40 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-base text-slate-700 hover:bg-slate-100"
                  >
                    <LogOut className="h-4 w-4 text-red-600" />
                    Log Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto p-6">
          {activeNav === "profile" ? (
            <div className="mx-auto max-w-3xl space-y-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                  Admin Profile
                </h1>
                <p className="mt-1 text-base text-slate-500">
                  Manage your administrator account settings.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                    <User className="h-8 w-8" />
                  </div>
                  <div>
                    <p className="text-xl font-semibold text-slate-900">
                      Platform Administrator
                    </p>
                    <p className="text-base text-slate-500">admin@wellora.com</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-7xl space-y-8">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                  Admin Dashboard
                </h1>
                <p className="mt-1 text-base text-slate-500">
                  Overview and management of Wellora platform.
                </p>
              </div>

              <section>
                <h2 className="mb-4 text-base font-semibold text-slate-700">
                  System Overview
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {STAT_DEFS.map((stat) => {
                    const Icon = stat.icon;
                    const value = stats ? stats[stat.key].toLocaleString() : "–";
                    return (
                      <div
                        key={stat.label}
                        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-base text-slate-500">{stat.label}</p>
                            <p className="mt-2 text-3xl font-bold text-slate-900">
                              {statsLoading ? (
                                <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
                              ) : (
                                value
                              )}
                            </p>
                          </div>
                          <div className="rounded-lg bg-slate-100 p-2 text-slate-500">
                            <Icon className="h-5 w-5" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section>
                <h2 className="mb-4 text-xl font-bold text-slate-900">Quick Access</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => onNavigate ? onNavigate("manage-users") : handleNavClick("users")}
                    className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-wellora/40 hover:shadow-md text-left"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                      <Users className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Manage Users</p>
                      <p className="mt-0.5 text-sm text-slate-500">View, enable, or disable user accounts</p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate ? onNavigate("manage-vendors") : handleNavClick("vendors")}
                    className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-wellora/40 hover:shadow-md text-left"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-wellora-soft text-wellora-dark">
                      <Store className="h-6 w-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Manage Vendors</p>
                      <p className="mt-0.5 text-sm text-slate-500">Approve, suspend, or review vendor applications</p>
                    </div>
                  </button>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
