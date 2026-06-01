import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  LayoutGrid,
  Settings,
  ShoppingCart,
  Star,
  Flower2,
} from "lucide-react";
import type { AppPage } from "../types/page";
import { WelloraLogoMark } from "../components/WelloraLogoMark";
import { getPublicMeals, PublicMeal } from "../api/orders";
import { getUserProfile, UserProfile } from "../api/user";
import { resolveImageUrl } from "../api/client";

interface MealRecommendationsPageProps {
  onNavigate: (page: AppPage) => void;
}

type FitnessGoal = "loss" | "gain" | "maintain";
type Dietary =
  | "vegetarian"
  | "vegan"
  | "gluten-free"
  | "keto"
  | "paleo"
  | "all";

const FITNESS_OPTIONS: { value: FitnessGoal; label: string }[] = [
  { value: "loss", label: "Weight Loss" },
  { value: "gain", label: "Muscle Gain" },
  { value: "maintain", label: "Maintenance" },
];

const DIETARY_OPTIONS: { value: Dietary; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "vegan", label: "Vegan" },
  { value: "gluten-free", label: "Gluten-Free" },
  { value: "keto", label: "Keto" },
  { value: "paleo", label: "Paleo" },
];

const GOAL_CALORIE_RANGE: Record<FitnessGoal, [number, number]> = {
  loss: [200, 500],
  gain: [400, 700],
  maintain: [300, 600],
};

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=85";

const PROFILE_IMG =
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&h=120&q=80";

function getAiMessage(meal: PublicMeal, goal: FitnessGoal): string {
  if (goal === "loss")
    return `At ${meal.calories} kcal, this is a smart low-calorie choice to support your weight loss journey.`;
  if (goal === "gain")
    return `Rich in nutrients and calories — ideal for muscle building and maintaining energy levels.`;
  return `A well-balanced meal that keeps you on track with your daily maintenance goals.`;
}

export function MealRecommendationsPage({
  onNavigate,
}: MealRecommendationsPageProps) {
  const [meals, setMeals] = useState<PublicMeal[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoal>("maintain");
  const [dietary, setDietary] = useState<Dietary>("all");

  useEffect(() => {
    // Load meals and user profile together
    Promise.all([getPublicMeals(), getUserProfile()])
      .then(([mealsData, profileData]) => {
        setMeals(mealsData);
        if (profileData) {
          setProfile(profileData);
          // Auto set fitness goal from user profile
          const goal = profileData.health_goal;
          if (goal === "lose") setFitnessGoal("loss");
          if (goal === "gain") setFitnessGoal("gain");
          if (goal === "maintain") setFitnessGoal("maintain");
          // Auto set dietary from user profile
          const pref = (profileData.dietary_preferences ?? "").toLowerCase();
          if (pref.includes("vegan")) setDietary("vegan");
          else if (pref.includes("vegeta")) setDietary("vegetarian");
          else if (pref.includes("keto")) setDietary("keto");
          else if (pref.includes("paleo")) setDietary("paleo");
          else if (pref.includes("gluten")) setDietary("gluten-free");
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  // Filter meals by dietary + goal calorie range
  const recommended = useMemo(() => {
    const [minCal, maxCal] = GOAL_CALORIE_RANGE[fitnessGoal];
    return meals.filter((m) => {
      const calOk = m.calories >= minCal && m.calories <= maxCal;
      const dietOk =
        dietary === "all" ||
        m.dietary.toLowerCase().includes(dietary.toLowerCase());
      return calOk && dietOk;
    });
  }, [meals, fitnessGoal, dietary]);

  // Pick best match for featured card
  const featured = recommended[0] ?? meals[0] ?? null;

  return (
    <div className="flex min-h-dvh flex-col bg-slate-200/80 py-3 pl-5 pr-3 dark:bg-slate-950 sm:py-4 sm:pl-8 sm:pr-4 lg:h-dvh lg:max-h-dvh lg:overflow-hidden lg:pl-10 lg:pr-6 xl:pl-12">
      <div className="mr-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-4 sm:flex-row sm:gap-5 lg:gap-6">
        {/* ── Sidebar ── */}
        <aside className="hidden w-64 shrink-0 flex-col rounded-2xl border border-slate-200/90 bg-white py-6 pl-5 pr-4 shadow-lg dark:border-slate-700 dark:bg-slate-900 sm:flex sm:min-h-0 sm:overflow-y-auto lg:w-72 lg:pl-6 lg:pr-5">
          <div className="mb-8 flex items-center gap-2 border-b border-violet-200/60 pb-6 pl-0.5 dark:border-violet-900/40">
            <WelloraLogoMark size="md" />
            <span className="text-lg font-semibold tracking-tight text-wellora">
              Wellora
            </span>
          </div>
          <nav className="flex flex-1 flex-col space-y-1">
            <button
              type="button"
              onClick={() => onNavigate("user-dashboard")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <LayoutGrid className="h-4 w-4 shrink-0 text-slate-500" />{" "}
              Dashboard
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5 text-left text-sm font-semibold text-slate-900 dark:bg-slate-800 dark:text-white"
            >
              <Star className="h-4 w-4 shrink-0" /> Meal Recommendations
            </button>
            <button
              type="button"
              onClick={() => onNavigate("user-menu-order")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ShoppingCart className="h-4 w-4 shrink-0 text-slate-500" /> Menu
              & Order
            </button>
            <button
              type="button"
              onClick={() => onNavigate("user-wellness")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Flower2 className="h-4 w-4 shrink-0 text-slate-500" /> Wellness
            </button>
          </nav>
          <button
            type="button"
            onClick={() => onNavigate("user-settings")}
            className="mt-6 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Settings className="h-4 w-4 shrink-0" /> Settings
          </button>
        </aside>

        {/* ── Main ── */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:rounded-t-2xl sm:px-6">
            <div className="flex items-center gap-2">
              <WelloraLogoMark size="sm" />
              <span className="font-semibold text-wellora">Wellora</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <Bell className="h-5 w-5" />
              </button>
              <img
                src={PROFILE_IMG}
                alt=""
                className="h-9 w-9 rounded-full object-cover ring-2 ring-slate-100 dark:ring-slate-700"
              />
            </div>
          </header>

          {/* Mobile nav */}
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 sm:hidden dark:border-slate-800 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => onNavigate("user-dashboard")}
              className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium text-slate-600"
            >
              Dashboard
            </button>
            <span className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-900 dark:bg-slate-800 dark:text-white">
              Meals
            </span>
            <button
              type="button"
              onClick={() => onNavigate("user-menu-order")}
              className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium text-slate-600"
            >
              Menu
            </button>
          </div>

          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/80 p-5 dark:bg-slate-950/40 sm:p-6 lg:p-8">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                Recommended for You
              </h1>
              {profile && (
                <span className="rounded-full bg-wellora/10 px-3 py-1 text-xs font-semibold text-wellora">
                  Goal:{" "}
                  {fitnessGoal === "loss"
                    ? "Weight Loss"
                    : fitnessGoal === "gain"
                      ? "Muscle Gain"
                      : "Maintenance"}
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="mt-16 flex items-center justify-center">
                <p className="text-slate-500">Loading recommendations...</p>
              </div>
            ) : (
              <div className="mt-6 grid gap-5 sm:mt-8 sm:gap-6 lg:min-h-0 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)] lg:items-stretch xl:gap-8">
                {/* ── Filters ── */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md dark:border-slate-700 dark:bg-slate-900 sm:p-6 lg:max-h-full lg:overflow-y-auto">
                  <div className="space-y-6 sm:space-y-8">
                    <fieldset>
                      <legend className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Fitness Goal
                      </legend>
                      <div className="mt-3 space-y-2.5">
                        {FITNESS_OPTIONS.map(({ value, label }) => (
                          <label
                            key={value}
                            className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1 text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <input
                              type="radio"
                              name="fitness-goal"
                              value={value}
                              checked={fitnessGoal === value}
                              onChange={() => setFitnessGoal(value)}
                              className="h-4 w-4 border-slate-300 text-wellora accent-wellora focus:ring-wellora"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    <fieldset>
                      <legend className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Dietary Type
                      </legend>
                      <div className="mt-3 space-y-2.5">
                        {DIETARY_OPTIONS.map(({ value, label }) => (
                          <label
                            key={value}
                            className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1 text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            <input
                              type="radio"
                              name="dietary"
                              value={value}
                              checked={dietary === value}
                              onChange={() => setDietary(value)}
                              className="h-4 w-4 border-slate-300 text-wellora accent-wellora focus:ring-wellora"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    {/* Stats */}
                    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Matches found
                      </p>
                      <p className="mt-1 text-2xl font-bold text-wellora">
                        {recommended.length}
                      </p>
                      <p className="text-xs text-slate-500">
                        out of {meals.length} total meals
                      </p>
                    </div>
                  </div>
                </div>

                {/* ── Recommendation content ── */}
                <div className="flex min-h-0 flex-col gap-5 lg:overflow-y-auto">
                  {/* Featured meal */}
                  {featured ? (
                    <article className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md dark:border-slate-700 dark:bg-slate-900">
                      <div className="aspect-[16/9] max-h-[280px] shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800">
                        <img
                          src={
                            resolveImageUrl(featured.image_url) ||
                            FALLBACK_IMAGE
                          }
                          alt={featured.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="p-5 sm:p-6">
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                            {featured.name}
                          </h2>
                          <span className="rounded-full bg-wellora/10 px-2.5 py-1 text-xs font-semibold text-wellora">
                            ⭐ Best Match
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <span className="text-sm text-slate-500 dark:text-slate-400">
                            {featured.calories} kcal
                          </span>
                          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {featured.dietary}
                          </span>
                          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {featured.category}
                          </span>
                        </div>
                        <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            AI Says:{" "}
                          </span>
                          {getAiMessage(featured, fitnessGoal)}
                        </p>
                        <button
                          type="button"
                          onClick={() => onNavigate("user-menu-order")}
                          className="mt-6 w-full rounded-xl bg-wellora py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-wellora-hover"
                        >
                          Order This Meal →
                        </button>
                      </div>
                    </article>
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
                      <p className="text-slate-500">
                        No meals match your current filters.
                      </p>
                      <p className="mt-2 text-sm text-slate-400">
                        Try changing dietary type or fitness goal.
                      </p>
                    </div>
                  )}

                  {/* Other recommendations */}
                  {recommended.length > 1 && (
                    <div>
                      <h3 className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-400">
                        More Recommendations ({recommended.length - 1})
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {recommended.slice(1, 5).map((meal) => (
                          <div
                            key={meal.id}
                            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                          >
                            <img
                              src={
                                resolveImageUrl(meal.image_url) ||
                                FALLBACK_IMAGE
                              }
                              alt={meal.name}
                              className="h-14 w-14 shrink-0 rounded-lg object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                {meal.name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {meal.calories} kcal · {meal.dietary}
                              </p>
                            </div>
                            <span className="shrink-0 text-sm font-bold text-wellora">
                              Rs {meal.price.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
