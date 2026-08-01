import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";

interface DietChatMarkdownProps {
  content: string;
}

function normalizeDietMarkdown(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/^(\s*)•\s+/gm, "$1- ");
}

export function DietChatMarkdown({ content }: DietChatMarkdownProps) {
  return (
    <div className="min-w-0 break-words">
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="mb-2 mt-3 text-base font-bold text-slate-900 first:mt-0 dark:text-white">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-3 text-[15px] font-bold text-slate-900 first:mt-0 dark:text-white">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1.5 mt-3 text-sm font-semibold text-slate-900 first:mt-0 dark:text-white">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="mb-2 last:mb-0">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-slate-900 dark:text-slate-100">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="text-slate-600 dark:text-slate-300">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="mb-2 list-disc space-y-1 pl-5 marker:text-wellora">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-2 list-decimal space-y-1 pl-5 marker:font-semibold marker:text-wellora">
              {children}
            </ol>
          ),
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 rounded-r-lg border-l-2 border-wellora/50 bg-wellora/5 px-3 py-2 text-slate-600 dark:text-slate-300">
              {children}
            </blockquote>
          ),
          a: ({ children, ...props }: ComponentPropsWithoutRef<"a">) => (
            <a
              {...props}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-wellora underline decoration-wellora/30 underline-offset-2 hover:decoration-wellora"
            >
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded bg-slate-200/70 px-1 py-0.5 font-mono text-[0.9em] text-slate-800 dark:bg-slate-700 dark:text-slate-100">
              {children}
            </code>
          ),
          hr: () => <hr className="my-3 border-slate-200 dark:border-slate-700" />,
        }}
      >
        {normalizeDietMarkdown(content)}
      </ReactMarkdown>
    </div>
  );
}
