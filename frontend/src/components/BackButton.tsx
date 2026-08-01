import { ArrowLeft } from "lucide-react";
import { ChevronLeft } from "lucide-react";
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
export function BackButton({ label = "Back", to, onNavigate, className = "" }: BackButtonProps) {
  return (
    <button
      onClick={() => onNavigate(to)}
      className={`flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors ${className}`}
    >
      <ChevronLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
