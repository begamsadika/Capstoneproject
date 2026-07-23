interface DietChatMarkdownProps {
  content: string;
}

function normalizeDietMarkdown(content: string): string[] {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/^(\s*)â€¢\s+/gm, "$1- ")
    .split("\n");
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-slate-900 dark:text-slate-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

export function DietChatMarkdown({ content }: DietChatMarkdownProps) {
  const lines = normalizeDietMarkdown(content);

  return (
    <div className="min-w-0 break-words">
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={index} className="h-2" />;
        }

        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={index} className="mb-1.5 mt-3 text-sm font-semibold text-slate-900 first:mt-0 dark:text-white">
              {renderInline(trimmed.slice(4))}
            </h3>
          );
        }

        if (trimmed.startsWith("## ")) {
          return (
            <h2 key={index} className="mb-2 mt-3 text-[15px] font-bold text-slate-900 first:mt-0 dark:text-white">
              {renderInline(trimmed.slice(3))}
            </h2>
          );
        }

        if (trimmed.startsWith("# ")) {
          return (
            <h1 key={index} className="mb-2 mt-3 text-base font-bold text-slate-900 first:mt-0 dark:text-white">
              {renderInline(trimmed.slice(2))}
            </h1>
          );
        }

        if (trimmed.startsWith("- ")) {
          return (
            <div key={index} className="mb-1 flex gap-2 pl-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-wellora" />
              <span>{renderInline(trimmed.slice(2))}</span>
            </div>
          );
        }

        return (
          <p key={index} className="mb-2 last:mb-0">
            {renderInline(trimmed)}
          </p>
        );
      })}
    </div>
  );
}
