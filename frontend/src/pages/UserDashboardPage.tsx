import { useEffect, useState } from "react";
import { getUserProfile, UserProfile } from "../api/user";
import { getAIRecommendations, AIRecommendation, AIRecommendationResult } from "../api/ai";
import { getNutritionToday, NutritionToday } from "../api/nutrition";
import {
  getMyPartnerRecommendedMeals,
  type PartnerRecommendedMeal,
} from "../api/partner";
import {
  Bell,
  Flame,
  Clock3,
  Upload,
  CheckCircle2,
  Home,
  Star,
  ShoppingCart,
  Settings,
  Flower2,
  Info,
  Sparkles,
  Lightbulb,
  RefreshCw,
} from "lucide-react";
import { ThemeToggle } from "../components/ThemeToggle";
import { WelloraLogoMark } from "../components/WelloraLogoMark";
import { DietChatBot } from "../components/DietChatBot";
import type { AppPage } from "../types/page";

interface UserDashboardPageProps {
  onNavigate: (page: AppPage) => void;
}

const HERO_MEAL_IMAGE =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=960&q=85";

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-rose-500 text-white",
  medium: "bg-amber-500 text-white",
  low: "bg-slate-400 text-white",
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80";

export function UserDashboardPage({ onNavigate }: UserDashboardPageProps) {
  // ─── Real data from backend ───────────────────
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [aiData, setAiData] = useState<AIRecommendationResult | null>(null);
  const [partnerMeals, setPartnerMeals] = useState<PartnerRecommendedMeal[]>([]);
  const [aiLoading, setAiLoading] = useState(true);
  const [aiError, setAiError] = useState<string | null>(null);
  const [nutrition, setNutrition] = useState<NutritionToday | null>(null);

  useEffect(() => {
    getUserProfile().then(setProfile).catch(console.error);
    getNutritionToday().then(setNutrition).catch(console.error);
  }, []);

  const fetchRecommendations = () => {
    setAiLoading(true);
    setAiError(null);
    getAIRecommendations()
      .then(setAiData)
      .catch((err) => {
        setAiError(
          err?.response?.data?.detail ?? "Could not load AI recommendations."
        );
      })
      .finally(() => setAiLoading(false));
  };

  useEffect(() => {
    fetchRecommendations();
    getMyPartnerRecommendedMeals().then(setPartnerMeals).catch(console.error);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-500">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(20,184,134,0.14),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(20,184,134,0.08),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(12,138,106,0.1),_transparent_26%)]"></div>
      <div className="relative w-full max-w-none px-4 py-8 sm:px-6">
        <header className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-3 rounded-3xl bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 shadow-sm px-4 py-3">
              <WelloraLogoMark size="md" className="shadow-lg" />
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Welcome back,
                </p>
                <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
                  Welcome, {profile?.name ?? "User"}!
                </h1>{" "}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 rounded-3xl bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 px-4 py-3 shadow-sm">
              <Bell className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              <div className="text-left">
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  Daily target
                </p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">
                  {nutrition?.calorie_target ?? profile?.calorie_goal ?? "—"} kcal
                </p>
              </div>
            </div>
            <ThemeToggle />
            <button
              type="button"
              onClick={() => {
                localStorage.clear();
                onNavigate("login");
              }}
              className="hidden rounded-full bg-wellora px-4 py-3 text-sm font-semibold text-white transition hover:bg-wellora-hover md:inline-flex"
            >
              Log Out
            </button>
          </div>
        </header>

        <div className="mt-8 grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-6">
            <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                Navigation
              </h2>
              <nav className="mt-6 space-y-2">
                <button
                  type="button"
                  onClick={() => onNavigate("user-dashboard")}
                  className="flex w-full items-center gap-3 rounded-2xl border border-transparent bg-wellora px-4 py-3 text-left text-sm font-medium text-white shadow-sm transition hover:bg-wellora-hover dark:bg-wellora dark:hover:bg-wellora-hover"
                >
                  <Home className="w-4 h-4" />
                  Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("user-meal-recommendations")}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  <Star className="w-4 h-4" />
                  AI Diet Chat
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("user-menu-order")}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Menu & Order
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("user-wellness")}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  <Flower2 className="w-4 h-4" />
                  Wellness
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate("user-settings")}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </button>
              </nav>
            </div>

            <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                    Partner Status
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                    Linked: Wellora Fitness
                  </p>
                </div>
                <CheckCircle2 className="w-7 h-7 text-wellora" />
              </div>
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                You are connected with a wellness partner for personalized
                guidance.
              </p>
              <button
                type="button"
                className="mt-6 inline-flex items-center justify-center rounded-full bg-wellora px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-wellora-hover"
              >
                View Partner Details
              </button>
            </div>

            <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/80 p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Quick Actions
              </h2>
              <div className="mt-4 space-y-3">
                <button className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  <div className="flex items-center justify-between gap-3">
                    <span>Create a Meal Plan</span>
                    <Flame className="w-4 h-4 text-rose-500" />
                  </div>
                </button>
                <button className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  <div className="flex items-center justify-between gap-3">
                    <span>Track Nutrients</span>
                    <Clock3 className="w-4 h-4 text-sky-500" />
                  </div>
                </button>
                <button className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  <div className="flex items-center justify-between gap-3">
                    <span>Upload Health Data</span>
                    <Upload className="w-4 h-4 text-violet-500" />
                  </div>
                </button>
              </div>
            </div>
          </aside>

          <main className="space-y-6">
            <section className="overflow-hidden rounded-3xl border border-wellora/20 bg-wellora-light shadow-sm dark:border-wellora-dark/40 dark:bg-gradient-to-br dark:from-wellora-dark/30 dark:via-[#0a1620] dark:to-[#050a0f]">
              <div className="flex flex-col gap-6 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
                <div className="max-w-xl shrink-0">
                  <h2 className="text-2xl font-bold tracking-tight text-wellora sm:text-3xl dark:text-wellora">
                    Eat Smart. Live Well.
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base dark:text-slate-200">
                    Your personalized journey to healthy eating starts here.
                    Discover meals tailored to your health goals.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate("user-menu-order")}
                    className="mt-6 inline-flex items-center justify-center rounded-full bg-wellora px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-wellora-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wellora"
                  >
                    Order Healthy Meals
                  </button>
                </div>
                <div className="relative w-full max-w-md shrink-0 overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5 lg:max-w-lg dark:ring-white/10">
                  <img
                    src={HERO_MEAL_IMAGE}
                    alt="Fresh colorful healthy meal with vegetables and grains"
                    className="h-52 w-full object-cover sm:h-56 lg:h-[260px]"
                  />
                </div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-3">
              <article className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/85 p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Info
                        className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"
                        aria-hidden
                      />
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        Body Mass Index (BMI)
                      </p>
                    </div>
                    <p className="mt-3 text-4xl font-bold text-slate-900 dark:text-white">
                      {profile?.bmi ?? "—"}
                    </p>
                  </div>
                  <span className="rounded-full bg-wellora-soft px-3 py-1.5 text-sm font-semibold text-wellora-dark dark:bg-wellora/15 dark:text-wellora">
                    {profile?.bmi_category ?? "—"}
                  </span>
                </div>
                <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
                  Based on your last updated health profile.
                </p>
              </article>

              <article className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/85 p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Info
                        className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500"
                        aria-hidden
                      />
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                        Calories Consumed Today
                      </p>
                    </div>
                    <p className="mt-3 text-4xl font-bold text-slate-900 dark:text-white">
                      {nutrition?.calories_consumed ?? 0} kcal
                    </p>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    Out of {nutrition?.calorie_target ?? profile?.calorie_goal ?? 2000} kcal
                  </div>
                </div>
                <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-wellora transition-all duration-500"
                    style={{
                      width: `${Math.min(
                        100,
                        nutrition && nutrition.calorie_target > 0
                          ? Math.round((nutrition.calories_consumed / nutrition.calorie_target) * 100)
                          : 0
                      )}%`,
                    }}
                  ></div>
                </div>
                {nutrition && (
                  <div className="mt-3 flex gap-4 text-xs text-slate-500 dark:text-slate-400">
                    <span>P: {nutrition.protein_consumed_g}g / {nutrition.protein_target_g}g</span>
                    <span>C: {nutrition.carbs_consumed_g}g / {nutrition.carbs_target_g}g</span>
                    <span>F: {nutrition.fat_consumed_g}g / {nutrition.fat_target_g}g</span>
                  </div>
                )}
              </article>

              <article className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/85 p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                      Daily Progress
                    </p>
                    <p className="mt-3 text-4xl font-bold text-slate-900 dark:text-white">
                      {nutrition && nutrition.calorie_target > 0
                        ? `${Math.min(100, Math.round((nutrition.calories_consumed / nutrition.calorie_target) * 100))}%`
                        : "—"}
                    </p>
                  </div>
                  <div className={`inline-flex items-center justify-center rounded-2xl px-3 py-2 ${nutrition?.calorie_goal_met ? "bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-200" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                </div>
                <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
                  {nutrition?.calorie_goal_met
                    ? "Daily calorie goal met! Great work."
                    : nutrition
                    ? `${(nutrition.calorie_target - nutrition.calories_consumed).toLocaleString()} kcal remaining to hit your target.`
                    : "Log meals to track your progress."}
                </p>
              </article>
            </section>

            {partnerMeals.length > 0 && (
              <section className="rounded-[2rem] border border-emerald-200 bg-white/95 p-6 shadow-sm dark:border-emerald-900/50 dark:bg-slate-900/85">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-wellora" />
                  <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                    Partner Recommended Meals
                  </h2>
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Meals sent by your assigned wellness partner.
                </p>
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  {partnerMeals.slice(0, 3).map((meal) => (
                    <article
                      key={meal.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950"
                    >
                      <p className="text-base font-semibold text-slate-900 dark:text-white">
                        {meal.meal_name}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {meal.category} · {meal.calories} kcal · Rs{" "}
                        {meal.price.toFixed(2)}
                      </p>
                      <p className="mt-3 text-xs font-medium text-wellora">
                        Recommended by {meal.partner_name}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-[2rem] border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/85 p-8 shadow-sm">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-wellora" />
                    <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                      Top AI-Recommended Meals
                    </h2>
                  </div>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                    Personalized for you based on your order history and ratings.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchRecommendations}
                  disabled={aiLoading}
                  className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  <RefreshCw className={`w-4 h-4 ${aiLoading ? "animate-spin" : ""}`} />
                  Refresh
                </button>
              </div>

              {/* AI Summary + Daily Tip */}
              {aiData && !aiLoading && (
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="flex gap-3 rounded-2xl border border-wellora/20 bg-wellora-light p-4 dark:border-wellora/30 dark:bg-wellora/10">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-wellora" />
                    <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                      {aiData.ai_summary}
                    </p>
                  </div>
                  <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
                      {aiData.daily_tip}
                    </p>
                  </div>
                </div>
              )}

              {/* Calories Remaining Badge */}
              {aiData && !aiLoading && (
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  <Flame className="w-4 h-4 text-rose-500" />
                  {aiData.calories_remaining} kcal remaining today
                </div>
              )}

              {/* Loading State */}
              {aiLoading && (
                <div className="mt-8 grid gap-6 md:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="animate-pulse overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                    >
                      <div className="h-44 bg-slate-200 dark:bg-slate-800" />
                      <div className="p-5 space-y-3">
                        <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
                        <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-800" />
                        <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Error State */}
              {aiError && !aiLoading && (
                <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center dark:border-rose-500/20 dark:bg-rose-500/10">
                  <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
                    {aiError}
                  </p>
                  <button
                    type="button"
                    onClick={fetchRecommendations}
                    className="mt-4 rounded-full bg-wellora px-5 py-2 text-sm font-semibold text-white transition hover:bg-wellora-hover"
                  >
                    Try Again
                  </button>
                </div>
              )}

              {/* Meal Cards */}
              {!aiLoading && !aiError && aiData && (
                <div className="mt-8 grid gap-6 md:grid-cols-3">
                  {aiData.recommendations.map((rec: AIRecommendation) => (
                    <article
                      key={rec.meal_id}
                      className="group overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                    >
                      <div className="relative h-44 overflow-hidden bg-slate-200">
                        <img
                          src={rec.image_url || FALLBACK_IMAGE}
                          alt={rec.meal_name}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = FALLBACK_IMAGE;
                          }}
                        />
                        {/* Priority badge */}
                        <span
                          className={`absolute top-3 right-3 rounded-full px-2.5 py-1 text-xs font-bold capitalize ${PRIORITY_COLORS[rec.priority] ?? "bg-slate-400 text-white"}`}
                        >
                          {rec.priority}
                        </span>
                      </div>
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-base font-semibold leading-snug text-slate-900 dark:text-white">
                            {rec.meal_name}
                          </h3>
                          <span className="shrink-0 rounded-full bg-wellora px-2.5 py-1 text-xs font-semibold text-white">
                            {rec.calories} kcal
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                          {rec.reason}
                        </p>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <div className="flex flex-col gap-1">
                            <span className="rounded-full bg-wellora-soft px-3 py-1 text-xs font-semibold text-wellora-dark dark:bg-wellora/15 dark:text-wellora">
                              {rec.dietary}
                            </span>
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                              ${rec.price?.toFixed(2)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => onNavigate("user-menu-order")}
                            className="rounded-full bg-wellora px-4 py-2 text-xs font-semibold text-white transition hover:bg-wellora-hover"
                          >
                            Order Now
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </main>
        </div>
      </div>

      {/* ── Diet AI floating chatbot ── */}
      <DietChatBot />
    </div>
  );
}
