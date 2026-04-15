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
  TrendingUp,
  UtensilsCrossed,
} from "lucide-react";
import type { AppPage } from "../types/page";
import { WelloraLogoMark } from "../components/WelloraLogoMark";
import {
  getVendorMeals,
  addMeal,
  updateMeal,
  deleteMealApi,
  getVendorStats,
} from "../api/meals";

interface VendorDashboardPageProps {
  onNavigate: (page: AppPage) => void;
}

type CategoryFilter = string;
type DietaryFilter = string;
type FormCategory = "Breakfast" | "Lunch" | "Dinner";
type FormDietary = "Vegetarian" | "Vegan" | "Gluten-Free" | "Keto" | "Paleo";

interface MealRow {
  id: number;
  name: string;
  category: string;
  calories: number;
  dietary: string;
  price: number;
  available: boolean;
}

interface MealFormState {
  mealName: string;
  category: FormCategory;
  calories: string;
  dietary: FormDietary;
  price: string;
  available: boolean;
  description?: string;
  image_url?: string;
}

interface VendorStats {
  total_meals: number;
  total_orders: number;
  total_revenue: number;
  rating: number;
}

const CATEGORIES: CategoryFilter[] = [
  "All Categories",
  "Breakfast",
  "Lunch",
  "Dinner",
];
const DIETARY: DietaryFilter[] = [
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

const MOCK_ORDERS = [
  {
    id: "ORD-1042",
    customerName: "Alex Morgan",
    mealName: "Grilled Salmon",
    status: "Completed" as const,
  },
  {
    id: "ORD-1041",
    customerName: "Jordan Lee",
    mealName: "Vegan Buddha Bowl",
    status: "Pending" as const,
  },
  {
    id: "ORD-1040",
    customerName: "Sam Rivera",
    mealName: "Chicken Teriyaki",
    status: "Completed" as const,
  },
  {
    id: "ORD-1039",
    customerName: "Casey Kim",
    mealName: "Greek Yogurt Parfait",
    status: "Cancelled" as const,
  },
  {
    id: "ORD-1038",
    customerName: "Riley Chen",
    mealName: "Zucchini Alfredo",
    status: "Completed" as const,
  },
];

type OrderStatus = "Pending" | "Completed" | "Cancelled";
type VendorSection = "dashboard" | "meals" | "orders" | "menu";

function emptyMealForm(): MealFormState {
  return {
    mealName: "",
    category: "Breakfast",
    calories: "",
    dietary: "Vegetarian",
    price: "",
    available: true,
    description: "",
    image_url: "",
  };
}

export function VendorDashboardPage({ onNavigate }: VendorDashboardPageProps) {
  const [vendorSection, setVendorSection] =
    useState<VendorSection>("dashboard");
  const [meals, setMeals] = useState<MealRow[]>([]);
  const [stats, setStats] = useState<VendorStats>({
    total_meals: 0,
    total_orders: 0,
    total_revenue: 0,
    rating: 4.8,
  });
  const [isLoadingMeals, setIsLoadingMeals] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("All Categories");
  const [dietary, setDietary] = useState<DietaryFilter>("All Dietary Types");
  const [page, setPage] = useState(1);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mealFormOpen, setMealFormOpen] = useState(false);
  const [editingMealId, setEditingMealId] = useState<number | null>(null);
  const [mealForm, setMealForm] = useState<MealFormState>(emptyMealForm());
  const [mealNameError, setMealNameError] = useState(false);
  const [caloriesError, setCaloriesError] = useState(false);
  const [priceError, setPriceError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const pageSize = 5;

  // ─── Load meals + stats from backend ───────────
  useEffect(() => {
    loadMeals();
    loadStats();
  }, []);

  const loadMeals = async () => {
    setIsLoadingMeals(true);
    try {
      const data = await getVendorMeals();
      setMeals(data);
    } catch (err) {
      console.error("Failed to load meals:", err);
    } finally {
      setIsLoadingMeals(false);
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

  // ─── Filtering + pagination ─────────────────────
  const filtered = useMemo(
    () =>
      meals.filter((m) => {
        if (search && !m.name.toLowerCase().includes(search.toLowerCase()))
          return false;
        if (category !== "All Categories" && m.category !== category)
          return false;
        if (dietary !== "All Dietary Types" && m.dietary !== dietary)
          return false;
        return true;
      }),
    [meals, search, category, dietary],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const slice = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  // ─── Meal form handlers ─────────────────────────
  const openAddMealForm = () => {
    setEditingMealId(null);
    setMealForm(emptyMealForm());
    setMealNameError(false);
    setCaloriesError(false);
    setPriceError(false);
    setMealFormOpen(true);
  };

  const openEditMealForm = (row: MealRow) => {
    setEditingMealId(row.id);
    setMealForm({
      mealName: row.name,
      category: FORM_CATEGORIES.includes(row.category as FormCategory)
        ? (row.category as FormCategory)
        : "Breakfast",
      calories: String(row.calories),
      dietary: FORM_DIETARY.includes(row.dietary as FormDietary)
        ? (row.dietary as FormDietary)
        : "Vegetarian",
      price: String(row.price),
      available: row.available,
      description: (row as any).description ?? "",
      image_url: (row as any).image_url ?? "",
    });
    setMealNameError(false);
    setCaloriesError(false);
    setPriceError(false);
    setMealFormOpen(true);
  };

  const closeMealForm = () => {
    setMealFormOpen(false);
    setEditingMealId(null);
    setMealForm(emptyMealForm());
  };

  const saveMealForm = async () => {
    // Validate
    const nameTrim = mealForm.mealName.trim();
    const nameInvalid = nameTrim === "";
    const calNum = Number(mealForm.calories);
    const calInvalid =
      !mealForm.calories.trim() || !Number.isFinite(calNum) || calNum <= 0;
    const priceNum = Number(mealForm.price);
    const priceInvalid =
      !mealForm.price.trim() || !Number.isFinite(priceNum) || priceNum < 0;

    setMealNameError(nameInvalid);
    setCaloriesError(calInvalid);
    setPriceError(priceInvalid);

    if (nameInvalid || calInvalid || priceInvalid) return;

    setIsSaving(true);
    try {
      const payload = {
        name: nameTrim,
        category: mealForm.category,
        calories: Math.round(calNum),
        dietary: mealForm.dietary,
        price: Math.round(priceNum * 100) / 100,
        available: mealForm.available,
        description: mealForm.description || null,
        image_url: mealForm.image_url || null,
      };

      if (editingMealId) {
        // ✅ Update existing meal in backend
        const updated = await updateMeal(editingMealId, payload);
        setMeals((prev) =>
          prev.map((m) => (m.id === editingMealId ? updated : m)),
        );
      } else {
        // ✅ Add new meal to backend
        const created = await addMeal(payload);
        setMeals((prev) => [...prev, created]);
      }

      closeMealForm();
      loadStats(); // refresh stats
    } catch (err) {
      console.error("Failed to save meal:", err);
      alert("Failed to save meal. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteMeal = async (id: number) => {
    if (!window.confirm("Delete this meal?")) return;
    try {
      // ✅ Delete from backend
      await deleteMealApi(id);
      setMeals((prev) => prev.filter((m) => m.id !== id));
      loadStats();
    } catch (err) {
      console.error("Failed to delete meal:", err);
      alert("Failed to delete meal. Please try again.");
    }
  };

  const duplicateMeal = async (row: MealRow) => {
    try {
      const created = await addMeal({
        name: `${row.name} (copy)`,
        category: row.category,
        calories: row.calories,
        dietary: row.dietary,
        price: row.price,
        available: row.available,
      });
      setMeals((prev) => [...prev, created]);
      loadStats();
    } catch (err) {
      console.error("Failed to duplicate meal:", err);
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

  const orderStatusClass = (s: OrderStatus) => {
    switch (s) {
      case "Pending":
        return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
      case "Completed":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300";
      case "Cancelled":
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
                    value: `$${stats.total_revenue.toLocaleString()}`,
                    icon: <DollarSign className="h-5 w-5" />,
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
                    onClick={openAddMealForm}
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
                      {MOCK_ORDERS.map((o) => (
                        <tr
                          key={o.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                        >
                          <td className="px-5 py-3 font-mono text-xs font-medium text-slate-900 dark:text-white">
                            {o.id}
                          </td>
                          <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                            {o.customerName}
                          </td>
                          <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                            {o.mealName}
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
                          ${(d.value / 1000).toFixed(1)}k
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
          {vendorSection === "meals" && (
            <>
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Meal Management
                </h1>
                <button
                  type="button"
                  onClick={openAddMealForm}
                  className="inline-flex shrink-0 items-center justify-center rounded-xl bg-wellora px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-wellora-hover"
                >
                  + Add New Meal
                </button>
              </div>

              <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    placeholder="Search meals..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <select
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setPage(1);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-wellora focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <select
                    value={dietary}
                    onChange={(e) => {
                      setDietary(e.target.value);
                      setPage(1);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-wellora focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                  >
                    {DIETARY.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                {isLoadingMeals ? (
                  <div className="flex items-center justify-center py-16">
                    <p className="text-slate-500">Loading meals...</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                          <th className="px-4 py-3 font-semibold">Meal Name</th>
                          <th className="px-4 py-3 font-semibold">Category</th>
                          <th className="px-4 py-3 font-semibold">Calories</th>
                          <th className="px-4 py-3 font-semibold">
                            Dietary Type
                          </th>
                          <th className="px-4 py-3 font-semibold">Price</th>
                          <th className="px-4 py-3 font-semibold">
                            Availability
                          </th>
                          <th className="px-4 py-3 font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                        {slice.length === 0 ? (
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
                          slice.map((row) => (
                            <tr
                              key={row.id}
                              className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                            >
                              <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                                {row.name}
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {row.category}
                              </td>
                              <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-300">
                                {row.calories}
                              </td>
                              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                {row.dietary}
                              </td>
                              <td className="px-4 py-3 font-medium tabular-nums text-slate-900 dark:text-white">
                                ${row.price.toFixed(2)}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${row.available ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}
                                >
                                  {row.available ? "Available" : "Unavailable"}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => duplicateMeal(row)}
                                    className="rounded-lg p-1.5 text-wellora hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                    title="Duplicate"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openEditMealForm(row)}
                                    className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                                    title="Edit"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteMeal(row.id)}
                                    className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                                    title="Delete"
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
                <div className="flex items-center justify-center gap-2 border-t border-slate-200 px-4 py-4 dark:border-slate-700">
                  <button
                    type="button"
                    disabled={pageSafe <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                      (n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setPage(n)}
                          className={`min-w-[2rem] rounded-lg px-2 py-1 text-sm font-medium ${n === pageSafe ? "bg-wellora text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
                        >
                          {n}
                        </button>
                      ),
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={pageSafe >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── ORDERS ── */}
          {vendorSection === "orders" && (
            <div className="mx-auto max-w-7xl space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Orders
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  All customer orders for your kitchen
                </p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
                      {MOCK_ORDERS.map((o) => (
                        <tr
                          key={o.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                        >
                          <td className="px-5 py-3 font-mono text-xs font-medium text-slate-900 dark:text-white">
                            {o.id}
                          </td>
                          <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                            {o.customerName}
                          </td>
                          <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                            {o.mealName}
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${orderStatusClass(o.status)}`}
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
            </div>
          )}

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
                          ${m.price.toFixed(2)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {m.category} · {m.calories} kcal
                      </p>
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

      {/* ── MEAL FORM MODAL ── */}
      {mealFormOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
            onClick={closeMealForm}
          />
          <div className="relative z-10 flex max-h-[min(100dvh,720px)] w-full max-w-lg flex-col rounded-t-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:max-h-[90vh] sm:rounded-2xl">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingMealId ? "Edit meal" : "Add new meal"}
              </h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-5">
                {/* Meal Name */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Meal Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Grilled Chicken Salad"
                    value={mealForm.mealName}
                    onChange={(e) => {
                      setMealForm((f) => ({ ...f, mealName: e.target.value }));
                      setMealNameError(false);
                    }}
                    className={`mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 dark:bg-slate-950 dark:text-white ${mealNameError ? "border-red-500 focus:ring-red-500/20" : "border-slate-200 focus:border-wellora focus:ring-wellora/20 dark:border-slate-600"}`}
                  />
                  {mealNameError && (
                    <p className="mt-1.5 text-sm text-red-600">
                      Meal name is required.
                    </p>
                  )}
                </div>
                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Description (Optional)
                  </label>
                  <textarea
                    placeholder="Brief description of the meal..."
                    value={mealForm.description ?? ""}
                    onChange={(e) =>
                      setMealForm((f) => ({
                        ...f,
                        description: e.target.value,
                      }))
                    }
                    rows={2}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:border-wellora focus:ring-wellora/20 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  />
                </div>

                {/* Image URL */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Image URL (Optional)
                  </label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={mealForm.image_url ?? ""}
                    onChange={(e) =>
                      setMealForm((f) => ({ ...f, image_url: e.target.value }))
                    }
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:border-wellora focus:ring-wellora/20 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Category
                  </label>
                  <select
                    value={mealForm.category}
                    onChange={(e) =>
                      setMealForm((f) => ({
                        ...f,
                        category: e.target.value as FormCategory,
                      }))
                    }
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-wellora focus:outline-none dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  >
                    {FORM_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Calories */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Calories (kcal)
                  </label>
                  <input
                    type="number"
                    min={1}
                    placeholder="e.g., 450"
                    value={mealForm.calories}
                    onChange={(e) => {
                      setMealForm((f) => ({ ...f, calories: e.target.value }));
                      setCaloriesError(false);
                    }}
                    className={`mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 dark:bg-slate-950 dark:text-white ${caloriesError ? "border-red-500 focus:ring-red-500/20" : "border-slate-200 focus:border-wellora focus:ring-wellora/20 dark:border-slate-600"}`}
                  />
                  {caloriesError && (
                    <p className="mt-1.5 text-sm text-red-600">
                      Enter a valid calorie amount.
                    </p>
                  )}
                </div>
                {/* Dietary */}
                <fieldset>
                  <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Dietary Type
                  </legend>
                  <div className="mt-2 space-y-2">
                    {FORM_DIETARY.map((opt) => (
                      <label
                        key={opt}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 has-[:checked]:border-wellora has-[:checked]:bg-emerald-50/80 dark:border-slate-600 dark:text-slate-200 dark:has-[:checked]:bg-emerald-950/30"
                      >
                        <input
                          type="radio"
                          name="dietary-type"
                          value={opt}
                          checked={mealForm.dietary === opt}
                          onChange={() =>
                            setMealForm((f) => ({ ...f, dietary: opt }))
                          }
                          className="h-4 w-4 border-slate-300 text-wellora focus:ring-wellora"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {/* Price */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Price (Rs.)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="e.g., 12.99"
                    value={mealForm.price}
                    onChange={(e) => {
                      setMealForm((f) => ({ ...f, price: e.target.value }));
                      setPriceError(false);
                    }}
                    className={`mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 dark:bg-slate-950 dark:text-white ${priceError ? "border-red-500 focus:ring-red-500/20" : "border-slate-200 focus:border-wellora focus:ring-wellora/20 dark:border-slate-600"}`}
                  />
                  {priceError && (
                    <p className="mt-1.5 text-sm text-red-600">
                      Enter a valid price.
                    </p>
                  )}
                </div>
                {/* Available toggle */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/50">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        Available for Order
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Toggle to make this meal visible to users.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={mealForm.available}
                      onClick={() =>
                        setMealForm((f) => ({ ...f, available: !f.available }))
                      }
                      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-wellora ${mealForm.available ? "bg-wellora" : "bg-slate-300 dark:bg-slate-600"}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-6 w-6 translate-y-0.5 rounded-full bg-white shadow transition ${mealForm.available ? "translate-x-5" : "translate-x-1"}`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={closeMealForm}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveMealForm}
                disabled={isSaving}
                className="rounded-xl bg-wellora px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-wellora-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? "Saving..." : "Save Meal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
