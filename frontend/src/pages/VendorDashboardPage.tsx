import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  LayoutGrid,
  LogOut,
  Package,
  Plus,
  ShoppingCart,
  Star,
  Store,
  TrendingUp,
  UtensilsCrossed,
} from "lucide-react";
import type { AppPage } from "../types/page";
import { WelloraLogoMark } from "../components/WelloraLogoMark";
import { resolveImageUrl } from "../api/client";
import {
  getVendorOrders,
  updateOrderStatus,
  getVendorOrderStats,
  type VendorOrder,
  type VendorOrderStats,
} from "../api/orders";
import { getVendorMeals, getVendorStats } from "../api/meals";
import MealManagement from "./MealManagement";

interface VendorDashboardPageProps {
  onNavigate: (page: AppPage) => void;
}

interface VendorStats {
  total_meals: number;
  total_orders: number;
  total_revenue: number;
  rating: number;
}

const PROFILE_IMG =
  "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=120&h=120&q=80";

const WEEKLY_REVENUE = [
  { label: "Mon", value: 3200 },
  { label: "Tue", value: 4100 },
  { label: "Wed", value: 3800 },
  { label: "Thu", value: 5200 },
  { label: "Fri", value: 6100 },
  { label: "Sat", value: 4800 },
  { label: "Sun", value: 3900 },
];

type OrderStatus = "pending" | "confirmed" | "delivered" | "cancelled";
type VendorSection = "dashboard" | "meals" | "orders" | "menu";

function VendorOrdersSection() {
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [stats, setStats] = useState<VendorOrderStats | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const STATUS_FILTERS = [
    "all",
    "pending",
    "confirmed",
    "delivered",
    "cancelled",
  ];

  const STATUS_COLORS: Record<string, string> = {
    pending:
      "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
    confirmed:
      "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
    delivered:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200",
  };

  const NEXT_STATUS: Record<string, string> = {
    pending: "confirmed",
    confirmed: "delivered",
  };

  const NEXT_STATUS_LABEL: Record<string, string> = {
    pending: "Confirm Order",
    confirmed: "Mark Delivered",
  };

  useEffect(() => {
    loadData();
  }, [filterStatus]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [ordersData, statsData] = await Promise.all([
        getVendorOrders(filterStatus === "all" ? undefined : filterStatus),
        getVendorOrderStats(),
      ]);
      setOrders(ordersData);
      setStats(statsData);
    } catch (err) {
      console.error("Failed to load orders:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusUpdate = async (orderId: number, newStatus: string) => {
    setUpdatingId(orderId);
    try {
      await updateOrderStatus(orderId, newStatus);
      await loadData();
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Orders
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage all customer orders
        </p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Total Orders",
              value: stats.total_orders,
              color: "text-slate-900 dark:text-white",
            },
            {
              label: "Total Revenue",
              value: `Rs ${stats.total_revenue.toFixed(2)}`,
              color: "text-wellora",
            },
            { label: "Pending", value: stats.pending, color: "text-amber-600" },
            {
              label: "Delivered",
              value: stats.delivered,
              color: "text-emerald-600",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                {s.label}
              </p>
              <p className={`mt-2 text-2xl font-bold tabular-nums ${s.color}`}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterStatus(s)}
            className={`rounded-full px-4 py-2 text-sm font-medium capitalize transition ${
              filterStatus === s
                ? "bg-wellora text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
            }`}
          >
            {s === "all" ? "All Orders" : s}
          </button>
        ))}
        <button
          type="button"
          onClick={loadData}
          className="ml-auto rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Orders table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-wellora border-t-transparent" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-slate-500">No orders found.</p>
            {filterStatus !== "all" && (
              <button
                type="button"
                onClick={() => setFilterStatus("all")}
                className="mt-3 text-sm text-wellora hover:underline"
              >
                View all orders
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                  <th className="px-5 py-3 font-semibold">Order ID</th>
                  <th className="px-5 py-3 font-semibold">Meal</th>
                  <th className="px-5 py-3 font-semibold">Customer</th>
                  <th className="px-5 py-3 font-semibold">Qty</th>
                  <th className="px-5 py-3 font-semibold">Total</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-5 py-3 font-mono text-xs font-medium text-slate-900 dark:text-white">
                      #{order.id}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {order.meal_image && (
                          <img
                            src={order.meal_image}
                            alt=""
                            className="h-9 w-9 rounded-lg object-cover shrink-0"
                          />
                        )}
                        <span className="font-medium text-slate-900 dark:text-white">
                          {order.meal_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900 dark:text-white">
                        {order.customer_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {order.customer_email}
                      </p>
                    </td>
                    <td className="px-5 py-3 tabular-nums text-slate-700 dark:text-slate-300">
                      ×{order.quantity}
                    </td>
                    <td className="px-5 py-3 font-semibold tabular-nums text-slate-900 dark:text-white">
                      Rs {order.total_price.toFixed(2)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[order.status] ?? "bg-slate-100 text-slate-700"}`}
                      >
                        {order.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {new Date(order.created_at).toLocaleDateString()}
                      <br />
                      {new Date(order.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3">
                      {NEXT_STATUS[order.status] ? (
                        <button
                          type="button"
                          disabled={updatingId === order.id}
                          onClick={() =>
                            handleStatusUpdate(
                              order.id,
                              NEXT_STATUS[order.status],
                            )
                          }
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition ${
                            order.status === "pending"
                              ? "bg-blue-500 hover:bg-blue-600"
                              : "bg-emerald-500 hover:bg-emerald-600"
                          } disabled:opacity-50`}
                        >
                          {updatingId === order.id
                            ? "..."
                            : NEXT_STATUS_LABEL[order.status]}
                        </button>
                      ) : order.status === "pending" ? (
                        <button
                          type="button"
                          disabled={updatingId === order.id}
                          onClick={() =>
                            handleStatusUpdate(order.id, "cancelled")
                          }
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
export function VendorDashboardPage({ onNavigate }: VendorDashboardPageProps) {
  const [vendorSection, setVendorSection] =
    useState<VendorSection>("dashboard");
  const [meals, setMeals] = useState<any[]>([]); // Only for dashboard stats and menu
  const [vendorOrders, setVendorOrders] = useState<VendorOrder[]>([]);
  const [stats, setStats] = useState<VendorStats>({
    total_meals: 0,
    total_orders: 0,
    total_revenue: 0,
    rating: 4.8,
  });
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  // ─── Load meals + stats from backend ───────────
  useEffect(() => {
    loadMeals();
    loadOrders();
    loadStats();
  }, []);

  const loadMeals = async () => {
    try {
      const data = await getVendorMeals();
      setMeals(data);
    } catch (err) {
      console.error("Failed to load meals:", err);
    }
  };

  const loadStats = async () => {
    try {
      const data = await getVendorStats();
      setStats((prev) => ({ ...prev, ...data }));
    } catch (err) {
      console.error("Failed to load stats:", err);
    }
  };

  const loadOrders = async () => {
    try {
      const data = await getVendorOrders();
      setVendorOrders(data);
    } catch (err) {
      console.error("Failed to load vendor orders:", err);
    }
  };



  // ─── Click outside profile menu ────────────────
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

  const chartMax = Math.max(...WEEKLY_REVENUE.map((d) => d.value));
  const recentOrders = vendorOrders.slice(0, 5);

  const orderStatusClass = (s: OrderStatus) => {
    switch (s) {
      case "pending":
        return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
      case "confirmed":
        return "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200";
      case "delivered":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300";
      case "cancelled":
        return "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300";
      default:
        return "bg-slate-200 text-slate-700";
    }
  };

  const navItemClass = (active: boolean) =>
    active
      ? "flex w-full items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5 text-left text-sm font-semibold text-slate-900 dark:bg-slate-800 dark:text-white"
      : "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800";

  const topSelling = meals.slice(0, 3).map((m, i) => ({
    rank: i + 1,
    mealName: m.name,
    orders: Math.floor(Math.random() * 100) + 50,
  }));

  // ─── LOGOUT ────────────────────────────────────
  const handleLogout = () => {
    localStorage.clear();
    onNavigate("login");
  };

  return (
    <div className="flex min-h-dvh bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Sidebar */}
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-8 flex items-center gap-2 px-1">
          <WelloraLogoMark size="md" />
          <span className="text-lg font-semibold tracking-tight text-wellora">
            Wellora
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          <button
            type="button"
            onClick={() => setVendorSection("dashboard")}
            className={navItemClass(vendorSection === "dashboard")}
          >
            <LayoutGrid className="h-4 w-4 shrink-0" /> Dashboard
          </button>
          <button
            type="button"
            onClick={() => setVendorSection("meals")}
            className={navItemClass(vendorSection === "meals")}
          >
            <UtensilsCrossed className="h-4 w-4 shrink-0" /> Meal Management
          </button>
          <button
            type="button"
            onClick={() => setVendorSection("orders")}
            className={navItemClass(vendorSection === "orders")}
          >
            <Store className="h-4 w-4 shrink-0" /> Orders
          </button>
          <button
            type="button"
            onClick={() => setVendorSection("menu")}
            className={navItemClass(vendorSection === "menu")}
          >
            <ShoppingCart className="h-4 w-4 shrink-0" /> Menu
          </button>
        </nav>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-auto flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          <LogOut className="h-4 w-4 shrink-0" /> Log Out
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <WelloraLogoMark size="sm" />
            <span className="font-semibold text-wellora">Wellora</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-full p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Bell className="h-5 w-5" />
            </button>
            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setProfileMenuOpen((o) => !o)}
                className="rounded-full ring-2 ring-slate-200 transition hover:bg-slate-100 dark:ring-slate-700"
              >
                <img
                  src={PROFILE_IMG}
                  alt="Profile"
                  className="h-9 w-9 rounded-full object-cover"
                />
              </button>
              {profileMenuOpen && (
                <div className="absolute right-0 z-10 mt-2 w-40 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <LogOut className="h-4 w-4 text-red-600" /> Log Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-auto p-6">
          {/* ── DASHBOARD ── */}
          {vendorSection === "dashboard" && (
            <div className="mx-auto max-w-7xl space-y-8">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Dashboard
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Welcome back — here's how your store is performing.
                </p>
              </div>

              {/* KPI Cards */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: "Total Orders",
                    value: stats.total_orders.toLocaleString(),
                    icon: <Package className="h-5 w-5" />,
                  },
                  {
                    label: "Total Meals",
                    value: meals.length.toString(),
                    icon: <UtensilsCrossed className="h-5 w-5" />,
                  },
                  {
                    label: "Total Revenue",
                    value: `Rs ${stats.total_revenue.toLocaleString()}`,
                    // icon: <DollarSign className="h-5 w-5" />,
                  },
                  {
                    label: "Customer Rating",
                    value: "4.8 / 5.0",
                    icon: <Star className="h-5 w-5" />,
                  },
                ].map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                          {kpi.label}
                        </p>
                        <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                          {kpi.value}
                        </p>
                      </div>
                      <div className="rounded-xl bg-wellora/15 p-2.5 text-wellora">
                        {kpi.icon}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Actions */}
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Quick actions
                </h2>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setVendorSection("meals")}
                    className="inline-flex items-center gap-2 rounded-xl bg-wellora px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-wellora-hover"
                  >
                    <Plus className="h-4 w-4" /> Add New Meal
                  </button>
                  <button
                    type="button"
                    onClick={() => setVendorSection("meals")}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <UtensilsCrossed className="h-4 w-4" /> Manage Meals
                  </button>
                  <button
                    type="button"
                    onClick={() => setVendorSection("orders")}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <Store className="h-4 w-4" /> View Orders
                  </button>
                </div>
              </div>

              {/* Recent Orders */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                    Recent Orders
                  </h2>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                    Latest activity from your customers
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                        <th className="px-5 py-3 font-semibold">Order ID</th>
                        <th className="px-5 py-3 font-semibold">Customer</th>
                        <th className="px-5 py-3 font-semibold">Meal</th>
                        <th className="px-5 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {recentOrders.map((o) => (
                        <tr
                          key={o.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                        >
                          <td className="px-5 py-3 font-mono text-xs font-medium text-slate-900 dark:text-white">
                            #{o.id}
                          </td>
                          <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                            {o.customer_name}
                          </td>
                          <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                            {o.meal_name}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${orderStatusClass(o.status as OrderStatus)}`}
                            >
                              {o.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Charts */}
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-wellora" />
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                      Top Selling Meals
                    </h2>
                  </div>
                  <ul className="mt-4 space-y-3">
                    {topSelling.length > 0 ? (
                      topSelling.map((item) => (
                        <li
                          key={item.rank}
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50"
                        >
                          <div className="min-w-0">
                            <span className="text-xs font-semibold text-wellora">
                              #{item.rank}
                            </span>
                            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                              {item.mealName}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-xs font-semibold tabular-nums text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                            {item.orders} orders
                          </span>
                        </li>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">
                        No meals yet. Add your first meal!
                      </p>
                    )}
                  </ul>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-wellora" />
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                      Sales Overview
                    </h2>
                  </div>
                  <div className="mt-6 flex h-52 items-end justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-700">
                    {WEEKLY_REVENUE.map((d) => (
                      <div
                        key={d.label}
                        className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
                      >
                        <span className="text-[10px] font-medium tabular-nums text-slate-500">
                          Rs {(d.value / 1000).toFixed(1)}k
                        </span>
                        <div
                          className="w-full max-w-[52px] rounded-t-md bg-gradient-to-t from-wellora to-emerald-400/90 shadow-sm"
                          style={{
                            height: `${Math.max(12, (d.value / chartMax) * 100)}%`,
                          }}
                        />
                        <span className="text-xs text-slate-500">
                          {d.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── MEAL MANAGEMENT ── */}
          {vendorSection === "meals" && <MealManagement onNavigate={onNavigate} />}

          {/* ── ORDERS ── */}
          {vendorSection === "orders" && <VendorOrdersSection />}
          {/* ── MENU PREVIEW ── */}
          {vendorSection === "menu" && (
            <div className="mx-auto max-w-7xl space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Menu
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  How your meals appear to customers
                </p>
              </div>
              {meals.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-slate-500">
                    No meals yet. Add meals in Meal Management!
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {meals.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold leading-snug text-slate-900 dark:text-white">
                          {m.name}
                        </h3>
                        <span className="shrink-0 text-lg font-bold text-wellora">
                          Rs {m.price.toFixed(2)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {m.category} · {m.calories} kcal
                      </p>
                      {m.image_url && (
                        <div className="mt-3 overflow-hidden rounded-xl">
                          <img
                            src={resolveImageUrl(m.image_url) || m.image_url}
                            alt={m.name}
                            className="h-36 w-full object-cover"
                          />
                        </div>
                      )}
                      <span className="mt-3 inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {m.dietary}
                      </span>
                      <p className="mt-3 text-xs">
                        {m.available ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            Available for order
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            Currently unavailable
                          </span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
