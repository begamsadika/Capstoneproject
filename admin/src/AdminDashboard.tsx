import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Ban,
  Bell,
  Eye,
  Heart,
  LayoutGrid,
  LogOut,
  ShoppingCart,
  Store,
  User,
  Users,
} from "lucide-react";
import { WelloraLogoMark } from "./components/WelloraLogoMark";
import type { AdminPage } from "./layout/AdminLayout";

type AdminNav = "dashboard" | "users" | "vendors" | "partners" | "profile";
type ManagementTab = "users" | "vendors" | "partners";

interface PlatformUser {
  id: string;
  name: string;
  email: string;
  status: "Active" | "Inactive";
}

interface PlatformVendor {
  id: string;
  name: string;
  email: string;
  status: "Active" | "Inactive";
}

interface PlatformPartner {
  id: string;
  name: string;
  email: string;
  status: "Active" | "Inactive";
}

const MOCK_USERS: PlatformUser[] = [
  {
    id: "USR001",
    name: "Alice Johnson",
    email: "alice.johnson@example.com",
    status: "Active",
  },
  {
    id: "USR002",
    name: "Bob Williams",
    email: "bob.williams@example.com",
    status: "Inactive",
  },
  {
    id: "USR003",
    name: "Charlie Brown",
    email: "charlie.brown@example.com",
    status: "Active",
  },
  {
    id: "USR004",
    name: "Diana Miller",
    email: "diana.miller@example.com",
    status: "Active",
  },
  {
    id: "USR005",
    name: "Eve Davis",
    email: "eve.davis@example.com",
    status: "Inactive",
  },
];

const MOCK_VENDORS: PlatformVendor[] = [
  {
    id: "VND001",
    name: "Green Bowl Kitchen",
    email: "contact@greenbowl.com",
    status: "Active",
  },
  {
    id: "VND002",
    name: "Fresh Harvest Cafe",
    email: "hello@freshharvest.com",
    status: "Active",
  },
  {
    id: "VND003",
    name: "NutriBox Meals",
    email: "support@nutribox.com",
    status: "Inactive",
  },
];

const MOCK_PARTNERS: PlatformPartner[] = [
  {
    id: "PTR001",
    name: "City Hospital",
    email: "wellness@cityhospital.org",
    status: "Active",
  },
  {
    id: "PTR002",
    name: "Metro Fitness Club",
    email: "partners@metrofitness.com",
    status: "Active",
  },
  {
    id: "PTR003",
    name: "Wellness Center East",
    email: "admin@wellnesseast.com",
    status: "Inactive",
  },
];

const STATS = [
  { label: "Total Users", value: "1,250", icon: Users },
  { label: "Total Vendors", value: "48", icon: Store },
  { label: "Total Partners", value: "15", icon: Heart },
  { label: "Active Sessions", value: "236", icon: Activity },
  { label: "Orders Today", value: "87", icon: ShoppingCart },
];

const navItemClass = (active: boolean) =>
  active
    ? "flex w-full items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5 text-left text-base font-semibold text-slate-900"
    : "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-base font-medium text-slate-600 transition hover:bg-slate-100";

function StatusBadge({ status }: { status: "Active" | "Inactive" }) {
  if (status === "Active") {
    return <span className="text-base font-medium text-wellora">Active</span>;
  }
  return (
    <span className="inline-flex rounded-full bg-red-50 px-2.5 py-0.5 text-sm font-medium text-red-600">
      Inactive
    </span>
  );
}

interface AdminDashboardProps {
  onNavigate?: (page: AdminPage) => void;
  onLogout?: () => void;
}

export function AdminDashboard({ onNavigate, onLogout }: AdminDashboardProps) {
  const [activeNav, setActiveNav] = useState<AdminNav>("dashboard");
  const [managementTab, setManagementTab] = useState<ManagementTab>("users");
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

  const handleNavClick = (nav: AdminNav, tab?: ManagementTab) => {
    setActiveNav(nav);
    if (tab) setManagementTab(tab);
  };

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
      return;
    }
    localStorage.clear();
    window.location.reload();
  };

  const managementTabs: { id: ManagementTab; label: string }[] = [
    { id: "users", label: "Manage Users" },
    { id: "vendors", label: "Manage Vendors" },
    { id: "partners", label: "Manage Partners" },
  ];

  const tableConfig = {
    users: {
      title: "Manage Users",
      columns: ["User ID", "Name", "Email", "Status", "Actions"],
      rows: MOCK_USERS.map((user) => ({
        id: user.id,
        cells: [user.id, user.name, user.email],
        status: user.status,
      })),
    },
    vendors: {
      title: "Manage Vendors",
      columns: ["Vendor ID", "Name", "Email", "Status", "Actions"],
      rows: MOCK_VENDORS.map((vendor) => ({
        id: vendor.id,
        cells: [vendor.id, vendor.name, vendor.email],
        status: vendor.status,
      })),
    },
    partners: {
      title: "Manage Partners",
      columns: ["Partner ID", "Name", "Email", "Status", "Actions"],
      rows: MOCK_PARTNERS.map((partner) => ({
        id: partner.id,
        cells: [partner.id, partner.name, partner.email],
        status: partner.status,
      })),
    },
  }[managementTab];

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
                : handleNavClick("users", "users")
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
                : handleNavClick("vendors", "vendors")
            }
            className={navItemClass(activeNav === "vendors")}
          >
            <Store className="h-4 w-4 shrink-0" />
            Manage Vendors
          </button>
          <button
            type="button"
            onClick={() => handleNavClick("partners", "partners")}
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
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {STATS.map((stat) => {
                    const Icon = stat.icon;
                    return (
                      <div
                        key={stat.label}
                        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-base text-slate-500">{stat.label}</p>
                            <p className="mt-2 text-3xl font-bold text-slate-900">
                              {stat.value}
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
                <h2 className="mb-4 text-xl font-bold text-slate-900">
                  Management
                </h2>
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex gap-1 border-b border-slate-200 bg-slate-50 p-2">
                    {managementTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setManagementTab(tab.id);
                          setActiveNav(
                            tab.id === "users"
                              ? "users"
                              : tab.id === "vendors"
                                ? "vendors"
                                : "partners",
                          );
                        }}
                        className={`rounded-lg px-4 py-2 text-base font-medium transition ${
                          managementTab === tab.id
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="p-5">
                    <h3 className="mb-4 text-lg font-semibold text-slate-900">
                      {tableConfig.title}
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] text-left text-base">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-500">
                            {tableConfig.columns.map((column) => (
                              <th
                                key={column}
                                className="px-4 py-3 font-medium first:pl-0 last:pr-0"
                              >
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {tableConfig.rows.map((row, index) => (
                            <tr
                              key={row.id}
                              className={
                                index % 2 === 0 ? "bg-white" : "bg-slate-50/80"
                              }
                            >
                              {row.cells.map((cell, cellIndex) => (
                                <td
                                  key={`${row.id}-${cellIndex}`}
                                  className="px-4 py-3.5 text-slate-700 first:pl-0"
                                >
                                  {cell}
                                </td>
                              ))}
                              <td className="px-4 py-3.5">
                                <StatusBadge status={row.status} />
                              </td>
                              <td className="px-4 py-3.5 last:pr-0">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                                    aria-label={`View ${row.id}`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-lg bg-red-600 p-2 text-white transition hover:bg-red-700"
                                    aria-label={`Block ${row.id}`}
                                  >
                                    <Ban className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
