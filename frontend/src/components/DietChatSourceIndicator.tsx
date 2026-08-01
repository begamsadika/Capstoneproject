export type DietChatAnswerSource =
  | "bypass"
  | "knowledge_graph"
  | "medical_rag"
  | "chromadb"
  | "meal_planner"
  | "gemini"
  | "ollama";

interface SourceStyle {
  label: string;
  dot: string;
  ring: string;
}

const SOURCE_STYLES: Record<DietChatAnswerSource, SourceStyle> = {
  bypass: {
    label: "Quick response",
    dot: "bg-slate-400",
    ring: "ring-slate-200 dark:ring-slate-700",
  },
  knowledge_graph: {
    label: "Knowledge graph",
    dot: "bg-violet-500",
    ring: "ring-violet-200 dark:ring-violet-900",
  },
  medical_rag: {
    label: "Verified medical RAG",
    dot: "bg-teal-500",
    ring: "ring-teal-200 dark:ring-teal-900",
  },
  chromadb: {
    label: "Food semantic search",
    dot: "bg-emerald-500",
    ring: "ring-emerald-200 dark:ring-emerald-900",
  },
  meal_planner: {
    label: "Meal planner or logger",
    dot: "bg-orange-500",
    ring: "ring-orange-200 dark:ring-orange-900",
  },
  gemini: {
    label: "Gemini",
    dot: "bg-blue-500",
    ring: "ring-blue-200 dark:ring-blue-900",
  },
  ollama: {
    label: "Local Ollama",
    dot: "bg-amber-500",
    ring: "ring-amber-200 dark:ring-amber-900",
  },
};

interface DietChatSourceIndicatorProps {
  source?: DietChatAnswerSource;
  active?: boolean;
}

export function DietChatSourceIndicator({
  source,
  active = false,
}: DietChatSourceIndicatorProps) {
  const style = source ? SOURCE_STYLES[source] : {
    label: "Selecting answer source",
    dot: "bg-slate-300 dark:bg-slate-600",
    ring: "ring-slate-200 dark:ring-slate-700",
  };

  return (
    <span
      className="group/source relative inline-flex items-center"
      role="status"
      aria-label={`${style.label}${active ? ", processing" : ""}`}
    >
      <span
        className={`inline-flex items-center gap-1 rounded-full bg-white/80 px-1.5 py-1 ring-1 dark:bg-slate-900/70 ${style.ring}`}
        aria-hidden="true"
      >
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className={`h-1.5 w-1.5 rounded-full ${style.dot} ${
              !active && index > 0 ? "hidden" : "animate-pulse motion-reduce:animate-none"
            }`}
            style={active ? { animationDelay: `${index * 160}ms` } : undefined}
          />
        ))}
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-lg group-hover/source:block group-focus-within/source:block dark:bg-slate-100 dark:text-slate-900">
        {style.label}
      </span>
    </span>
  );
}
