import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Plus, Send, Sparkles, Square, Trash2 } from "lucide-react";
import { getHealthMetrics, HealthMetrics } from "../api/health";
import { getUserProfile } from "../api/user";
import {
  deleteDietChatConversation,
  DietChatConversation,
  getDietChatConversation,
  getDietChatConversations,
  streamDietChat,
} from "../api/dietChat";
import { DietChatLoadingStatus } from "./DietChatLoadingStatus";
import { DietChatMarkdown } from "./DietChatMarkdown";
import {
  DietChatAnswerSource,
  DietChatSourceIndicator,
} from "./DietChatSourceIndicator";

const MAX_HISTORY = 10;
const SESSION_KEY = "wellora_inline_chat";

interface Message {
  role: "user" | "bot";
  text: string;
  streaming?: boolean;
  loadingQuestion?: string;
  sources?: DietChatAnswerSource[];
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
  const [contextReady, setContextReady] = useState(false);
  const [conversations, setConversations] = useState<DietChatConversation[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [calorieOverride, setCalorieOverride] = useState<number | null>(null);
  const calorieOverrideRef            = useRef<number | null>(null);
  const messagesRef                   = useRef<HTMLDivElement>(null);
  const abortRef                      = useRef<AbortController | null>(null);
  const conversationIdRef            = useRef<number | null>(null);
  const historyRef                    = useRef<HistoryItem[]>([]);
  const historyRef                   = useRef<HistoryItem[]>([]);

  const greetingMessage = useCallback((): Message => ({
    role: "bot",
    text: metrics
      ? buildGreeting(metrics, userNameRef.current)
      : `${getTimeGreeting()}! I'm your Diet AI. Ask me anything about food, nutrition, or dietary advice!`,
  }), [metrics]);

  const openConversation = useCallback(async (id: number) => {
    const detail = await getDietChatConversation(id);
    conversationIdRef.current = id;
    setConversationId(id);
    setMessages([
      greetingMessage(),
      ...detail.messages.map((message): Message => ({
        role: message.role === "assistant" ? "bot" : "user",
        text: message.content,
      })),
    ]);
  }, [greetingMessage]);

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
          historyRef.current = Array.isArray(savedHistory)
            ? savedHistory.filter(isHistoryItem)
            : [];
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
      .catch(() => setMessages([{
        role: "bot",
        text: `${getTimeGreeting()}! I'm your Diet AI. Ask me anything about food, nutrition, or dietary advice!`,
      }]))
      .finally(() => setContextReady(true));
  }, []);

  useEffect(() => {
    if (!contextReady) return;
    getDietChatConversations()
      .then(async (items) => {
        setConversations(items);
        if (items.length > 0) await openConversation(items[0].id);
        else setMessages([greetingMessage()]);
      })
      .catch(() => setMessages([greetingMessage()]));
  }, [contextReady, greetingMessage, openConversation]);

  // Auto-scroll
  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;

    const frame = window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frame);
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
      { role: "user", content: text } satisfies HistoryItem,
    ].slice(-MAX_HISTORY);

    // Streaming placeholder
    setMessages((prev) => [
      ...prev,
      { role: "bot", text: "", streaming: true, loadingQuestion: text },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await streamDietChat(
        {
          message: text,
          conversation_id: conversationIdRef.current ?? undefined,
          calorie_target_override: calorieOverrideRef.current ?? undefined,
        },
        controller.signal,
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Server error" }));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const returnedConversationId = Number(res.headers.get("X-Conversation-Id"));
      if (Number.isInteger(returnedConversationId) && returnedConversationId > 0) {
        conversationIdRef.current = returnedConversationId;
        setConversationId(returnedConversationId);
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
            const {
              token,
              error: srvErr,
              answer_source: answerSource,
              answer_sources: answerSources,
            } = JSON.parse(payload) as {
              token?: string;
              error?: string;
              answer_source?: DietChatAnswerSource;
              answer_sources?: DietChatAnswerSource[];
            };
            if (srvErr) throw new Error(srvErr);
            const sources = answerSources ?? (answerSource ? [answerSource] : undefined);
            if (sources?.length) {
              setMessages((prev) => {
                const next = [...prev];
                const last = next.length - 1;
                next[last] = { ...next[last], sources };
                return next;
              });
            }
            if (token) {
              botReply += token;
              setMessages((prev) => {
                const next = [...prev];
                const last = next.length - 1;
                next[last] = { ...next[last], text: botReply };
                return next;
              });
            }
          } catch (error: unknown) {
            if (!(error instanceof Error) || error.message !== "Unexpected end of JSON input") {
              throw error;
            }
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
        { role: "assistant", content: botReply } satisfies HistoryItem,
      ].slice(-MAX_HISTORY);
      getDietChatConversations().then(setConversations).catch(() => {});

      // If the bot reply contains a calculated calorie target, store it
      const calMatch = botReply.match(/New Daily Calorie Target[:\s*]+(\d{3,5})\s*cal/i);
      if (calMatch) {
        const val = parseInt(calMatch[1]);
        calorieOverrideRef.current = val;
        setCalorieOverride(val);
      }

    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error("Unexpected chat error");
      if (err.name === "AbortError") {
        setMessages((prev) => {
          const next = [...prev];
          const last = next.length - 1;
          if (next[last]?.streaming) next[last] = { ...next[last], streaming: false };
          return next;
        });
      } else {
        const msg = err.message?.includes("fetch") || err.message?.includes("Failed")
          ? "Cannot reach the Wellora server. Please try again shortly."
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
  }, [input, streaming]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") sendMessage();
  };

  const newChat = () => {
    conversationIdRef.current = null;
    setConversationId(null);
    calorieOverrideRef.current = null;
    setCalorieOverride(null);
    setMessages([greetingMessage()]);
  };

  const clearChat = async () => {
    const id = conversationIdRef.current;
    if (id) {
      await deleteDietChatConversation(id);
      setConversations((items) => items.filter((item) => item.id !== id));
    }
    newChat();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header bar */}
      <div className="shrink-0 flex items-center gap-2 border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
        <Bot className="h-4 w-4 text-wellora" />
        <span className="text-sm font-semibold text-slate-900 dark:text-white">Diet AI</span>
        {metrics && (
          <span className="rounded-full bg-wellora/10 px-2.5 py-0.5 text-xs font-medium text-wellora">
            {metrics.health_goal?.replace(/_/g, " ")} · {calorieOverride ?? metrics.target_calories} kcal
          </span>
        )}
        {conversations.length > 0 && (
          <select
            value={conversationId ?? ""}
            onChange={(event) => openConversation(Number(event.target.value))}
            disabled={streaming}
            aria-label="Previous conversations"
            className="ml-auto max-w-44 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <option value="" disabled>New conversation</option>
            {conversations.map((conversation) => (
              <option key={conversation.id} value={conversation.id}>
                {conversation.title}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={newChat}
          disabled={streaming}
          title="New chat"
          className={`${conversations.length === 0 ? "ml-auto" : ""} flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-wellora/10 hover:text-wellora disabled:opacity-40`}
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
        <button
          onClick={clearChat}
          disabled={streaming}
          title="Clear chat"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-950/30"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>

      {/* Messages */}
      <div ref={messagesRef} className="min-h-0 flex-1 overflow-y-auto space-y-3 p-4 bg-slate-50 dark:bg-slate-950/40">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "bot" && !(msg.streaming && !msg.text) && (
              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-wellora/10">
                <Sparkles className="h-3.5 w-3.5 text-wellora" />
              </div>
            )}
            <div
              className={`max-w-[80%] text-sm leading-relaxed ${
                msg.streaming && !msg.text
                  ? "px-0 py-2"
                  : msg.role === "user"
                    ? "whitespace-pre-line rounded-2xl bg-wellora px-3.5 py-2.5 text-white"
                    : "rounded-2xl bg-white px-3.5 py-2.5 text-slate-800 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700"
              }`}
            >
              {msg.streaming && !msg.text ? (
                <DietChatLoadingStatus
                  question={msg.loadingQuestion ?? ""}
                  sources={msg.sources}
                />
              ) : msg.role === "bot" ? (
                <DietChatMarkdown content={msg.text} />
              ) : msg.text}
              {msg.streaming && Boolean(msg.text) && (
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
              {msg.role === "bot" && msg.sources?.length && Boolean(msg.text) && (
                <div className="mt-2 flex justify-end gap-1">
                  {msg.sources.map((source) => (
                    <DietChatSourceIndicator
                      key={source}
                      source={source}
                      active={msg.streaming}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

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
