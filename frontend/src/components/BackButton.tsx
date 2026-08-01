import { ArrowLeft } from "lucide-react";
import type { AppPage } from "../types/page";

interface BackButtonProps {
  label?: string;
  to: AppPage;
  onNavigate: (page: AppPage) => void;
  className?: string;
}

export function BackButton({
  label = "Back",
  to,
  onNavigate,
  className = "",
}: BackButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(to)}
      aria-label={label}
      className={`inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wellora dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 ${className}`}
    >
      <ArrowLeft className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
