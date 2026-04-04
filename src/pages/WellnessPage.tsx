import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CircleDot,
  Droplets,
  Flower2,
  Heart,
  Milk,
  Moon,
  Salad,
  Scale,
  Smile,
  Soup,
  Sparkles,
  Target,
  UtensilsCrossed,
  Apple,
  Footprints,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AppPage } from '../types/page';
import { WelloraLogoMark } from '../components/WelloraLogoMark';

interface WellnessPageProps {
  onNavigate: (page: AppPage) => void;
}

const PROFILE_IMG =
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&h=120&q=80';

const CALORIES_CONSUMED = 1850;
const CALORIES_TARGET = 2200;
const PROGRESS = (CALORIES_CONSUMED / CALORIES_TARGET) * 100;

const MEALS = [
  {
    name: 'Oatmeal with Berries',
    time: '08:00 AM',
    kcal: 350,
    meal: 'Breakfast',
    Icon: Milk,
  },
  {
    name: 'Grilled Chicken Salad',
    time: '01:00 PM',
    kcal: 550,
    meal: 'Lunch',
    Icon: Salad,
  },
  {
    name: 'Apple & Almonds',
    time: '04:30 PM',
    kcal: 200,
    meal: 'Snack',
    Icon: Apple,
  },
  {
    name: 'Lentil Soup with Whole Grain Bread',
    time: '07:00 PM',
    kcal: 750,
    meal: 'Dinner',
    Icon: Soup,
  },
];

type WellnessTab = 'overview' | 'details';

const WEEK_DAYS: { label: string; status: 'good' | 'warn' | 'bad' }[] = [
  { label: 'Mon', status: 'good' },
  { label: 'Tue', status: 'warn' },
  { label: 'Wed', status: 'good' },
  { label: 'Thu', status: 'good' },
  { label: 'Fri', status: 'warn' },
  { label: 'Sat', status: 'bad' },
  { label: 'Sun', status: 'good' },
];

const AI_INSIGHTS: {
  Icon: LucideIcon;
  title: string;
  confidence: 'high' | 'medium';
  time: string;
  explore: string;
}[] = [
  {
    Icon: CircleDot,
    title: 'Your consistent hydration habits are improving skin elasticity.',
    confidence: 'high',
    time: 'Generated: 2 hours ago',
    explore: 'Explore Hydration Tips',
  },
  {
    Icon: Moon,
    title: 'Sleep onset has shifted 20 minutes earlier—correlated with better morning energy scores.',
    confidence: 'medium',
    time: 'Generated: 5 hours ago',
    explore: 'View Sleep Guidance',
  },
  {
    Icon: Apple,
    title: 'Fiber intake this week supports stable glucose patterns after meals.',
    confidence: 'high',
    time: 'Generated: Yesterday',
    explore: 'See Nutrition Ideas',
  },
  {
    Icon: Droplets,
    title: 'Mid-day water gaps on weekdays may affect focus—try a timed reminder.',
    confidence: 'medium',
    time: 'Generated: Yesterday',
    explore: 'Set Hydration Reminders',
  },
];

const WELLNESS_TIPS: {
  Icon: LucideIcon;
  title: string;
  body: string;
}[] = [
  {
    Icon: Moon,
    title: 'Prioritize Quality Sleep',
    body: 'Aim for 7–9 hours in a cool, dark room. Consistent wake times strengthen your circadian rhythm more than sleeping in on weekends.',
  },
  {
    Icon: Footprints,
    title: 'Stay Active Daily',
    body: 'Short walks after meals aid digestion and blood sugar. Even 10-minute movement blocks add up across the week.',
  },
  {
    Icon: Apple,
    title: 'Balanced Nutrition',
    body: 'Fill half your plate with vegetables, add lean protein, and choose whole grains when possible for steady energy.',
  },
  {
    Icon: Heart,
    title: 'Manage Stress Mindfully',
    body: 'Brief breathing exercises or stretching breaks can lower cortisol. Pair them with something you already do daily.',
  },
];

export function WellnessPage({ onNavigate }: WellnessPageProps) {
  const [tab, setTab] = useState<WellnessTab>('overview');

  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Top header */}
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto grid max-w-6xl grid-cols-3 items-center gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2 justify-self-start">
            <WelloraLogoMark size="sm" />
            <span className="text-lg font-semibold text-wellora">Wellora</span>
          </div>
          <div className="flex flex-col items-center justify-center justify-self-center">
            <div className="flex items-center gap-2 border-b-2 border-wellora pb-2 text-wellora">
              <Flower2 className="h-5 w-5" strokeWidth={2} />
              <span className="text-sm font-semibold sm:text-base">Wellness</span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 sm:gap-3">
            <button
              type="button"
              className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
            </button>
            <div className="relative">
              <img
                src={PROFILE_IMG}
                alt=""
                className="h-9 w-9 rounded-full object-cover ring-2 ring-slate-100 dark:ring-slate-700"
              />
              <span
                className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-wellora dark:border-slate-900"
                aria-hidden
              />
            </div>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="mx-auto flex max-w-6xl gap-0 border-t border-slate-100 px-4 dark:border-slate-800 sm:px-6">
          <button
            type="button"
            onClick={() => setTab('overview')}
            className={`relative px-4 py-3 text-sm font-semibold transition sm:px-5 sm:text-base ${
              tab === 'overview'
                ? 'text-wellora after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-wellora'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setTab('details')}
            className={`relative px-4 py-3 text-sm font-semibold transition sm:px-5 sm:text-base ${
              tab === 'details'
                ? 'text-wellora after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-wellora'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Details
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {tab === 'overview' ? (
          <>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => onNavigate('user-dashboard')}
                className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </button>
              <h1 className="text-3xl font-light tracking-tight text-slate-400 dark:text-slate-500 sm:text-4xl">
                Wellness Overview
              </h1>
            </div>

            <section className="mb-10">
              <h2 className="mb-5 text-lg font-semibold text-slate-800 dark:text-slate-200">
                Your Wellness at a Glance
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-wellora/10 text-wellora">
                    <Scale className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">Current BMI Status</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">22.5</p>
                  <span className="mt-3 inline-block rounded-full bg-wellora-soft px-3 py-1 text-xs font-semibold text-wellora-dark dark:bg-wellora/15 dark:text-wellora">
                    Normal Weight
                  </span>
                  <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">Last updated: Today, 8:00 AM</p>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-wellora/10 text-wellora">
                    <UtensilsCrossed className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">Calories Consumed Today</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">1850</p>
                  <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">Logged meals up to now.</p>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-wellora/10 text-wellora">
                    <Target className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">Daily Calorie Target</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">2200</p>
                  <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">Based on your activity goals.</p>
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-wellora/10 text-wellora">
                    <Smile className="h-5 w-5" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400">Wellness Status Indicator</p>
                  <p className="mt-2 text-xl font-bold leading-snug text-wellora sm:text-2xl">Active & Energized</p>
                  <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                    Excellent energy levels detected. Keep up the consistent activity!
                  </p>
                  <p className="mt-3 text-xs font-medium text-slate-400 dark:text-slate-500">AI-powered insight</p>
                </div>
              </div>
            </section>

            <section className="mb-12">
              <h2 className="mb-5 text-lg font-semibold text-slate-800 dark:text-slate-200">Daily Intake Summary</h2>
              <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Total Calories:</span>
                  <span className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                    {CALORIES_CONSUMED} / {CALORIES_TARGET} kcal
                  </span>
                </div>
                <div className="mt-4 h-4 overflow-hidden rounded-full bg-wellora-light dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-wellora transition-all"
                    style={{ width: `${Math.min(100, PROGRESS)}%` }}
                  />
                </div>
              </div>

              <ul className="mt-4 space-y-3">
                {MEALS.map(({ name, time, kcal, meal, Icon }) => (
                  <li
                    key={name}
                    className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:flex-nowrap sm:px-5"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-wellora/10 text-wellora">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 dark:text-white">{name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{time}</p>
                    </div>
                    <span className="text-base font-bold text-wellora">{kcal} kcal</span>
                    <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                      {meal}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <>
            <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => onNavigate('user-dashboard')}
                className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </button>
              <h1 className="text-3xl font-light tracking-tight text-slate-400 dark:text-slate-500 sm:text-4xl">
                Wellness Details
              </h1>
            </div>

            {/* Weekly Wellness Summary */}
            <section className="mb-10">
              <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">Weekly Wellness Summary</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Average Daily Calorie Intake</p>
                  <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900 dark:text-white">1,980 cal</p>
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Target: 2,000 kcal</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">BMI Trend</p>
                  <div className="mt-2 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
                      Stable
                      <ArrowRight className="h-5 w-5 text-slate-400" aria-hidden />
                    </div>
                    <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">24.5</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:px-6">
                <div className="flex justify-between gap-2 sm:gap-4">
                  {WEEK_DAYS.map(({ label, status }) => (
                    <div key={label} className="flex flex-col items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 sm:h-12 sm:w-12">
                        <span
                          className={`h-2.5 w-2.5 rounded-full sm:h-3 sm:w-3 ${
                            status === 'good'
                              ? 'bg-wellora'
                              : status === 'warn'
                                ? 'bg-amber-400'
                                : 'bg-red-500'
                          }`}
                          aria-hidden
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* AI Wellness Insights */}
            <section className="mb-10">
              <div className="mb-1 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-wellora" />
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">AI Wellness Insights</h2>
              </div>
              <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">Insights generated by Wellora AI.</p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {AI_INSIGHTS.map(({ Icon, title, confidence, time, explore }) => (
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
                          confidence === 'high'
                            ? 'bg-wellora-soft text-wellora-dark dark:bg-wellora/15 dark:text-wellora'
                            : 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200'
                        }`}
                      >
                        {confidence === 'high' ? 'High Confidence' : 'Medium Confidence'}
                      </span>
                    </div>
                    <p className="mt-4 text-sm font-semibold leading-snug text-slate-900 dark:text-white">{title}</p>
                    <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">{time}</p>
                    <button
                      type="button"
                      className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-wellora transition hover:text-wellora-hover"
                    >
                      {explore}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </article>
                ))}
              </div>
            </section>

            {/* Wellness Tips */}
            <section className="mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Wellness Tips</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">General wellness advice.</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {WELLNESS_TIPS.map(({ Icon, title, body }) => (
                  <article
                    key={title}
                    className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex items-center gap-2 text-wellora">
                      <Icon className="h-5 w-5 shrink-0" />
                      <h3 className="font-bold text-slate-900 dark:text-white">{title}</h3>
                    </div>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{body}</p>
                    <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">Non-AI Generated Content</p>
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
