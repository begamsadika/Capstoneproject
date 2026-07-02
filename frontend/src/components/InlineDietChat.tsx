import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, Sparkles, Square, Trash2 } from "lucide-react";
import { getHealthMetrics, HealthMetrics } from "../api/health";
import { getUserProfile } from "../api/user";

const STREAM_URL = "http://localhost:8001/chat/stream";
const MAX_HISTORY = 10;
const SESSION_KEY = "wellora_inline_chat";

interface Message {
  role: "user" | "bot";
  text: string;
  streaming?: boolean;
}

interface HistoryItem {
  role: "user" | "assistant";
  content: string;
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5  && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
}

const GOAL_LABELS: Record<string, string> = {
  lose: "Lose weight",
  gain: "Gain weight",
  maintain: "Maintain weight",
};

const ALLERGY_LABELS: Record<string, string> = {
  nut: "Nuts", dairy: "Dairy", gluten: "Gluten",
  seafood: "Seafood", egg: "Eggs", soy: "Soy",
};

function normaliseAllergyDisplay(raw: string): string {
  return raw
    .split(",")
    .map((a) => {
      const key = a.trim().toLowerCase();
      // canonical check first, then fuzzy label lookup
      return ALLERGY_LABELS[key] ?? (key.includes("nut") ? "Nuts"
        : key.includes("dairy") || key.includes("lactose") ? "Dairy"
        : key.includes("gluten") ? "Gluten"
        : a.trim());
    })
    .join(", ");
}

function buildGreeting(m: HealthMetrics, firstName: string): string {
  const timeGreet  = getTimeGreeting();
  const name       = firstName ? `, ${firstName}` : "";
  const rawGoal    = (m.health_goal || "").toLowerCase().replace(/_/g, " ").trim();
  const goalLabel  = GOAL_LABELS[rawGoal] ?? (rawGoal || "your health goal");
  const diet       = m.dietary_preference
    ? `• Diet: ${m.dietary_preference.charAt(0).toUpperCase() + m.dietary_preference.slice(1)}\n`
    : "";
  const allergy    = m.allergies
    ? `• Avoiding: ${normaliseAllergyDisplay(m.allergies)}\n`
    : "";

  return (
    `${timeGreet}${name}! 👋 I'm your Diet AI.\n\n` +
    `Based on your profile:\n` +
    `• Goal: ${goalLabel}\n` +
    diet +
    allergy +
    `• Calorie target: ${m.target_calories} kcal/day\n` +
    `• Macros — Protein: ${m.protein_target_g}g | Carbs: ${m.carbs_target_g}g | Fat: ${m.fat_target_g}g\n\n` +
    `Ask me anything about diet, nutrition, or food recommendations!`
  );
}

const QUICK_PROMPTS = [
  "What should I eat for dinner?",
  "Foods to avoid for my condition",
  "High protein meal ideas",
  "Low calorie snack options",
  "How many carbs should I eat?",
];

export function InlineDietChat() {
  const [metrics, setMetrics]         = useState<HealthMetrics | null>(null);
  const userNameRef                   = useRef<string>("");
  const [messages, setMessages]       = useState<Message[]>([]);
  const [input, setInput]             = useState("");
  const [streaming, setStreaming]     = useState(false);
  const [calorieOverride, setCalorieOverride] = useState<number | null>(null);
  const calorieOverrideRef            = useRef<number | null>(null);
  const bottomRef                     = useRef<HTMLDivElement>(null);
  const abortRef                      = useRef<AbortController | null>(null);
  const historyRef                    = useRef<HistoryItem[]>([]);

  // Restore session on mount, or fetch metrics and show greeting
  useEffect(() => {
    // Always fetch the user name so sendMessage can send it
    getUserProfile()
      .then((profile) => { userNameRef.current = (profile.name || "").split(" ")[0]; })
      .catch(() => {});

    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        const { messages: savedMsgs, history: savedHistory, metricsSnapshot } = JSON.parse(saved);
        if (savedMsgs?.length > 1) {
          setMessages(savedMsgs.map((m: Message) => ({ ...m, streaming: false })));
          historyRef.current = savedHistory || [];
          if (metricsSnapshot) setMetrics(metricsSnapshot);
          return; // skip greeting — we already have a conversation
        }
      }
    } catch {}

    // No saved session — fetch metrics + name and show greeting
    Promise.all([getHealthMetrics(), getUserProfile()])
      .then(([m, profile]) => {
        setMetrics(m);
        const firstName = (profile.name || "").split(" ")[0];
        userNameRef.current = firstName;
        setMessages([{ role: "bot", text: buildGreeting(m, firstName) }]);
      })
      .catch(() => {
        const timeGreet = getTimeGreeting();
        setMessages([{
          role: "bot",
          text: `${timeGreet}! I'm your Diet AI. Ask me anything about food, nutrition, or dietary advice!`,
        }]);
      });
  }, []);

  // Save conversation to sessionStorage whenever messages change
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        messages: messages.filter((m) => !m.streaming),
        history:  historyRef.current,
        metricsSnapshot: metrics,
      }));
    } catch {}
  }, [messages, metrics]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const sendMessage = useCallback(async (quickText?: string) => {
    const text = (quickText ?? input).trim();
    if (!text || streaming) return;

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setStreaming(true);

    // Track history
    historyRef.current = [
      ...historyRef.current,
      { role: "user", content: text },
    ].slice(-MAX_HISTORY);

    // Streaming placeholder
    setMessages((prev) => [...prev, { role: "bot", text: "", streaming: true }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(STREAM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: historyRef.current.slice(0, -1),
          user_metrics: metrics ?? undefined,
          calorie_target_override: calorieOverrideRef.current ?? undefined,
          user_name: userNameRef.current || undefined,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Server error" }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let botReply = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const { token, error: srvErr } = JSON.parse(payload);
            if (srvErr) throw new Error(srvErr);
            if (token) {
              botReply += token;
              setMessages((prev) => {
                const next = [...prev];
                const last = next.length - 1;
                next[last] = { ...next[last], text: botReply };
                return next;
              });
            }
          } catch (e: any) {
            if (e.message !== "Unexpected end of JSON input") throw e;
          }
        }
      }

      setMessages((prev) => {
        const next = [...prev];
        const last = next.length - 1;
        next[last] = { ...next[last], streaming: false };
        return next;
      });

      historyRef.current = [
        ...historyRef.current,
        { role: "assistant", content: botReply },
      ].slice(-MAX_HISTORY);

      // If the bot reply contains a calculated calorie target, store it
      const calMatch = botReply.match(/New Daily Calorie Target[:\s*]+(\d{3,5})\s*cal/i);
      if (calMatch) {
        const val = parseInt(calMatch[1]);
        calorieOverrideRef.current = val;
        setCalorieOverride(val);
      }

    } catch (err: any) {
      if (err.name === "AbortError") {
        setMessages((prev) => {
          const next = [...prev];
          const last = next.length - 1;
          if (next[last]?.streaming) next[last] = { ...next[last], streaming: false };
          return next;
        });
      } else {
        const msg = err.message?.includes("fetch") || err.message?.includes("Failed")
          ? "Cannot reach the Diet AI server. Make sure it is running on port 8001."
          : err.message;
        setMessages((prev) => {
          const next = [...prev];
          if (next[next.length - 1]?.text === "") next.pop();
          return [...next, { role: "bot", text: `⚠ ${msg}` }];
        });
      }
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, metrics]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") sendMessage();
  };

  const clearChat = () => {
    sessionStorage.removeItem(SESSION_KEY);
    historyRef.current = [];
    calorieOverrideRef.current = null;
    setCalorieOverride(null);
    const greeting = buildGreeting(metrics!, userNameRef.current);
    setMessages([{ role: "bot", text: metrics ? greeting : `${getTimeGreeting()}! I'm your Diet AI. Ask me anything!` }]);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header bar */}
      <div className="shrink-0 flex items-center gap-2 border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
        <Bot className="h-4 w-4 text-wellora" />
        <span className="text-sm font-semibold text-slate-900 dark:text-white">Diet AI</span>
        {metrics && (
          <span className="rounded-full bg-wellora/10 px-2.5 py-0.5 text-xs font-medium text-wellora">
            {metrics.health_goal?.replace(/_/g, " ")} · {metrics.target_calories} kcal
          </span>
        )}
        <button
          onClick={clearChat}
          disabled={streaming}
          title="Clear chat"
          className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-950/30"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 p-4 bg-slate-50 dark:bg-slate-950/40">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "bot" && (
              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-wellora/10">
                <Sparkles className="h-3.5 w-3.5 text-wellora" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                msg.role === "user"
                  ? "bg-wellora text-white"
                  : "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700"
              }`}
            >
              {msg.text}
              {msg.streaming && (
                <span
                  style={{
                    display: "inline-block",
                    width: 2,
                    height: 13,
                    background: "currentColor",
                    marginLeft: 2,
                    verticalAlign: "middle",
                    opacity: 0.7,
                    animation: "blink 0.8s step-end infinite",
                  }}
                />
              )}
            </div>
          </div>
        ))}

        {/* Typing dots — show only when streaming but no text yet */}
        {streaming && messages[messages.length - 1]?.text === "" && (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-wellora/10">
              <Sparkles className="h-3.5 w-3.5 text-wellora" />
            </div>
            <div className="flex gap-1 rounded-2xl bg-white px-3.5 py-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompt chips */}
      <div className="shrink-0 flex flex-wrap gap-1.5 border-t border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
        {QUICK_PROMPTS.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => sendMessage(q)}
            disabled={streaming}
            className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-wellora hover:text-wellora disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input bar */}
      <div className="shrink-0 flex gap-2 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about your diet…"
          disabled={streaming}
          className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition focus:border-wellora dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
        />
        {streaming ? (
          <button
            onClick={() => abortRef.current?.abort()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white transition hover:bg-red-600"
            aria-label="Stop"
          >
            <Square className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-wellora text-white transition hover:bg-wellora-hover disabled:opacity-50"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        )}
      </div>

      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </div>
  );
}
