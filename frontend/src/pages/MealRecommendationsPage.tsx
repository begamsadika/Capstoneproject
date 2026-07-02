import { LayoutGrid, Settings, ShoppingCart, Star, Flower2 } from "lucide-react";
import type { AppPage } from "../types/page";
import { WelloraLogoMark } from "../components/WelloraLogoMark";
import { InlineDietChat } from "../components/InlineDietChat";

interface MealRecommendationsPageProps {
  onNavigate: (page: AppPage) => void;
}

export function MealRecommendationsPage({ onNavigate }: MealRecommendationsPageProps) {
  const navCls = (active: boolean) =>
    active
      ? "flex w-full items-center gap-3 rounded-xl bg-slate-100 px-3 py-2.5 text-left text-sm font-semibold text-slate-900 dark:bg-slate-800 dark:text-white"
      : "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800";

  return (
    <div className="flex h-dvh bg-slate-100 dark:bg-slate-950 overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6 dark:border-slate-800 dark:bg-slate-900 lg:flex">
        <div className="mb-8 flex items-center gap-2 px-1">
          <WelloraLogoMark size="md" />
          <span className="text-lg font-semibold tracking-tight text-wellora">Wellora</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          <button type="button" onClick={() => onNavigate("user-dashboard")} className={navCls(false)}>
            <LayoutGrid className="h-4 w-4 shrink-0" /> Dashboard
          </button>
          <button type="button" className={navCls(true)}>
            <Star className="h-4 w-4 shrink-0" /> Meal Recommendations
          </button>
          <button type="button" onClick={() => onNavigate("user-menu-order")} className={navCls(false)}>
            <ShoppingCart className="h-4 w-4 shrink-0" /> Menu & Order
          </button>
          <button type="button" onClick={() => onNavigate("user-wellness")} className={navCls(false)}>
            <Flower2 className="h-4 w-4 shrink-0" /> Wellness
          </button>
        </nav>
        <button type="button" onClick={() => onNavigate("user-settings")} className={navCls(false)}>
          <Settings className="h-4 w-4 shrink-0" /> Settings
        </button>
      </aside>

      {/* ── Main ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <InlineDietChat />
      </div>

    </div>
  );
}
