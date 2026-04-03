import { useMemo, useState } from 'react';
import {
  Bell,
  LayoutGrid,
  LogOut,
  ShoppingCart,
  Star,
  Flower2,
} from 'lucide-react';
import type { AppPage } from '../types/page';
import { WelloraLogoMark } from '../components/WelloraLogoMark';

interface MealRecommendationsPageProps {
  onNavigate: (page: AppPage) => void;
}

type FitnessGoal = 'loss' | 'gain' | 'maintain';
type Dietary = 'vegetarian' | 'vegan' | 'gluten-free' | 'keto' | 'paleo';

interface Recommendation {
  id: string;
  title: string;
  kcal: number;
  badge: string;
  aiSays: string;
  image: string;
  dietaries: Dietary[];
  goals: FitnessGoal[];
}

const RECOMMENDATIONS: Recommendation[] = [
  {
    id: '1',
    title: 'Lentil Soup with Whole Grain Bread',
    kcal: 350,
    badge: 'Vegetarian',
    aiSays:
      'Hearty and nutritious, providing a good balance of protein and carbohydrates.',
    image: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=900&q=85',
    dietaries: ['vegetarian', 'vegan'],
    goals: ['loss', 'maintain'],
  },
  {
    id: '2',
    title: 'Grilled Chicken with Sweet Potato',
    kcal: 480,
    badge: 'Gluten-Free',
    aiSays: 'High in lean protein and complex carbs to support muscle recovery and steady energy.',
    image: 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=900&q=85',
    dietaries: ['gluten-free', 'keto', 'paleo'],
    goals: ['gain', 'maintain'],
  },
  {
    id: '3',
    title: 'Chickpea Buddha Bowl',
    kcal: 420,
    badge: 'Vegan',
    aiSays: 'Plant-powered bowl rich in fiber and micronutrients—great for everyday wellness.',
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=900&q=85',
    dietaries: ['vegan', 'vegetarian', 'gluten-free'],
    goals: ['loss', 'maintain'],
  },
  {
    id: '4',
    title: 'Salmon & Avocado Plate',
    kcal: 520,
    badge: 'Keto',
    aiSays: 'Omega-3s and healthy fats aligned with low-carb, high-satiety goals.',
    image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=900&q=85',
    dietaries: ['keto', 'paleo', 'gluten-free'],
    goals: ['gain', 'maintain', 'loss'],
  },
  {
    id: '5',
    title: 'Herb-Roasted Turkey & Greens',
    kcal: 410,
    badge: 'Paleo',
    aiSays: 'Clean protein with leafy greens—minimal processing, maximum nutrient density.',
    image: 'https://images.unsplash.com/photo-1432139555190-58524dae6a55?auto=format&fit=crop&w=900&q=85',
    dietaries: ['paleo', 'gluten-free'],
    goals: ['loss', 'maintain'],
  },
];

const FITNESS_OPTIONS: { value: FitnessGoal; label: string }[] = [
  { value: 'loss', label: 'Weight Loss' },
  { value: 'gain', label: 'Muscle Gain' },
  { value: 'maintain', label: 'Maintenance' },
];

const DIETARY_OPTIONS: { value: Dietary; label: string }[] = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'gluten-free', label: 'Gluten-Free' },
  { value: 'keto', label: 'Keto' },
  { value: 'paleo', label: 'Paleo' },
];

const PROFILE_IMG =
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&h=120&q=80';

export function MealRecommendationsPage({ onNavigate }: MealRecommendationsPageProps) {
  const [fitnessGoal, setFitnessGoal] = useState<FitnessGoal>('loss');
  const [dietary, setDietary] = useState<Dietary>('vegetarian');

  const activeRec = useMemo(() => {
    const full = RECOMMENDATIONS.find(
      (r) => r.dietaries.includes(dietary) && r.goals.includes(fitnessGoal),
    );
    if (full) return full;
    const byDiet = RECOMMENDATIONS.find((r) => r.dietaries.includes(dietary));
    if (byDiet) return byDiet;
    return RECOMMENDATIONS[0];
  }, [dietary, fitnessGoal]);

  return (
    <div className="flex min-h-dvh flex-col bg-slate-200/80 py-3 pl-5 pr-3 dark:bg-slate-950 sm:py-4 sm:pl-8 sm:pr-4 lg:h-dvh lg:max-h-dvh lg:overflow-hidden lg:pl-10 lg:pr-6 xl:pl-12">
      <div className="mr-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-4 sm:flex-row sm:gap-5 lg:gap-6">
        {/* Sidebar — own card, separate from main */}
        <aside className="hidden w-64 shrink-0 flex-col rounded-2xl border border-slate-200/90 bg-white py-6 pl-5 pr-4 shadow-lg dark:border-slate-700 dark:bg-slate-900 sm:flex sm:min-h-0 sm:overflow-y-auto lg:w-72 lg:pl-6 lg:pr-5">
          <div className="mb-8 flex items-center gap-2 border-b border-violet-200/60 pb-6 pl-0.5 dark:border-violet-900/40">
            <WelloraLogoMark size="md" />
            <span className="text-lg font-semibold tracking-tight text-wellora">Wellora</span>
          </div>
          <nav className="flex flex-1 flex-col space-y-1">
            <button
              type="button"
              onClick={() => onNavigate('user-dashboard')}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <LayoutGrid className="h-4 w-4 shrink-0 text-slate-500" />
              Dashboard
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5 text-left text-sm font-semibold text-slate-900 dark:bg-slate-800 dark:text-white"
            >
              <Star className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300" />
              Meal Recommendations
            </button>
            <button
              type="button"
              onClick={() => onNavigate('user-menu-order')}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <ShoppingCart className="h-4 w-4 shrink-0 text-slate-500" />
              Menu & Order
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Flower2 className="h-4 w-4 shrink-0 text-slate-500" />
              Wellness
            </button>
          </nav>
          <button
            type="button"
            onClick={() => onNavigate('login')}
            className="mt-6 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-rose-500 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Log Out
          </button>
        </aside>

        {/* Main: header + Recommended for You — separate card */}
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
                aria-label="Notifications"
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
              onClick={() => onNavigate('user-dashboard')}
              className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium text-slate-600"
            >
              Dashboard
            </button>
            <span className="shrink-0 rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-900 dark:bg-slate-800 dark:text-white">
              Meals
            </span>
            <button
              type="button"
              onClick={() => onNavigate('user-menu-order')}
              className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium text-slate-600"
            >
              Menu
            </button>
          </div>

          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/80 p-5 dark:bg-slate-950/40 sm:p-6 lg:p-8">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              Recommended for You
            </h1>

            <div className="mt-6 grid gap-5 sm:mt-8 sm:gap-6 lg:min-h-0 lg:grid-cols-[minmax(220px,260px)_minmax(0,1fr)] lg:items-stretch xl:gap-8">
              {/* Filters — own card */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-md dark:border-slate-700 dark:bg-slate-900 sm:p-6 lg:max-h-full lg:overflow-y-auto lg:pr-1">
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
                </div>
              </div>

              {/* Meal recommendation — own card */}
              <article className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md dark:border-slate-700 dark:bg-slate-900 lg:max-h-[min(100%,calc(100dvh-14rem))]">
                <div className="aspect-[16/10] max-h-[min(52vw,280px)] shrink-0 overflow-hidden bg-slate-100 sm:max-h-[min(42vw,320px)] lg:aspect-auto lg:max-h-[min(38vh,340px)] lg:min-h-[200px] dark:bg-slate-800">
                  <img
                    src={activeRec.image}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white">{activeRec.title}</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="text-sm text-slate-500 dark:text-slate-400">{activeRec.kcal} kcal</span>
                    <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {activeRec.badge}
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    <span className="font-medium text-slate-700 dark:text-slate-300">AI Says: </span>
                    {activeRec.aiSays}
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('user-menu-order')}
                    className="mt-6 w-full rounded-xl bg-wellora py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-wellora-hover"
                  >
                    Add to Order
                  </button>
                </div>
              </article>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
