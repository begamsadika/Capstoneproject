import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, Send, X, Bot, Square, Trash2, Plus } from "lucide-react";
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
const SESSION_KEY = "wellora_floating_chat";

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
  const [contextReady, setContextReady] = useState(false);
  const [conversations, setConversations] = useState<DietChatConversation[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [calorieOverride, setCalorieOverride] = useState<number | null>(null);
  const calorieOverrideRef      = useRef<number | null>(null);
  const messagesRef             = useRef<HTMLDivElement>(null);
  const abortRef                = useRef<AbortController | null>(null);
  const conversationIdRef      = useRef<number | null>(null);
  const historyRef              = useRef<HistoryItem[]>([]);

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
          return;
        }
      }
    } catch {}

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

  // Auto-scroll to latest message
  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;

    const frame = window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frame);
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
        const msg = err.message?.includes("fetch") || err.message?.includes("Failed")
          ? "Cannot reach the Wellora server. Please try again shortly."
          : err.message;
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
  }, [input, streaming]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const stopStreaming = () => abortRef.current?.abort();

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
                onClick={newChat}
                disabled={streaming}
                aria-label="New chat"
                title="New chat"
                className="rounded-full p-1 transition hover:bg-white/20 disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5 text-white" />
              </button>
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

          {conversations.length > 0 && (
            <div className="border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              <select
                value={conversationId ?? ""}
                onChange={(event) => openConversation(Number(event.target.value))}
                disabled={streaming}
                aria-label="Previous conversations"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <option value="" disabled>New conversation</option>
                {conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Message list */}
          <div ref={messagesRef} className="min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`max-w-[85%] text-sm leading-relaxed ${
                  msg.streaming && !msg.text
                    ? "px-1 py-2"
                    : msg.role === "user"
                      ? "ml-auto whitespace-pre-line rounded-2xl bg-wellora px-3 py-2 text-white"
                      : "rounded-2xl bg-slate-100 px-3 py-2 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
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
            ))}
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
