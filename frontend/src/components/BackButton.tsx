import { ChevronLeft } from "lucide-react";
import type { AppPage } from "../types/page";

interface BackButtonProps {
  label?: string;
  to: AppPage;
  onNavigate: (page: AppPage) => void;
  className?: string;
}

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
