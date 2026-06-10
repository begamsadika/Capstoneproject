import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  Heart,
  LayoutGrid,
  LogOut,
  Store,
  User,
  Users,
} from "lucide-react";
import { WelloraLogoMark } from "../components/WelloraLogoMark";

export type AdminPage =
  | "dashboard"
  | "manage-users"
  | "manage-vendors"
  | "manage-partners"
  | "system-monitoring"
  | "admin-profile";

interface AdminLayoutProps {
  activePage: AdminPage;
  onNavigate: (page: AdminPage) => void;
  onLogout?: () => void;
  children: ReactNode;
}

const navItemClass = (active: boolean) =>
  active
    ? "flex w-full items-center gap-3 rounded-xl bg-wellora-soft px-3 py-2.5 text-left text-base font-semibold text-wellora-dark"
    : "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-base font-medium text-slate-600 transition hover:bg-slate-100";

export function AdminLayout({
  activePage,
  onNavigate,
  onLogout,
  children,
}: AdminLayoutProps) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

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
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50 px-4 py-6">
        <div className="mb-8 flex items-center gap-2 px-1">
          <WelloraLogoMark size="md" />
          <span className="text-xl font-semibold tracking-tight text-wellora">
            Wellora
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          <button
            type="button"
            onClick={() => onNavigate("dashboard")}
            className={navItemClass(activePage === "dashboard")}
          >
            <LayoutGrid className="h-5 w-5 shrink-0" />
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => onNavigate("manage-users")}
            className={navItemClass(activePage === "manage-users")}
          >
            <Users className="h-5 w-5 shrink-0" />
            Manage Users
          </button>
          <button
            type="button"
            onClick={() => onNavigate("manage-vendors")}
            className={navItemClass(activePage === "manage-vendors")}
          >
            <Store className="h-5 w-5 shrink-0" />
            Manage Vendors
          </button>
          <button
            type="button"
            onClick={() => onNavigate("manage-partners")}
            className={navItemClass(activePage === "manage-partners")}
          >
            <Heart className="h-5 w-5 shrink-0" />
            Manage Partners
          </button>
          {/* <button
            type="button"
            onClick={() => onNavigate("system-monitoring")}
            className={navItemClass(activePage === "system-monitoring")}
          >
            <Monitor className="h-5 w-5 shrink-0" />
            System Monitoring
          </button> */}
        </nav>

        <button
          type="button"
          onClick={() => onNavigate("admin-profile")}
          className={`mt-auto flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-base font-medium transition ${
            activePage === "admin-profile"
              ? "bg-rose-50 font-semibold text-rose-600"
              : "text-rose-500 hover:bg-rose-50"
          }`}
        >
          <User className="h-5 w-5 shrink-0" />
          Admin Profile
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
                <div className="absolute right-0 z-10 mt-2 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
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

        <main className="min-h-0 flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
