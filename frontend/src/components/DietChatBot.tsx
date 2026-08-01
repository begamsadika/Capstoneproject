import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, Send, X, Bot, Square, Trash2 } from "lucide-react";
import { getHealthMetrics, HealthMetrics } from "../api/health";
import { getUserProfile } from "../api/user";
import { getErrorMessage, getErrorName } from "../utils/apiError";

const STREAM_URL = "http://localhost:8001/chat/stream";
const MAX_HISTORY = 10;
const SESSION_KEY = "wellora_floating_chat";

interface Message {
  role: "user" | "bot";
  text: string;
  streaming?: boolean;
}

interface HistoryItem {
  role: "user" | "assistant";
  content: string;
}

function isHistoryItem(item: unknown): item is HistoryItem {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Partial<HistoryItem>;
  return (
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string"
  );
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

export function DietChatBot() {
  const [open, setOpen]         = useState(false);
  const [metrics, setMetrics]   = useState<HealthMetrics | null>(null);
  const userNameRef             = useRef<string>("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "bot", text: `${getTimeGreeting()}! I'm your Diet AI. Loading your profile…` },
  ]);
  const [input, setInput]           = useState("");
  const [streaming, setStreaming]   = useState(false);
  const [calorieOverride, setCalorieOverride] = useState<number | null>(null);
  const calorieOverrideRef      = useRef<number | null>(null);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const abortRef                = useRef<AbortController | null>(null);
  const historyRef              = useRef<HistoryItem[]>([]);

  // Restore session on mount, or fetch metrics and show greeting
  useEffect(() => {
    // Always fetch the user name so sendMessage can send it
    getUserProfile()
      .then((profile) => { userNameRef.current = (profile.name || "").split(" ")[0]; })
      .catch(() => undefined);

    try {
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        const { messages: savedMsgs, history: savedHistory, metricsSnapshot } = JSON.parse(saved);
        if (savedMsgs?.length > 1) {
          setMessages(savedMsgs.map((m: Message) => ({ ...m, streaming: false })));
          historyRef.current = Array.isArray(savedHistory)
            ? savedHistory.filter(isHistoryItem)
            : [];
          if (metricsSnapshot) setMetrics(metricsSnapshot);
          return;
        }
      }
    } catch {
      // Ignore malformed saved chat state and rebuild the greeting from the profile.
    }

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
    } catch {
      // Ignore storage write failures; chat can continue without persistence.
    }
  }, [messages, metrics]);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    // Add user message
    const userMsg: Message = { role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);

    // Track in history
    historyRef.current = [
      ...historyRef.current,
      { role: "user", content: text } satisfies HistoryItem,
    ].slice(-MAX_HISTORY);

    // Add streaming placeholder
    setMessages((prev) => [
      ...prev,
      { role: "bot", text: "", streaming: true },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(STREAM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: historyRef.current.slice(0, -1), // history before this message
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
          } catch (e: unknown) {
            if (getErrorMessage(e) !== "Unexpected end of JSON input") throw e;
          }
        }
      }

      // Mark streaming done
      setMessages((prev) => {
        const next = [...prev];
        const last = next.length - 1;
        next[last] = { ...next[last], streaming: false };
        return next;
      });

      // Save bot reply to history
      historyRef.current = [
        ...historyRef.current,
        { role: "assistant", content: botReply } satisfies HistoryItem,
      ].slice(-MAX_HISTORY);

      // If the bot reply contains a calculated calorie target, store it
      const calMatch = botReply.match(/New Daily Calorie Target[:\s*]+(\d{3,5})\s*cal/i);
      if (calMatch) {
        const val = parseInt(calMatch[1]);
        calorieOverrideRef.current = val;
        setCalorieOverride(val);
      }

    } catch (err: unknown) {
      if (getErrorName(err) === "AbortError") {
        // Stop button pressed — finalise whatever streamed so far
        setMessages((prev) => {
          const next = [...prev];
          const last = next.length - 1;
          if (next[last]?.streaming) {
            next[last] = { ...next[last], streaming: false };
          }
          return next;
        });
      } else {
        const errorMessage = getErrorMessage(err) ?? "";
        const msg = errorMessage.includes("fetch") || errorMessage.includes("Failed")
          ? "Cannot reach the Diet AI server. Make sure it is running on port 8001."
          : errorMessage;
        setMessages((prev) => {
          const next = [...prev];
          // Remove empty placeholder if no content arrived
          if (next[next.length - 1]?.text === "") next.pop();
          return [...next, { role: "bot", text: `⚠ ${msg}` }];
        });
      }
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, metrics]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const stopStreaming = () => abortRef.current?.abort();

  const clearChat = () => {
    sessionStorage.removeItem(SESSION_KEY);
    historyRef.current = [];
    calorieOverrideRef.current = null;
    setCalorieOverride(null);
    const greeting = metrics ? buildGreeting(metrics, userNameRef.current) : `${getTimeGreeting()}! I'm your Diet AI. Ask me anything!`;
    setMessages([{ role: "bot", text: greeting }]);
  };

  return (
    <>
      {/* ── Floating trigger button ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-wellora px-5 py-3 text-sm font-semibold text-white shadow-xl transition hover:bg-wellora-hover"
          aria-label="Open Diet AI Chat"
        >
          <MessageCircle className="w-5 h-5" />
          Diet AI
        </button>
      )}

      {/* ── Chat panel ── */}
      {open && (
        <div
          className="fixed bottom-6 right-6 z-50 flex w-80 flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          style={{ height: "480px" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between rounded-t-2xl bg-wellora px-4 py-3">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-white" />
              <div>
                <span className="text-sm font-semibold text-white">Diet AI</span>
                {metrics && (
                  <p className="text-[10px] text-white/70">
                    {metrics.health_goal?.replace(/_/g, " ")} · {calorieOverride ?? metrics.target_calories} kcal/day
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={clearChat}
                disabled={streaming}
                aria-label="Clear chat"
                title="Clear chat"
                className="rounded-full p-1 transition hover:bg-white/20 disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5 text-white" />
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="rounded-full p-0.5 transition hover:bg-white/20"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          {/* Message list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-line ${
                  msg.role === "user"
                    ? "ml-auto bg-wellora text-white"
                    : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
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
            ))}
            {streaming && messages[messages.length - 1]?.text === "" && (
              <div className="flex gap-1 px-3 py-2">
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="flex gap-2 border-t border-slate-200 dark:border-slate-700 p-3">
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
                onClick={stopStreaming}
                aria-label="Stop"
                className="flex items-center justify-center rounded-xl bg-red-500 px-3 py-2 text-white transition hover:bg-red-600"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={sendMessage}
                disabled={!input.trim()}
                aria-label="Send"
                className="flex items-center justify-center rounded-xl bg-wellora px-3 py-2 text-white transition hover:bg-wellora-hover disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Blinking cursor keyframe */}
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </>
  );
}
