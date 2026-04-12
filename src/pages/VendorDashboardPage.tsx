import { useEffect, useMemo, useRef, useState } from 'react';
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
} from 'lucide-react';
import type { AppPage } from '../types/page';
import { WelloraLogoMark } from '../components/WelloraLogoMark';

interface VendorDashboardPageProps {
  onNavigate: (page: AppPage) => void;
}

type CategoryFilter = string;
type DietaryFilter = string;

type FormCategory = 'Breakfast' | 'Lunch' | 'Dinner';
type FormDietary = 'Vegetarian' | 'Vegan' | 'Gluten-Free' | 'Keto' | 'Paleo';

interface MealRow {
  id: string;
  name: string;
  category: string;
  calories: number;
  dietary: string;
  price: number;
  available: boolean;
}

const INITIAL_MEALS: MealRow[] = [
  {
    id: '1',
    name: 'Grilled Salmon with Asparagus',
    category: 'Dinner',
    calories: 450,
    dietary: 'Gluten-Free',
    price: 18.99,
    available: true,
  },
  {
    id: '2',
    name: 'Vegan Buddha Bowl',
    category: 'Lunch',
    calories: 380,
    dietary: 'Vegan',
    price: 14.5,
    available: true,
  },
  {
    id: '3',
    name: 'Chicken Teriyaki Bowl',
    category: 'Lunch',
    calories: 520,
    dietary: 'Keto',
    price: 16.25,
    available: false,
  },
  {
    id: '4',
    name: 'Greek Yogurt Parfait',
    category: 'Breakfast',
    calories: 290,
    dietary: 'Vegetarian',
    price: 8.99,
    available: true,
  },
  {
    id: '5',
    name: 'Zucchini Noodle Alfredo',
    category: 'Dinner',
    calories: 410,
    dietary: 'Paleo',
    price: 15.0,
    available: true,
  },
];

const CATEGORIES: CategoryFilter[] = ['All Categories', 'Breakfast', 'Lunch', 'Dinner'];
const DIETARY: DietaryFilter[] = [
  'All Dietary Types',
  'Vegetarian',
  'Vegan',
  'Gluten-Free',
  'Keto',
  'Paleo',
];

const FORM_CATEGORIES: FormCategory[] = ['Breakfast', 'Lunch', 'Dinner'];
const FORM_DIETARY: FormDietary[] = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Keto', 'Paleo'];

const PROFILE_IMG =
  'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=120&h=120&q=80';

function normalizeDietaryForForm(d: string): FormDietary {
  return FORM_DIETARY.includes(d as FormDietary) ? (d as FormDietary) : 'Vegetarian';
}

function normalizeCategoryForForm(c: string): FormCategory {
  return FORM_CATEGORIES.includes(c as FormCategory) ? (c as FormCategory) : 'Breakfast';
}

interface MealFormState {
  mealName: string;
  category: FormCategory;
  calories: string;
  dietary: FormDietary;
  price: string;
  available: boolean;
}

function emptyMealForm(): MealFormState {
  return {
    mealName: '',
    category: 'Breakfast',
    calories: '',
    dietary: 'Vegetarian',
    price: '',
    available: true,
  };
}

type VendorSection = 'dashboard' | 'meals' | 'orders' | 'menu';

type OrderStatus = 'Pending' | 'Completed' | 'Cancelled';

interface VendorOrder {
  id: string;
  customerName: string;
  mealName: string;
  status: OrderStatus;
}

const MOCK_ORDERS: VendorOrder[] = [
  { id: 'ORD-1042', customerName: 'Alex Morgan', mealName: 'Grilled Salmon with Asparagus', status: 'Completed' },
  { id: 'ORD-1041', customerName: 'Jordan Lee', mealName: 'Vegan Buddha Bowl', status: 'Pending' },
  { id: 'ORD-1040', customerName: 'Sam Rivera', mealName: 'Chicken Teriyaki Bowl', status: 'Completed' },
  { id: 'ORD-1039', customerName: 'Casey Kim', mealName: 'Greek Yogurt Parfait', status: 'Cancelled' },
  { id: 'ORD-1038', customerName: 'Riley Chen', mealName: 'Zucchini Noodle Alfredo', status: 'Completed' },
  { id: 'ORD-1037', customerName: 'Taylor Brooks', mealName: 'Grilled Salmon with Asparagus', status: 'Pending' },
];

const KPI_TOTAL_ORDERS = 1847;
const KPI_BASE_REVENUE = 42890;

const WEEKLY_REVENUE = [
  { label: 'Mon', value: 3200 },
  { label: 'Tue', value: 4100 },
  { label: 'Wed', value: 3800 },
  { label: 'Thu', value: 5200 },
  { label: 'Fri', value: 6100 },
  { label: 'Sat', value: 4800 },
  { label: 'Sun', value: 3900 },
];

export function VendorDashboardPage({ onNavigate }: VendorDashboardPageProps) {
  const [vendorSection, setVendorSection] = useState<VendorSection>('dashboard');
  const [meals, setMeals] = useState<MealRow[]>(() => [...INITIAL_MEALS]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('All Categories');
  const [dietary, setDietary] = useState<DietaryFilter>('All Dietary Types');
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const [mealFormOpen, setMealFormOpen] = useState(false);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [mealForm, setMealForm] = useState<MealFormState>(emptyMealForm);
  const [mealNameError, setMealNameError] = useState(false);
  const [caloriesError, setCaloriesError] = useState(false);
  const [priceError, setPriceError] = useState(false);

  const filtered = useMemo(() => {
    return meals.filter((m) => {
      if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (category !== 'All Categories' && m.category !== category) return false;
      if (dietary !== 'All Dietary Types' && m.dietary !== dietary) return false;
      return true;
    });
  }, [meals, search, category, dietary]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

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
      category: normalizeCategoryForForm(row.category),
      calories: String(row.calories),
      dietary: normalizeDietaryForForm(row.dietary),
      price: String(row.price),
      available: row.available,
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
    setMealNameError(false);
    setCaloriesError(false);
    setPriceError(false);
  };

  const isMealNameUnique = (name: string, excludeId: string | null) => {
    const n = name.trim().toLowerCase();
    return !meals.some((m) => m.id !== excludeId && m.name.trim().toLowerCase() === n);
  };

  const saveMealForm = () => {
    const nameTrim = mealForm.mealName.trim();
    const nameInvalid = nameTrim === '' || !isMealNameUnique(nameTrim, editingMealId);
    setMealNameError(nameInvalid);

    const calNum = Number(mealForm.calories);
    const calInvalid = mealForm.calories.trim() === '' || !Number.isFinite(calNum) || calNum <= 0;
    setCaloriesError(calInvalid);

    const priceNum = Number(mealForm.price);
    const priceInvalid = mealForm.price.trim() === '' || !Number.isFinite(priceNum) || priceNum < 0;
    setPriceError(priceInvalid);

    if (nameInvalid || calInvalid || priceInvalid) return;

    const row: MealRow = {
      id: editingMealId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: nameTrim,
      category: mealForm.category,
      calories: Math.round(calNum),
      dietary: mealForm.dietary,
      price: Math.round(priceNum * 100) / 100,
      available: mealForm.available,
    };

    if (editingMealId) {
      setMeals((prev) => prev.map((m) => (m.id === editingMealId ? row : m)));
    } else {
      setMeals((prev) => [...prev, row]);
    }
    closeMealForm();
  };

  const duplicateMeal = (row: MealRow) => {
    const copy: MealRow = {
      ...row,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: `${row.name} (copy)`,
    };
    setMeals((prev) => [...prev, copy]);
  };

  const deleteMeal = (id: string) => {
    if (!window.confirm('Delete this meal?')) return;
    setMeals((prev) => prev.filter((m) => m.id !== id));
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const pageSafe = Math.min(page, totalPages);
  const slice = filtered.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  const dashboardRevenue = useMemo(() => KPI_BASE_REVENUE + meals.length * 42, [meals.length]);
  const chartMax = Math.max(...WEEKLY_REVENUE.map((d) => d.value));

  const topSelling = [
    { rank: 1, mealName: 'Grilled Salmon with Asparagus', orders: 142 },
    { rank: 2, mealName: 'Vegan Buddha Bowl', orders: 118 },
    { rank: 3, mealName: 'Chicken Teriyaki Bowl', orders: 96 },
  ];

  const orderStatusClass = (s: OrderStatus) => {
    switch (s) {
      case 'Pending':
        return 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200';
      case 'Completed':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300';
      case 'Cancelled':
        return 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300';
      default:
        return 'bg-slate-200 text-slate-700';
    }
  };

  const navItemClass = (active: boolean) =>
    active
      ? 'flex w-full items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5 text-left text-sm font-semibold text-slate-900 dark:bg-slate-800 dark:text-white'
      : 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800';

  return (
    <div className="flex min-h-dvh bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-8 flex items-center gap-2 px-1">
          <WelloraLogoMark size="md" />
          <span className="text-lg font-semibold tracking-tight text-wellora">Wellora</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          <button
            type="button"
            onClick={() => setVendorSection('dashboard')}
            className={navItemClass(vendorSection === 'dashboard')}
          >
            <LayoutGrid className="h-4 w-4 shrink-0" />
            Dashboard
          </button>
          <button
            type="button"
            onClick={() => setVendorSection('meals')}
            className={navItemClass(vendorSection === 'meals')}
          >
            <UtensilsCrossed className="h-4 w-4 shrink-0" />
            Meal Management
          </button>
          <button
            type="button"
            onClick={() => setVendorSection('orders')}
            className={navItemClass(vendorSection === 'orders')}
          >
            <Store className="h-4 w-4 shrink-0" />
            Orders
          </button>
          <button
            type="button"
            onClick={() => setVendorSection('menu')}
            className={navItemClass(vendorSection === 'menu')}
          >
            <ShoppingCart className="h-4 w-4 shrink-0" />
            Menu
          </button>
        </nav>
        <button
          type="button"
          onClick={() => onNavigate('login')}
          className="mt-auto flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Log Out
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <WelloraLogoMark size="sm" />
            <span className="font-semibold text-wellora">Wellora</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-full p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
            </button>
            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setProfileMenuOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
                className="rounded-full ring-2 ring-slate-200 transition hover:bg-slate-100 dark:ring-slate-700 dark:hover:bg-slate-800"
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
                    onClick={() => {
                      setProfileMenuOpen(false);
                      onNavigate('login');
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <LogOut className="h-4 w-4 shrink-0 text-red-600" />
                    Log Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-auto p-6">
          {vendorSection === 'dashboard' && (
            <div className="mx-auto max-w-7xl space-y-8">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Dashboard</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Welcome back — here&apos;s how your store is performing.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Orders</p>
                      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {KPI_TOTAL_ORDERS.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-xl bg-wellora/15 p-2.5 text-wellora">
                      <Package className="h-5 w-5" />
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Meals</p>
                      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{meals.length}</p>
                    </div>
                    <div className="rounded-xl bg-wellora/15 p-2.5 text-wellora">
                      <UtensilsCrossed className="h-5 w-5" />
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Revenue</p>
                      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                        ${dashboardRevenue.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-xl bg-wellora/15 p-2.5 text-wellora">
                      <DollarSign className="h-5 w-5" />
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Customer Ratings</p>
                      <div className="mt-2 flex items-baseline gap-2">
                        <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">4.8</p>
                        <span className="text-sm text-slate-500 dark:text-slate-400">/ 5.0</span>
                      </div>
                      <div className="mt-2 flex gap-0.5">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 fill-amber-400 text-amber-400 ${i === 4 ? 'opacity-70' : ''}`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl bg-amber-100/80 p-2.5 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                      <Star className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Quick actions
                </h2>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={openAddMealForm}
                    className="inline-flex items-center gap-2 rounded-xl bg-wellora px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-wellora-hover"
                  >
                    <Plus className="h-4 w-4" />
                    Add New Meal
                  </button>
                  <button
                    type="button"
                    onClick={() => setVendorSection('meals')}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                  >
                    <UtensilsCrossed className="h-4 w-4" />
                    Manage Meals
                  </button>
                  <button
                    type="button"
                    onClick={() => setVendorSection('orders')}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                  >
                    <Store className="h-4 w-4" />
                    View Orders
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recent Orders</h2>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Latest activity from your customers</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                        <th className="px-5 py-3 font-semibold">Order ID</th>
                        <th className="px-5 py-3 font-semibold">Customer Name</th>
                        <th className="px-5 py-3 font-semibold">Meal Name</th>
                        <th className="px-5 py-3 font-semibold">Order Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {MOCK_ORDERS.map((o) => (
                        <tr key={o.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                          <td className="px-5 py-3 font-mono text-xs font-medium text-slate-900 dark:text-white">{o.id}</td>
                          <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{o.customerName}</td>
                          <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{o.mealName}</td>
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

              <div className="grid gap-6 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-wellora" />
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Top Selling Meals</h2>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">By order volume this month</p>
                  <ul className="mt-4 space-y-3">
                    {topSelling.map((item) => (
                      <li
                        key={item.rank}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/50"
                      >
                        <div className="min-w-0">
                          <span className="text-xs font-semibold text-wellora">#{item.rank}</span>
                          <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{item.mealName}</p>
                        </div>
                        <span className="shrink-0 rounded-lg bg-white px-2 py-1 text-xs font-semibold tabular-nums text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300">
                          {item.orders} orders
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-wellora" />
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Sales Overview</h2>
                    </div>
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Revenue · last 7 days</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Weekly trend (demo data)</p>
                  <div className="mt-6 flex h-52 items-end justify-between gap-2 border-b border-slate-100 pb-2 dark:border-slate-700">
                    {WEEKLY_REVENUE.map((d) => (
                      <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                        <span className="text-[10px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
                          ${(d.value / 1000).toFixed(1)}k
                        </span>
                        <div
                          className="w-full max-w-[52px] rounded-t-md bg-gradient-to-t from-wellora to-emerald-400/90 shadow-sm transition-all dark:from-wellora dark:to-emerald-500/80"
                          style={{ height: `${Math.max(12, (d.value / chartMax) * 100)}%` }}
                          title={`$${d.value.toLocaleString()}`}
                        />
                        <span className="text-xs text-slate-500 dark:text-slate-400">{d.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {vendorSection === 'meals' && (
            <>
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Meal Management</h1>
                <button
                  type="button"
                  onClick={openAddMealForm}
                  className="inline-flex shrink-0 items-center justify-center rounded-xl bg-wellora px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-wellora-hover"
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
                    className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500"
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <select
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value);
                      setPage(1);
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
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
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
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
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                        <th className="w-10 px-4 py-3">
                          <input type="checkbox" className="rounded border-slate-300" aria-label="Select all" />
                        </th>
                        <th className="px-4 py-3 font-semibold">Meal Name</th>
                        <th className="px-4 py-3 font-semibold">Category</th>
                        <th className="px-4 py-3 font-semibold">Calories</th>
                        <th className="px-4 py-3 font-semibold">Dietary Type</th>
                        <th className="px-4 py-3 font-semibold">Price</th>
                        <th className="px-4 py-3 font-semibold">Availability</th>
                        <th className="w-[8.5rem] px-4 py-3 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {slice.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3">
                            <input type="checkbox" className="rounded border-slate-300" aria-label={`Select ${row.name}`} />
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{row.name}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.category}</td>
                          <td className="px-4 py-3 tabular-nums text-slate-600 dark:text-slate-300">{row.calories}</td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.dietary}</td>
                          <td className="px-4 py-3 font-medium tabular-nums text-slate-900 dark:text-white">
                            ${row.price.toFixed(2)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                row.available
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                  : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {row.available ? 'Available' : 'Unavailable'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => duplicateMeal(row)}
                                className="rounded-lg p-1.5 text-wellora hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                aria-label={`Add duplicate of ${row.name}`}
                                title="Duplicate meal"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditMealForm(row)}
                                className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                                aria-label={`Edit ${row.name}`}
                                title="Edit meal"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteMeal(row.id)}
                                className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                                aria-label={`Delete ${row.name}`}
                                title="Delete meal"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-center gap-2 border-t border-slate-200 px-4 py-4 dark:border-slate-700">
                  <button
                    type="button"
                    disabled={pageSafe <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setPage(n)}
                        className={`min-w-[2rem] rounded-lg px-2 py-1 text-sm font-medium ${
                          n === pageSafe
                            ? 'bg-wellora text-white'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={pageSafe >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}

          {vendorSection === 'orders' && (
            <div className="mx-auto max-w-7xl space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Orders</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">All customer orders for your kitchen</p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                        <th className="px-5 py-3 font-semibold">Order ID</th>
                        <th className="px-5 py-3 font-semibold">Customer Name</th>
                        <th className="px-5 py-3 font-semibold">Meal Name</th>
                        <th className="px-5 py-3 font-semibold">Order Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {MOCK_ORDERS.map((o) => (
                        <tr key={o.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
                          <td className="px-5 py-3 font-mono text-xs font-medium text-slate-900 dark:text-white">{o.id}</td>
                          <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{o.customerName}</td>
                          <td className="px-5 py-3 text-slate-700 dark:text-slate-300">{o.mealName}</td>
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

          {vendorSection === 'menu' && (
            <div className="mx-auto max-w-7xl space-y-6">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Menu</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  How your meals appear to customers (preview)
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {meals.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold leading-snug text-slate-900 dark:text-white">{m.name}</h3>
                      <span className="shrink-0 text-lg font-bold text-wellora">${m.price.toFixed(2)}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {m.category} · {m.calories} kcal
                    </p>
                    <span className="mt-3 inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {m.dietary}
                    </span>
                    <p className="mt-3 text-xs text-slate-500">
                      {m.available ? (
                        <span className="text-emerald-600 dark:text-emerald-400">Available for order</span>
                      ) : (
                        <span className="text-slate-400">Currently unavailable</span>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {mealFormOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="meal-form-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
            aria-label="Close dialog"
            onClick={closeMealForm}
          />
          <div className="relative z-10 flex max-h-[min(100dvh,720px)] w-full max-w-lg flex-col rounded-t-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:max-h-[90vh] sm:rounded-2xl">
            <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <h2 id="meal-form-title" className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingMealId ? 'Edit meal' : 'Add new meal'}
              </h2>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-5">
                <div>
                  <label htmlFor="meal-name" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Meal Name
                  </label>
                  <input
                    id="meal-name"
                    type="text"
                    placeholder="e.g., Grilled Chicken Salad"
                    value={mealForm.mealName}
                    onChange={(e) => {
                      setMealForm((f) => ({ ...f, mealName: e.target.value }));
                      setMealNameError(false);
                    }}
                    className={`mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 ${
                      mealNameError
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                        : 'border-slate-200 focus:border-wellora focus:ring-wellora/20 dark:border-slate-600'
                    }`}
                    autoComplete="off"
                  />
                  {mealNameError && (
                    <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">Required. Must be unique.</p>
                  )}
                </div>

                <div>
                  <label htmlFor="meal-category" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Category
                  </label>
                  <select
                    id="meal-category"
                    value={mealForm.category}
                    onChange={(e) =>
                      setMealForm((f) => ({ ...f, category: e.target.value as FormCategory }))
                    }
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  >
                    {FORM_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="meal-calories" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Calories (kcal)
                  </label>
                  <input
                    id="meal-calories"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    placeholder="e.g., 450"
                    value={mealForm.calories}
                    onChange={(e) => {
                      setMealForm((f) => ({ ...f, calories: e.target.value }));
                      setCaloriesError(false);
                    }}
                    className={`mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 ${
                      caloriesError
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                        : 'border-slate-200 focus:border-wellora focus:ring-wellora/20 dark:border-slate-600'
                    }`}
                  />
                  {caloriesError && (
                    <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">Enter a valid calorie amount greater than zero.</p>
                  )}
                </div>

                <fieldset>
                  <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">Dietary Type</legend>
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
                          onChange={() => setMealForm((f) => ({ ...f, dietary: opt }))}
                          className="h-4 w-4 border-slate-300 text-wellora focus:ring-wellora"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label htmlFor="meal-price" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Price ($)
                  </label>
                  <input
                    id="meal-price"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.01}
                    placeholder="e.g., 12.99"
                    value={mealForm.price}
                    onChange={(e) => {
                      setMealForm((f) => ({ ...f, price: e.target.value }));
                      setPriceError(false);
                    }}
                    className={`mt-1.5 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500 ${
                      priceError
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                        : 'border-slate-200 focus:border-wellora focus:ring-wellora/20 dark:border-slate-600'
                    }`}
                  />
                  {priceError && (
                    <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">Enter a valid price.</p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-800/50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Available for Order</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Toggle to make this meal visible to users.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={mealForm.available}
                      onClick={() => setMealForm((f) => ({ ...f, available: !f.available }))}
                      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-wellora focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                        mealForm.available ? 'bg-wellora' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-6 w-6 translate-y-0.5 rounded-full bg-white shadow transition ${
                          mealForm.available ? 'translate-x-5' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                <p className="rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
                  Accurate calorie and dietary information is crucial for the platform&apos;s AI to provide personalized
                  and safe meal recommendations.
                </p>
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={closeMealForm}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveMealForm}
                className="rounded-xl bg-wellora px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-wellora-hover"
              >
                Save Meal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
