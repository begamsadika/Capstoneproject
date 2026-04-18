import { useEffect, useState } from "react";
import {
  getMyOrders,
  getTodaySummary,
  cancelOrder,
  TodaySummary,
  MyOrder,
} from "../api/orders";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CircleDot,
  Droplets,
  Flower2,
  Heart,
  Moon,
  Scale,
  Smile,
  Sparkles,
  Target,
  UtensilsCrossed,
  Apple,
  Footprints,
  ShoppingBag,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AppPage } from "../types/page";
import { WelloraLogoMark } from "../components/WelloraLogoMark";
import { getUserProfile, UserProfile } from "../api/user";

interface WellnessPageProps {
  onNavigate: (page: AppPage) => void;
}

const PROFILE_IMG =
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&h=120&q=80";

type WellnessTab = "overview" | "orders" | "details";

const AI_INSIGHTS: {
  Icon: LucideIcon;
  title: string;
  confidence: "high" | "medium";
  explore: string;
}[] = [
  {
    Icon: CircleDot,
    title: "Your consistent hydration habits are improving skin elasticity.",
    confidence: "high",
    explore: "Explore Hydration Tips",
  },
  {
    Icon: Moon,
    title:
      "Sleep onset has shifted 20 minutes earlier—correlated with better morning energy.",
    confidence: "medium",
    explore: "View Sleep Guidance",
  },
  {
    Icon: Apple,
    title:
      "Fiber intake this week supports stable glucose patterns after meals.",
    confidence: "high",
    explore: "See Nutrition Ideas",
  },
  {
    Icon: Droplets,
    title:
      "Mid-day water gaps on weekdays may affect focus—try a timed reminder.",
    confidence: "medium",
    explore: "Set Hydration Reminders",
  },
];

const WELLNESS_TIPS: { Icon: LucideIcon; title: string; body: string }[] = [
  {
    Icon: Moon,
    title: "Prioritize Quality Sleep",
    body: "Aim for 7–9 hours in a cool, dark room. Consistent wake times strengthen your circadian rhythm.",
  },
  {
    Icon: Footprints,
    title: "Stay Active Daily",
    body: "Short walks after meals aid digestion and blood sugar. Even 10-minute movement blocks add up.",
  },
  {
    Icon: Apple,
    title: "Balanced Nutrition",
    body: "Fill half your plate with vegetables, add lean protein, and choose whole grains for steady energy.",
  },
  {
    Icon: Heart,
    title: "Manage Stress Mindfully",
    body: "Brief breathing exercises or stretching breaks can lower cortisol. Pair them with daily habits.",
  },
];

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Breakfast: Apple,
  Lunch: UtensilsCrossed,
  Dinner: Moon,
  Snacks: Apple,
  default: UtensilsCrossed,
};

export function WellnessPage({ onNavigate }: WellnessPageProps) {
  const [tab, setTab] = useState<WellnessTab>("overview");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getUserProfile(), getTodaySummary(), getMyOrders()])
      .then(([p, s, o]) => {
        if (p) setProfile(p);
        setSummary(s);
        setOrders(o);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const calorieGoal = profile?.calorie_goal ?? 2000;
  const caloriesEaten = summary?.total_calories ?? 0;
  const progress = Math.min(100, (caloriesEaten / calorieGoal) * 100);
  const remaining = Math.max(0, calorieGoal - caloriesEaten);

  const tabClass = (t: WellnessTab) =>
    `relative px-4 py-3 text-sm font-semibold transition sm:px-5 sm:text-base ${
      tab === t
        ? "text-wellora after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-wellora"
        : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
    }`;

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto grid max-w-6xl grid-cols-3 items-center gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2 justify-self-start">
            <WelloraLogoMark size="sm" />
            <span className="text-lg font-semibold text-wellora">Wellora</span>
          </div>
          <div className="flex flex-col items-center justify-center justify-self-center">
            <div className="flex items-center gap-2 border-b-2 border-wellora pb-2 text-wellora">
              <Flower2 className="h-5 w-5" strokeWidth={2} />
              <span className="text-sm font-semibold sm:text-base">
                Wellness
              </span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 sm:gap-3">
            <button
              type="button"
              className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <Bell className="h-5 w-5" />
            </button>
            <img
              src={PROFILE_IMG}
              alt=""
              className="h-9 w-9 rounded-full object-cover ring-2 ring-slate-100 dark:ring-slate-700"
            />
          </div>
        </div>
        {/* Tabs */}
        <div className="mx-auto flex max-w-6xl gap-0 border-t border-slate-100 px-4 dark:border-slate-800 sm:px-6">
          <button
            type="button"
            onClick={() => setTab("overview")}
            className={tabClass("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setTab("orders")}
            className={tabClass("orders")}
          >
            My Orders
          </button>
          <button
            type="button"
            onClick={() => setTab("details")}
            className={tabClass("details")}
          >
            Details
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {/* ── OVERVIEW TAB ── */}
        {tab === "overview" && (
          <>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => onNavigate("user-dashboard")}
                className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Dashboard
              </button>
              <h1 className="text-3xl font-light tracking-tight text-slate-400 dark:text-slate-500 sm:text-4xl">
                Wellness Overview
              </h1>
            </div>

            {/* KPI Cards */}
            <section className="mb-10">
              <h2 className="mb-5 text-lg font-semibold text-slate-800 dark:text-slate-200">
                Your Wellness at a Glance
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {/* BMI */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-wellora/10 text-wellora">
                    <Scale className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                    Current BMI
                  </p>
                  <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                    {loading ? "..." : (profile?.bmi ?? "—")}
                  </p>
                  <span className="mt-3 inline-block rounded-full bg-wellora-soft px-3 py-1 text-xs font-semibold text-wellora-dark dark:bg-wellora/15 dark:text-wellora">
                    {loading ? "..." : (profile?.bmi_category ?? "—")}
                  </span>
                </div>

                {/* Calories eaten */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-wellora/10 text-wellora">
                    <UtensilsCrossed className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                    Calories Today
                  </p>
                  <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                    {loading ? "..." : caloriesEaten}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {summary?.order_count ?? 0} orders placed today
                  </p>
                </div>

                {/* Calorie target */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-wellora/10 text-wellora">
                    <Target className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                    Daily Target
                  </p>
                  <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                    {loading ? "..." : calorieGoal}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {remaining} kcal remaining
                  </p>
                </div>

                {/* Wellness status */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-wellora/10 text-wellora">
                    <Smile className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">
                    Wellness Status
                  </p>
                  <p className="mt-2 text-xl font-bold leading-snug text-wellora sm:text-2xl">
                    {progress >= 80
                      ? "On Track! 🎯"
                      : progress >= 50
                        ? "Getting There"
                        : "Keep Going!"}
                  </p>
                  <p className="mt-3 text-xs font-medium text-slate-400">
                    AI-powered insight
                  </p>
                </div>
              </div>
            </section>

            {/* Daily Intake Summary */}
            <section className="mb-12">
              <h2 className="mb-5 text-lg font-semibold text-slate-800 dark:text-slate-200">
                Daily Intake Summary
              </h2>
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Total Calories:
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                    {caloriesEaten} / {calorieGoal} kcal
                  </span>
                </div>
                <div className="mt-4 h-4 overflow-hidden rounded-full bg-wellora-light dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-wellora transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {Math.round(progress)}% of daily goal reached
                </p>
              </div>

              {/* Meal log from real orders */}
              {summary && summary.meal_log.length > 0 ? (
                <ul className="mt-4 space-y-3">
                  {summary.meal_log.map((log, i) => {
                    const Icon =
                      CATEGORY_ICONS[log.category] ?? CATEGORY_ICONS.default;
                    return (
                      <li
                        key={i}
                        className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:flex-nowrap sm:px-5"
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-wellora/10 text-wellora">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {log.name}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {log.time} · Qty: {log.quantity}
                          </p>
                        </div>
                        <span className="text-base font-bold text-wellora">
                          {log.calories} kcal
                        </span>
                        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                          {log.category}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
                  <UtensilsCrossed className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
                  <p className="mt-3 text-sm text-slate-500">
                    No meals ordered today yet.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate("user-menu-order")}
                    className="mt-4 rounded-xl bg-wellora px-4 py-2 text-sm font-semibold text-white hover:bg-wellora-hover"
                  >
                    Order Your First Meal
                  </button>
                </div>
              )}
            </section>
          </>
        )}

        {/* ── MY ORDERS TAB ── */}
        {tab === "orders" && (
          <>
            <div className="mb-6 flex items-center justify-between">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                My Order History
              </h1>
              <button
                type="button"
                onClick={() => onNavigate("user-menu-order")}
                className="rounded-xl bg-wellora px-4 py-2.5 text-sm font-semibold text-white hover:bg-wellora-hover"
              >
                + New Order
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-wellora border-t-transparent" />
              </div>
            ) : orders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
                <ShoppingBag className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-4 text-slate-500">No orders yet.</p>
                <button
                  type="button"
                  onClick={() => onNavigate("user-menu-order")}
                  className="mt-4 rounded-xl bg-wellora px-4 py-2.5 text-sm font-semibold text-white hover:bg-wellora-hover"
                >
                  Browse Menu
                </button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                      <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300">
                        Meal
                      </th>
                      <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300">
                        Qty
                      </th>
                      <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300">
                        Total
                      </th>
                      <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300">
                        Status
                      </th>
                      <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300">
                        Date
                      </th>
                      <th className="px-5 py-3 font-semibold text-slate-600 dark:text-slate-300">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {orders.map((order) => (
                      <tr
                        key={order.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
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
                        <td className="px-5 py-3 text-slate-700 dark:text-slate-300">
                          ×{order.quantity}
                        </td>
                        <td className="px-5 py-3 font-semibold text-slate-900 dark:text-white">
                          ${order.total_price.toFixed(2)}
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                              order.status === "pending"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                                : order.status === "confirmed"
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200"
                                  : order.status === "delivered"
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                                    : "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200"
                            }`}
                          >
                            {order.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-500">
                          {new Date(order.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-3">
                          {order.status === "pending" && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await cancelOrder(order.id);
                                  setOrders((prev) =>
                                    prev.map((o) =>
                                      o.id === order.id
                                        ? { ...o, status: "cancelled" }
                                        : o,
                                    ),
                                  );
                                } catch {
                                  alert("Failed to cancel order");
                                }
                              }}
                              className="rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50"
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── DETAILS TAB ── */}
        {tab === "details" && (
          <>
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => onNavigate("user-dashboard")}
                className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="h-4 w-4" /> Back to Dashboard
              </button>
              <h1 className="text-3xl font-light tracking-tight text-slate-400 dark:text-slate-500 sm:text-4xl">
                Wellness Details
              </h1>
            </div>

            {/* Weekly summary */}
            <section className="mb-10">
              <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">
                Weekly Wellness Summary
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    Daily Calorie Target
                  </p>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">
                    {calorieGoal} kcal
                  </p>
                  <p className="mt-3 text-sm text-slate-500">
                    Goal: {profile?.health_goal ?? "—"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                    BMI
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                      {profile?.bmi_category ?? "N/A"}
                      <ArrowRight className="h-5 w-5 text-slate-400" />
                    </div>
                    <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                      {profile?.bmi ?? "—"}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            {/* AI Insights */}
            <section className="mb-10">
              <div className="mb-1 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-wellora" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  AI Wellness Insights
                </h2>
              </div>
              <p className="mb-5 text-sm text-slate-500">
                Insights generated by Wellora AI.
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {AI_INSIGHTS.map(({ Icon, title, confidence, explore }) => (
                  <article
                    key={title}
                    className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-wellora/10 text-wellora">
                        <Icon className="h-5 w-5" />
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          confidence === "high"
                            ? "bg-wellora-soft text-wellora-dark dark:bg-wellora/15 dark:text-wellora"
                            : "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200"
                        }`}
                      >
                        {confidence === "high"
                          ? "High Confidence"
                          : "Medium Confidence"}
                      </span>
                    </div>
                    <p className="mt-4 text-sm font-semibold leading-snug text-slate-900 dark:text-white">
                      {title}
                    </p>
                    <button
                      type="button"
                      className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-wellora hover:text-wellora-hover"
                    >
                      {explore} <ArrowRight className="h-4 w-4" />
                    </button>
                  </article>
                ))}
              </div>
            </section>

            {/* Wellness Tips */}
            <section className="mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Wellness Tips
              </h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {WELLNESS_TIPS.map(({ Icon, title, body }) => (
                  <article
                    key={title}
                    className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex items-center gap-2 text-wellora">
                      <Icon className="h-5 w-5 shrink-0" />
                      <h3 className="font-bold text-slate-900 dark:text-white">
                        {title}
                      </h3>
                    </div>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                      {body}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        <footer className="mt-12 border-t border-slate-200 bg-slate-100/90 py-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
          © 2026 Wellora. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
