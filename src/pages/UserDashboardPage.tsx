import { useEffect, useState } from "react";
import { getUserProfile, UserProfile } from "../api/user";
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
} from "lucide-react";
import { ThemeToggle } from "../components/ThemeToggle";
import { WelloraLogoMark } from "../components/WelloraLogoMark";
import type { AppPage } from "../types/page";

interface UserDashboardPageProps {
  onNavigate: (page: AppPage) => void;
}

const HERO_MEAL_IMAGE =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=960&q=85";

export function UserDashboardPage({ onNavigate }: UserDashboardPageProps) {
  // ─── Real data from backend ───────────────────
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    getUserProfile().then(setProfile).catch(console.error);
  }, []);
  const meals = [
    {
      title: "Mediterranean Grilled Salmon",
      calories: 450,
      badge: "Pescatarian",
      description:
        "Rich in Omega-3 for heart health and anti-inflammatory benefits.",
      image:
        "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80",
    },
    {
      title: "Quinoa & Black Bean Buddha Bowl",
      calories: 380,
      badge: "Vegan",
      description:
        "High in plant-based protein and fiber, great for sustained energy.",
      image:
        "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80",
    },
    {
      title: "Chicken & Veggie Stir-fry",
      calories: 320,
      badge: "Gluten-Free",
      description:
        "Lean protein with a variety of colorful vegetables for essential nutrients.",
      image:
        "https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=800&q=80",
    },
  ];

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
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  Daily target
                </p>
                <p className="mt-3 text-4xl font-bold text-slate-900 dark:text-white">
                  {profile?.bmi ?? "—"}
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
                  Meal Recommendations
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
                      1850 kcal
                    </p>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    Out of 2000 kcal
                  </div>
                </div>
                <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div className="h-full w-[92.5%] rounded-full bg-wellora"></div>
                </div>
              </article>

              <article className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/85 p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                      Progress
                    </p>
                    <p className="mt-3 text-4xl font-bold text-slate-900 dark:text-white">
                      82%
                    </p>
                  </div>
                  <div className="inline-flex items-center justify-center rounded-2xl bg-sky-50 px-3 py-2 text-sky-700 dark:bg-sky-500/10 dark:text-sky-200">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                </div>
                <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
                  On track with your weekly nutrition and wellness goals.
                </p>
              </article>
            </section>

            <section className="rounded-[2rem] border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/85 p-8 shadow-sm">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
                  Top AI-Recommended Meals
                </h2>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  Your personalized meal suggestions for today.
                </p>
              </div>

              <div className="mt-8 grid gap-6 md:grid-cols-3">
                {meals.map((meal) => (
                  <article
                    key={meal.title}
                    className="group overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                  >
                    <div className="h-44 overflow-hidden bg-slate-200">
                      <img
                        src={meal.image}
                        alt={meal.title}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    </div>
                    <div className="p-5">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                          {meal.title}
                        </h3>
                        <span className="rounded-full bg-wellora px-3 py-1 text-xs font-semibold text-white">
                          {meal.calories} kcal
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                        {meal.description}
                      </p>
                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span className="rounded-full bg-wellora-soft px-3 py-1 text-xs font-semibold text-wellora-dark">
                          {meal.badge}
                        </span>
                        <button className="rounded-full bg-wellora px-4 py-2 text-xs font-semibold text-white transition hover:bg-wellora-hover">
                          Add to Plan
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </main> 
        </div>
      </div>
    </div>
  );
}
