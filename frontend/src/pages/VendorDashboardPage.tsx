import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  LayoutGrid,
  LogOut,
  Package,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Star,
  Store,
  Trash2,
  UtensilsCrossed,
  TrendingUp,
  MessageSquare,
  Upload,
} from "lucide-react";
import type { AppPage } from "../types/page";
import { WelloraLogoMark } from "../components/WelloraLogoMark";
import {
  getVendorMeals,
  addMeal,
  updateMeal,
  deleteMealApi,
  getVendorStats,
  getVendorRatings,
  VendorMeal,
  VendorStats,
  VendorRatings,
} from "../api/meals";
import { getVendorOrders, updateOrderStatus, VendorOrder } from "../api/orders";

interface VendorDashboardPageProps {
  onNavigate: (page: AppPage) => void;
}

type VendorSection = "dashboard" | "meals" | "orders" | "ratings";

type FormCategory = "Breakfast" | "Lunch" | "Dinner";
type FormDietary = "Vegetarian" | "Vegan" | "Gluten-Free" | "Keto" | "Paleo";

const CATEGORIES = ["All Categories", "Breakfast", "Lunch", "Dinner"];
const DIETARY_LIST = [
  "All Dietary Types",
  "Vegetarian",
  "Vegan",
  "Gluten-Free",
  "Keto",
  "Paleo",
];
const FORM_CATEGORIES: FormCategory[] = ["Breakfast", "Lunch", "Dinner"];
const FORM_DIETARY: FormDietary[] = [
  "Vegetarian",
  "Vegan",
  "Gluten-Free",
  "Keto",
  "Paleo",
];
const PAGE_SIZE = 6;

const STATUS_COLORS: Record<string, string> = {
  pending:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  delivered:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200",
};

const NEXT_STATUS: Record<string, string> = {
  pending: "confirmed",
  confirmed: "delivered",
};
const NEXT_STATUS_LABEL: Record<string, string> = {
  pending: "Confirm",
  confirmed: "Deliver",
};

interface MealForm {
  name: string;
  category: FormCategory;
  calories: string;
  dietary: FormDietary;
  price: string;
  available: boolean;
  description: string;
  image_url: string;
}

function emptyForm(): MealForm {
  return {
    name: "",
    category: "Breakfast",
    calories: "",
    dietary: "Vegetarian",
    price: "",
    available: true,
    description: "",
    image_url: "",
  };
}

function StarDisplay({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "text-slate-300"}`}
        />
      ))}
    </div>
  );
}

export function VendorDashboardPage({ onNavigate }: VendorDashboardPageProps) {
  const [section, setSection] = useState<VendorSection>("dashboard");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [meals, setMeals] = useState<VendorMeal[]>([]);
  const [stats, setStats] = useState<VendorStats | null>(null);
  const [orders, setOrders] = useState<VendorOrder[]>([]);
  const [ratings, setRatings] = useState<VendorRatings | null>(null);
  const [loadingMeals, setLoadingMeals] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingRatings, setLoadingRatings] = useState(false);
  const [updatingOrder, setUpdatingOrder] = useState<number | null>(null);

  // Meal management
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("All Categories");
  const [dietFilter, setDietFilter] = useState("All Dietary Types");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<MealForm>(emptyForm());
  const [isSaving, setIsSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<Partial<MealForm>>({});

  // Orders
  const [orderFilter, setOrderFilter] = useState("all");

  // Profile menu
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // ─── Load data ────────────────────────────────
  useEffect(() => {
    loadMeals();
    loadStats();
  }, []);

  useEffect(() => {
    if (section === "orders") loadOrders();
    if (section === "ratings") loadRatings();
  }, [section, orderFilter]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node))
        setProfileOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadMeals = async () => {
    setLoadingMeals(true);
    try {
      setMeals(await getVendorMeals());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMeals(false);
    }
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      setStats(await getVendorStats());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      const s = orderFilter === "all" ? undefined : orderFilter;
      setOrders(await getVendorOrders(s));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadRatings = async () => {
    setLoadingRatings(true);
    try {
      setRatings(await getVendorRatings());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRatings(false);
    }
  };

  // ─── Meal filtering ───────────────────────────
  const filtered = useMemo(
    () =>
      meals.filter((m) => {
        if (search && !m.name.toLowerCase().includes(search.toLowerCase()))
          return false;
        if (catFilter !== "All Categories" && m.category !== catFilter)
          return false;
        if (dietFilter !== "All Dietary Types" && m.dietary !== dietFilter)
          return false;
        return true;
      }),
    [meals, search, catFilter, dietFilter],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  // ─── Form helpers ─────────────────────────────
  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormErrors({});
    setImageFile(null);
    setImagePreview("");
    setModalOpen(true);
  };
  const openEdit = (m: VendorMeal) => {
    setEditingId(m.id);
    setForm({
      name: m.name,
      category: (m.category as FormCategory) || "Breakfast",
      calories: String(m.calories),
      dietary: (m.dietary as FormDietary) || "Vegetarian",
      price: String(m.price),
      available: m.available,
      description: m.description || "",
      image_url: m.image_url || "",
    });
    setFormErrors({});
    setImageFile(null);
    setImagePreview(m.image_url || ""); // show existing image
    setModalOpen(true);
  };
  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    setImageFile(null);
    setImagePreview("");
  };
  const validate = (): boolean => {
    const errs: Partial<MealForm> = {};
    if (!form.name.trim()) errs.name = "Required";
    if (
      !form.calories ||
      isNaN(Number(form.calories)) ||
      Number(form.calories) <= 0
    )
      errs.calories = "Enter valid calories";
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) < 0)
      errs.price = "Enter valid price";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const saveMeal = async () => {
    if (!validate()) return;
    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        calories: Number(form.calories),
        dietary: form.dietary,
        price: Number(form.price),
        available: form.available,
        description: form.description,
      };
      if (editingId) {
        const updated = await updateMeal(editingId, payload, imageFile);
        setMeals((prev) => prev.map((m) => (m.id === editingId ? updated : m)));
      } else {
        const created = await addMeal(payload, imageFile);
        setMeals((prev) => [...prev, created]);
      }
      closeModal();
      loadStats();
    } catch (e) {
      console.error(e);
      alert("Failed to save meal.");
    } finally {
      setIsSaving(false);
    }
  };
  const deleteMeal = async (id: number) => {
    if (!confirm("Delete this meal?")) return;
    try {
      await deleteMealApi(id);
      setMeals((prev) => prev.filter((m) => m.id !== id));
      loadStats();
    } catch {
      alert("Failed to delete meal.");
    }
  };

  const handleOrderStatus = async (orderId: number, newStatus: string) => {
    setUpdatingOrder(orderId);
    try {
      await updateOrderStatus(orderId, newStatus);
      await loadOrders();
      await loadStats();
    } catch {
      alert("Failed to update order.");
    } finally {
      setUpdatingOrder(null);
    }
  };

  // ─── Chart max ────────────────────────────────
  const chartMax = stats
    ? Math.max(...stats.weekly_revenue.map((d) => d.revenue), 1)
    : 1;

  // ─── Sidebar nav class ────────────────────────
  const navCls = (s: VendorSection) =>
    s === section
      ? "flex w-full items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5 text-left text-sm font-semibold text-slate-900 dark:bg-slate-800 dark:text-white"
      : "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800";

  return (
    <div className="flex min-h-dvh bg-slate-100 dark:bg-slate-950">
      {/* ── Sidebar ── */}
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
            onClick={() => setSection("dashboard")}
            className={navCls("dashboard")}
          >
            <LayoutGrid className="h-4 w-4 shrink-0" /> Dashboard
          </button>
          <button
            type="button"
            onClick={() => setSection("meals")}
            className={navCls("meals")}
          >
            <UtensilsCrossed className="h-4 w-4 shrink-0" /> Meal Management
          </button>
          <button
            type="button"
            onClick={() => setSection("orders")}
            className={navCls("orders")}
          >
            <Store className="h-4 w-4 shrink-0" /> Orders
          </button>
          <button
            type="button"
            onClick={() => setSection("ratings")}
            className={navCls("ratings")}
          >
            <Star className="h-4 w-4 shrink-0" /> Ratings & Reviews
          </button>
        </nav>
        <button
          type="button"
          onClick={() => {
            localStorage.clear();
            onNavigate("login");
          }}
          className="mt-auto flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          <LogOut className="h-4 w-4 shrink-0" /> Log Out
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ── Header ── */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <WelloraLogoMark size="sm" />
            <span className="font-semibold text-wellora">Wellora Vendor</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400"
            >
              <Bell className="h-5 w-5" />
            </button>
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((o) => !o)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-wellora text-sm font-bold text-white ring-2 ring-slate-200 dark:ring-slate-700"
              >
                V
              </button>
              {profileOpen && (
                <div className="absolute right-0 z-10 mt-2 w-40 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.clear();
                      onNavigate("login");
                    }}
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
          {/* ══ DASHBOARD ══ */}
          {section === "dashboard" && (
            <div className="mx-auto max-w-7xl space-y-8">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  Dashboard
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Welcome back — here's your store performance.
                </p>
              </div>

              {/* KPI Cards */}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: "Total Orders",
                    value: stats?.total_orders ?? "—",
                    icon: <Package className="h-5 w-5" />,
                    color: "text-slate-900 dark:text-white",
                  },
                  {
                    label: "Total Meals",
                    value: stats?.total_meals ?? "—",
                    icon: <UtensilsCrossed className="h-5 w-5" />,
                    color: "text-slate-900 dark:text-white",
                  },
                  {
                    label: "Total Revenue",
                    value: stats ? `$${stats.total_revenue.toFixed(2)}` : "—",
                    icon: <DollarSign className="h-5 w-5" />,
                    color: "text-wellora",
                  },
                  {
                    label: "Avg Rating",
                    value: stats ? `${stats.avg_rating} / 5.0` : "—",
                    icon: <Star className="h-5 w-5" />,
                    color: "text-amber-500",
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
                        <p
                          className={`mt-2 text-2xl font-bold tabular-nums ${kpi.color}`}
                        >
                          {kpi.value}
                        </p>
                      </div>
                      <div className="rounded-xl bg-wellora/10 p-2.5 text-wellora">
                        {kpi.icon}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick actions */}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={openAdd}
                  className="inline-flex items-center gap-2 rounded-xl bg-wellora px-4 py-2.5 text-sm font-semibold text-white hover:bg-wellora-hover"
                >
                  <Plus className="h-4 w-4" /> Add New Meal
                </button>
                <button
                  type="button"
                  onClick={() => setSection("orders")}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Store className="h-4 w-4" /> View Orders
                </button>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                {/* Top Selling Meals */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="h-5 w-5 text-wellora" />
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                      Top Selling Meals
                    </h2>
                  </div>
                  {loadingStats ? (
                    <p className="text-sm text-slate-500">Loading...</p>
                  ) : !stats?.top_meals?.length ? (
                    <p className="text-sm text-slate-500">No orders yet.</p>
                  ) : (
                    <ul className="space-y-3">
                      {stats.top_meals.map((m, i) => (
                        <li
                          key={m.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-bold text-wellora">
                              #{i + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                                {m.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {m.category}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                              {m.total_sold} sold
                            </p>
                            <p className="text-xs text-wellora font-bold">
                              ${m.revenue.toFixed(0)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Sales Overview Chart */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-wellora" />
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                        Sales Overview
                      </h2>
                    </div>
                    <span className="text-xs text-slate-500">Last 7 days</span>
                  </div>
                  {loadingStats ? (
                    <p className="text-sm text-slate-500">Loading...</p>
                  ) : (
                    <>
                      <div className="flex h-52 items-end justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-700">
                        {(stats?.weekly_revenue ?? []).map((d) => (
                          <div
                            key={d.label}
                            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
                          >
                            <span className="text-[10px] font-medium tabular-nums text-slate-500">
                              {d.revenue > 0 ? `$${d.revenue.toFixed(0)}` : ""}
                            </span>
                            <div
                              className="w-full max-w-[48px] rounded-t-md bg-gradient-to-t from-wellora to-emerald-400/80 transition-all"
                              style={{
                                height: `${Math.max(4, (d.revenue / chartMax) * 100)}%`,
                              }}
                            />
                            <span className="text-xs text-slate-500">
                              {d.label}
                            </span>
                          </div>
                        ))}
                      </div>
                      {/* Weekly table */}
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-700">
                              <th className="pb-2 font-semibold text-slate-500">
                                Day
                              </th>
                              <th className="pb-2 font-semibold text-slate-500">
                                Orders
                              </th>
                              <th className="pb-2 font-semibold text-slate-500">
                                Revenue
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                            {(stats?.weekly_revenue ?? []).map((d) => (
                              <tr key={d.label}>
                                <td className="py-1.5 font-medium text-slate-700 dark:text-slate-300">
                                  {d.label}
                                </td>
                                <td className="py-1.5 text-slate-600 dark:text-slate-400">
                                  {d.orders}
                                </td>
                                <td className="py-1.5 font-semibold text-wellora">
                                  ${d.revenue.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══ MEAL MANAGEMENT ══ */}
          {section === "meals" && (
            <div className="mx-auto max-w-7xl space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  Meal Management
                </h1>
                <button
                  type="button"
                  onClick={openAdd}
                  className="inline-flex items-center gap-2 rounded-xl bg-wellora px-4 py-2.5 text-sm font-semibold text-white hover:bg-wellora-hover"
                >
                  <Plus className="h-4 w-4" /> Add New Meal
                </button>
              </div>

              {/* Filters */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    placeholder="Search meals..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-wellora focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex gap-3">
                  <select
                    value={catFilter}
                    onChange={(e) => {
                      setCatFilter(e.target.value);
                      setPage(1);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <select
                    value={dietFilter}
                    onChange={(e) => {
                      setDietFilter(e.target.value);
                      setPage(1);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    {DIETARY_LIST.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Meals Table */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                {loadingMeals ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-wellora border-t-transparent" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[800px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80">
                          {[
                            "Meal Name",
                            "Category",
                            "Calories",
                            "Dietary",
                            "Price",
                            "Status",
                            "Actions",
                          ].map((h) => (
                            <th
                              key={h}
                              className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {pageSlice.length === 0 ? (
                          <tr>
                            <td
                              colSpan={7}
                              className="px-4 py-12 text-center text-slate-500"
                            >
                              No meals found. Click "Add New Meal" to get
                              started!
                            </td>
                          </tr>
                        ) : (
                          pageSlice.map((m) => (
                            <tr
                              key={m.id}
                              className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  {m.image_url && (
                                    <img
                                      src={m.image_url}
                                      alt=""
                                      className="h-9 w-9 rounded-lg object-cover shrink-0"
                                    />
                                  )}
                                  <span className="font-medium text-slate-900 dark:text-white">
                                    {m.name}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {m.category}
                              </td>
                              <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-300">
                                {m.calories}
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {m.dietary}
                              </td>
                              <td className="px-4 py-3 font-semibold tabular-nums text-slate-900 dark:text-white">
                                ${m.price.toFixed(2)}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                    m.available
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                      : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                                  }`}
                                >
                                  {m.available ? "Available" : "Unavailable"}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openEdit(m)}
                                    className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteMeal(m.id)}
                                    className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
                {/* Pagination */}
                <div className="flex items-center justify-center gap-2 border-t border-slate-200 px-4 py-4 dark:border-slate-700">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <ChevronLeft className="h-4 w-4" /> Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPage(n)}
                        className={`min-w-[2rem] rounded-lg px-2 py-1 text-sm font-medium ${
                          n === safePage
                            ? "bg-wellora text-white"
                            : "text-slate-600 hover:bg-slate-100 dark:text-slate-300"
                        }`}
                      >
                        {n}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ══ ORDERS ══ */}
          {section === "orders" && (
            <div className="mx-auto max-w-7xl space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  Orders
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Manage all customer orders
                </p>
              </div>

              {/* Order stats */}
              {stats && (
                <div className="grid gap-4 sm:grid-cols-4">
                  {[
                    {
                      label: "Total",
                      value: stats.total_orders,
                      color: "text-slate-900 dark:text-white",
                    },
                    {
                      label: "Revenue",
                      value: `$${stats.total_revenue.toFixed(2)}`,
                      color: "text-wellora",
                    },
                    {
                      label: "Pending",
                      value: orders.filter((o) => o.status === "pending")
                        .length,
                      color: "text-amber-600",
                    },
                    {
                      label: "Delivered",
                      value: orders.filter((o) => o.status === "delivered")
                        .length,
                      color: "text-emerald-600",
                    },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                    >
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                        {s.label}
                      </p>
                      <p
                        className={`mt-2 text-2xl font-bold tabular-nums ${s.color}`}
                      >
                        {s.value}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Status filter */}
              <div className="flex flex-wrap gap-2">
                {["all", "pending", "confirmed", "delivered", "cancelled"].map(
                  (s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setOrderFilter(s)}
                      className={`rounded-full px-4 py-2 text-sm font-medium capitalize transition ${
                        orderFilter === s
                          ? "bg-wellora text-white shadow-sm"
                          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700"
                      }`}
                    >
                      {s === "all" ? "All Orders" : s}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  onClick={loadOrders}
                  className="ml-auto rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                >
                  ↻ Refresh
                </button>
              </div>

              {/* Orders table */}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                {loadingOrders ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-wellora border-t-transparent" />
                  </div>
                ) : orders.length === 0 ? (
                  <div className="py-16 text-center">
                    <ShoppingCart className="mx-auto h-10 w-10 text-slate-300" />
                    <p className="mt-3 text-slate-500">No orders found.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80">
                          {[
                            "Order ID",
                            "Meal",
                            "Customer",
                            "Qty",
                            "Total",
                            "Status",
                            "Date",
                            "Action",
                          ].map((h) => (
                            <th
                              key={h}
                              className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                            >
                              {h}
                            </th>
                          ))}
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
                              <div className="flex items-center gap-2">
                                {order.meal_image && (
                                  <img
                                    src={order.meal_image}
                                    alt=""
                                    className="h-8 w-8 rounded-lg object-cover shrink-0"
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
                              ${order.total_price.toFixed(2)}
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[order.status] ?? ""}`}
                              >
                                {order.status}
                              </span>
                            </td>
                            <td className="px-5 py-3 text-xs text-slate-500">
                              {new Date(order.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-5 py-3">
                              {NEXT_STATUS[order.status] ? (
                                <button
                                  type="button"
                                  disabled={updatingOrder === order.id}
                                  onClick={() =>
                                    handleOrderStatus(
                                      order.id,
                                      NEXT_STATUS[order.status],
                                    )
                                  }
                                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${
                                    order.status === "pending"
                                      ? "bg-blue-500 hover:bg-blue-600"
                                      : "bg-emerald-500 hover:bg-emerald-600"
                                  }`}
                                >
                                  {updatingOrder === order.id
                                    ? "..."
                                    : NEXT_STATUS_LABEL[order.status]}
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">
                                  —
                                </span>
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
          )}

          {/* ══ RATINGS ══ */}
          {section === "ratings" && (
            <div className="mx-auto max-w-7xl space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                  Ratings & Reviews
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Customer feedback on your meals
                </p>
              </div>

              {/* Rating overview */}
              {ratings && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:col-span-1">
                    <p className="text-sm font-medium text-slate-500">
                      Overall Rating
                    </p>
                    <p className="mt-2 text-5xl font-bold text-slate-900 dark:text-white">
                      {ratings.avg_rating}
                    </p>
                    <StarDisplay value={ratings.avg_rating} />
                    <p className="mt-2 text-sm text-slate-500">
                      {ratings.total} reviews
                    </p>
                  </div>
                  {/* Rating distribution */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:col-span-2">
                    <p className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Rating Distribution
                    </p>
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = ratings.ratings.filter(
                        (r) => r.rating === star,
                      ).length;
                      const pct = ratings.total
                        ? Math.round((count / ratings.total) * 100)
                        : 0;
                      return (
                        <div
                          key={star}
                          className="mb-2 flex items-center gap-3"
                        >
                          <span className="w-4 shrink-0 text-xs font-medium text-slate-600 dark:text-slate-400">
                            {star}
                          </span>
                          <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                          <div
                            className="flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                            style={{ height: 8 }}
                          >
                            <div
                              className="h-full rounded-full bg-amber-400 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="w-8 shrink-0 text-right text-xs text-slate-500">
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Reviews list */}
              {loadingRatings ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-wellora border-t-transparent" />
                </div>
              ) : !ratings?.ratings?.length ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
                  <MessageSquare className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-3 text-slate-500">
                    No reviews yet. Reviews appear after orders are delivered
                    and rated.
                  </p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/80">
                        {["Customer", "Meal", "Rating", "Review", "Date"].map(
                          (h) => (
                            <th
                              key={h}
                              className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {ratings.ratings.map((r) => (
                        <tr
                          key={r.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                        >
                          <td className="px-5 py-3 font-medium text-slate-900 dark:text-white">
                            {r.customer_name}
                          </td>
                          <td className="px-5 py-3 text-slate-600 dark:text-slate-300">
                            {r.meal_name}
                          </td>
                          <td className="px-5 py-3">
                            <StarDisplay value={r.rating} />
                          </td>
                          <td className="px-5 py-3 max-w-xs">
                            <p className="truncate text-slate-600 dark:text-slate-400">
                              {r.review || "—"}
                            </p>
                          </td>
                          <td className="px-5 py-3 text-xs text-slate-500">
                            {new Date(r.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ══ MEAL FORM MODAL ══ */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
            onClick={closeModal}
          />
          <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:rounded-2xl">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingId ? "Edit Meal" : "Add New Meal"}
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Meal Name *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className={`mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 dark:bg-slate-950 dark:text-white ${formErrors.name ? "border-red-500 focus:ring-red-500/20" : "border-slate-200 focus:border-wellora focus:ring-wellora/20 dark:border-slate-600"}`}
                  placeholder="e.g., Grilled Chicken Salad"
                />
                {formErrors.name && (
                  <p className="mt-1 text-xs text-red-500">{formErrors.name}</p>
                )}
              </div>
              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Description
                </label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  placeholder="Brief description..."
                />
              </div>
              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Category
                </label>
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      category: e.target.value as FormCategory,
                    }))
                  }
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                >
                  {FORM_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
              {/* Calories + Price */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Calories (kcal) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={form.calories}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, calories: e.target.value }))
                    }
                    className={`mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none dark:bg-slate-950 dark:text-white ${formErrors.calories ? "border-red-500" : "border-slate-200 focus:border-wellora dark:border-slate-600"}`}
                    placeholder="450"
                  />
                  {formErrors.calories && (
                    <p className="mt-1 text-xs text-red-500">
                      {formErrors.calories}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Price ($) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.price}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, price: e.target.value }))
                    }
                    className={`mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none dark:bg-slate-950 dark:text-white ${formErrors.price ? "border-red-500" : "border-slate-200 focus:border-wellora dark:border-slate-600"}`}
                    placeholder="12.99"
                  />
                  {formErrors.price && (
                    <p className="mt-1 text-xs text-red-500">
                      {formErrors.price}
                    </p>
                  )}
                </div>
              </div>
              {/* Dietary */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Dietary Type
                </label>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {FORM_DIETARY.map((d) => (
                    <label
                      key={d}
                      className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${form.dietary === d ? "border-wellora bg-wellora/5 font-medium text-wellora" : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"}`}
                    >
                      <input
                        type="radio"
                        name="dietary"
                        value={d}
                        checked={form.dietary === d}
                        onChange={() => setForm((f) => ({ ...f, dietary: d }))}
                        className="h-3.5 w-3.5 accent-wellora"
                      />
                      {d}
                    </label>
                  ))}
                </div>
              </div>
              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Meal Image
                </label>

                {/* Preview */}
                {imagePreview && (
                  <div className="relative mt-2 inline-block">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="h-32 w-48 rounded-xl object-cover border border-slate-200 dark:border-slate-600"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setImageFile(null);
                        setImagePreview("");
                      }}
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                )}

                {/* Upload button */}
                <label
                  className={`mt-2 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
                    imagePreview
                      ? "border-slate-200 dark:border-slate-700"
                      : "border-wellora/40 bg-wellora/5"
                  }`}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-wellora/10 text-wellora">
                    <Upload className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      {imagePreview ? "Replace image" : "Upload meal image"}
                    </p>
                    <p className="text-xs text-slate-500">
                      JPEG, PNG or WebP · Max 5MB
                    </p>
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) {
                        alert("Image must be under 5MB");
                        return;
                      }
                      setImageFile(file);
                      setImagePreview(URL.createObjectURL(file));
                    }}
                  />
                </label>
              </div>
              {/* Available toggle */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/50">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    Available for Order
                  </p>
                  <p className="text-xs text-slate-500">
                    Toggle to show/hide from customers
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.available}
                  onClick={() =>
                    setForm((f) => ({ ...f, available: !f.available }))
                  }
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors ${form.available ? "bg-wellora" : "bg-slate-300 dark:bg-slate-600"}`}
                >
                  <span
                    className={`inline-block h-6 w-6 translate-y-0.5 rounded-full bg-white shadow transition ${form.available ? "translate-x-5" : "translate-x-1"}`}
                  />
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveMeal}
                disabled={isSaving}
                className="rounded-xl bg-wellora px-4 py-2.5 text-sm font-semibold text-white hover:bg-wellora-hover disabled:opacity-50"
              >
                {isSaving
                  ? "Saving..."
                  : editingId
                    ? "Update Meal"
                    : "Add Meal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
