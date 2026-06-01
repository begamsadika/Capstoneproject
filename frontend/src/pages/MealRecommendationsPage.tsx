import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Flower2,
  LayoutGrid,
  Loader2,
  Send,
  Settings,
  ShoppingCart,
  Sparkles,
  Star,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { AppPage } from "../types/page";
import { WelloraLogoMark } from "../components/WelloraLogoMark";
import {
  getAIRecommendations,
  askAI,
  AIRecommendation,
  AIRecommendationResult,
} from "../api/ai";

interface MealRecommendationsPageProps {
  onNavigate: (page: AppPage) => void;
}

const PRIORITY_CONFIG = {
  high: { label: "Best Match", cls: "bg-wellora text-white" },
  medium: {
    label: "Good Match",
    cls: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  },
  low: {
    label: "Suggested",
    cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
};

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=600&q=80";

const QUICK_ASKS = [
  "What should I eat for breakfast?",
  "I want something light and low calorie",
  "Suggest a high protein meal",
  "What fits my remaining calories today?",
  "I want a vegetarian option",
];

export function MealRecommendationsPage({
  onNavigate,
}: MealRecommendationsPageProps) {
  const [result, setResult] = useState<AIRecommendationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAsking, setIsAsking] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState<AIRecommendation | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadRecommendations();
  }, []);

  const loadRecommendations = async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await getAIRecommendations();
      setResult(data);
      if (data.recommendations.length > 0) setSelected(data.recommendations[0]);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Failed to load recommendations.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAsk = async (msg?: string) => {
    const question = msg ?? input.trim();
    if (!question) return;
    setIsAsking(true);
    setError("");
    setInput("");
    try {
      const data = await askAI(question);
      setResult(data);
      if (data.recommendations.length > 0) setSelected(data.recommendations[0]);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Failed to get AI response.");
    } finally {
      setIsAsking(false);
    }
  };

  const navCls = (active: boolean) =>
    active
      ? "flex w-full items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5 text-left text-sm font-semibold text-slate-900 dark:bg-slate-800 dark:text-white"
      : "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800";

  return (
    <div className="flex min-h-dvh bg-slate-100 dark:bg-slate-950 lg:h-dvh lg:overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6 dark:border-slate-800 dark:bg-slate-900 lg:flex">
        <div className="mb-8 flex items-center gap-2 px-1">
          <WelloraLogoMark size="md" />
          <span className="text-lg font-semibold tracking-tight text-wellora">
            Wellora
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          <button
            type="button"
            onClick={() => onNavigate("user-dashboard")}
            className={navCls(false)}
          >
            <LayoutGrid className="h-4 w-4 shrink-0" /> Dashboard
          </button>
          <button type="button" className={navCls(true)}>
            <Star className="h-4 w-4 shrink-0" /> Meal Recommendations
          </button>
          <button
            type="button"
            onClick={() => onNavigate("user-menu-order")}
            className={navCls(false)}
          >
            <ShoppingCart className="h-4 w-4 shrink-0" /> Menu & Order
          </button>
          <button
            type="button"
            onClick={() => onNavigate("user-wellness")}
            className={navCls(false)}
          >
            <Flower2 className="h-4 w-4 shrink-0" /> Wellness
          </button>
        </nav>
        <button
          type="button"
          onClick={() => onNavigate("user-settings")}
          className={navCls(false)}
        >
          <Settings className="h-4 w-4 shrink-0" /> Settings
        </button>
      </aside>

      {/* ── Main ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
          <div className="flex items-center gap-2">
            <WelloraLogoMark size="sm" />
            <span className="font-semibold text-wellora">Wellora</span>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <Bell className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* ── Left: Recommendations list ── */}
          <main className="flex min-h-0 w-full flex-col overflow-hidden lg:w-[420px] lg:shrink-0 lg:border-r lg:border-slate-200 lg:dark:border-slate-800">
            {/* Page title + AI badge */}
            <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-wellora" />
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  AI Recommendations
                </h1>
                <span className="rounded-full bg-wellora/10 px-2 py-0.5 text-xs font-semibold text-wellora">
                  Powered by Claude
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Personalized to your health profile and today's intake
              </p>
            </div>

            {/* Ask AI input */}
            <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAsk()}
                  placeholder="Ask AI anything... e.g. 'I want something light'"
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-wellora focus:outline-none focus:ring-2 focus:ring-wellora/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => handleAsk()}
                  disabled={!input.trim() || isAsking}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-wellora text-white transition hover:bg-wellora-hover disabled:opacity-50"
                >
                  {isAsking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Quick ask chips */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK_ASKS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleAsk(q)}
                    disabled={isAsking || isLoading}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-wellora hover:text-wellora disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Recommendations list */}
            <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/80 dark:bg-slate-950/40">
              {isLoading || isAsking ? (
                <div className="flex flex-col items-center justify-center gap-4 py-16">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-wellora/10">
                    <Sparkles className="h-7 w-7 animate-pulse text-wellora" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-slate-700 dark:text-slate-300">
                      {isAsking
                        ? "Thinking..."
                        : "Analyzing your health profile..."}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Claude is reviewing your data
                    </p>
                  </div>
                </div>
              ) : error ? (
                <div className="p-5">
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900/40 dark:bg-red-950/20">
                    <p className="font-semibold text-red-700 dark:text-red-400">
                      Unable to load recommendations
                    </p>
                    <p className="mt-1 text-sm text-red-600 dark:text-red-500">
                      {error}
                    </p>
                    <button
                      type="button"
                      onClick={loadRecommendations}
                      className="mt-3 rounded-xl bg-wellora px-4 py-2 text-sm font-semibold text-white hover:bg-wellora-hover"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              ) : !result?.recommendations?.length ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <ShoppingCart className="h-10 w-10 text-slate-300" />
                  <p className="text-slate-500">
                    No recommendations available yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 p-4">
                  {result.recommendations.map((rec, i) => {
                    const cfg =
                      PRIORITY_CONFIG[rec.priority] ?? PRIORITY_CONFIG.low;
                    const isActive = selected?.meal_id === rec.meal_id;
                    return (
                      <button
                        key={rec.meal_id}
                        type="button"
                        onClick={() => setSelected(rec)}
                        className={`w-full overflow-hidden rounded-2xl border text-left transition ${
                          isActive
                            ? "border-wellora bg-white shadow-md ring-2 ring-wellora/20 dark:bg-slate-900"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900"
                        }`}
                      >
                        <div className="flex gap-3 p-3">
                          <img
                            src={rec.image_url || FALLBACK_IMG}
                            alt={rec.meal_name}
                            className="h-16 w-16 shrink-0 rounded-xl object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold leading-snug text-slate-900 dark:text-white">
                                {rec.meal_name}
                              </p>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.cls}`}
                              >
                                {cfg.label}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span className="text-xs text-slate-500">
                                {rec.calories} kcal
                              </span>
                              <span className="text-xs text-slate-400">·</span>
                              <span className="text-xs text-slate-500">
                                {rec.dietary}
                              </span>
                              <span className="text-xs text-slate-400">·</span>
                              <span className="text-xs font-semibold text-wellora">
                                ${rec.price.toFixed(2)}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                              {rec.reason}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </main>

          {/* ── Right: Selected meal detail + AI insights ── */}
          <div className="hidden min-h-0 flex-1 flex-col overflow-y-auto lg:flex">
            {result && selected ? (
              <div className="p-6 space-y-6">
                {/* Selected meal card */}
                <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <div className="aspect-[16/7] overflow-hidden bg-slate-100 dark:bg-slate-800">
                    <img
                      src={selected.image_url || FALLBACK_IMG}
                      alt={selected.meal_name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                          {selected.meal_name}
                        </h2>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {selected.category}
                          </span>
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {selected.dietary}
                          </span>
                          <span className="text-sm text-slate-500">
                            {selected.calories} kcal
                          </span>
                        </div>
                      </div>
                      <span className="text-2xl font-bold text-wellora">
                        ${selected.price.toFixed(2)}
                      </span>
                    </div>

                    {/* AI reason */}
                    <div className="mt-5 rounded-2xl bg-wellora/5 p-4 dark:bg-wellora/10">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="h-4 w-4 text-wellora" />
                        <span className="text-sm font-semibold text-wellora">
                          Why Claude recommends this
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                        {selected.reason}
                      </p>
                    </div>

                    {/* Calorie info */}
                    {result.calories_remaining > 0 && (
                      <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                        <Zap className="h-4 w-4 shrink-0 text-amber-500" />
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          You have{" "}
                          <span className="font-bold text-slate-900 dark:text-white">
                            {result.calories_remaining} kcal
                          </span>{" "}
                          remaining today. This meal uses{" "}
                          <span className="font-bold text-wellora">
                            {selected.calories} kcal
                          </span>
                          .
                        </p>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => onNavigate("user-menu-order")}
                      className="mt-5 w-full rounded-xl bg-wellora py-3 text-sm font-semibold text-white transition hover:bg-wellora-hover"
                    >
                      Order This Meal →
                    </button>
                  </div>
                </div>

                {/* AI Summary */}
                {result.ai_summary && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="h-5 w-5 text-wellora" />
                      <h3 className="font-semibold text-slate-900 dark:text-white">
                        Nutrition Summary
                      </h3>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                      {result.ai_summary}
                    </p>
                  </div>
                )}

                {/* Daily Tip */}
                {result.daily_tip && (
                  <div className="rounded-2xl border border-wellora/20 bg-wellora/5 p-5 dark:bg-wellora/10">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-4 w-4 text-wellora" />
                      <h3 className="font-semibold text-wellora">
                        Today's Wellness Tip
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
                    <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      {result.daily_tip}
                    </p>
                  </div>
                )}

                {/* Refresh */}
                <button
                  type="button"
                  onClick={loadRecommendations}
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  <Sparkles className="h-4 w-4" />
                  Refresh Recommendations
                </button>
              </div>
            ) : (
              !isLoading &&
              !error && (
                <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-wellora/10">
                    <Sparkles className="h-8 w-8 text-wellora" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-slate-700 dark:text-slate-300">
                      Your AI nutritionist is ready
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      Select a meal from the list or ask a question to get
                      started.
                    </p>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
