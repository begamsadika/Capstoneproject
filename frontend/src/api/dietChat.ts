import { API_BASE_URL } from "./client";
import { expireUserSession } from "../auth/session";

export interface DietChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface DietChatConversation {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface DietChatConversationDetail {
  conversation: DietChatConversation;
  messages: DietChatMessage[];
}

export interface DietChatStreamRequest {
  message: string;
  conversation_id?: number;
  calorie_target_override?: number;
}

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem("wellora_token");
  if (!token) {
    expireUserSession();
    throw new Error("Your session has expired. Please log in again.");
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function readApiError(response: Response): Promise<never> {
  if (response.status === 401) {
    expireUserSession();
    throw new Error("Your session has expired. Please log in again.");
  }

  const body = await response.json().catch(() => ({ detail: "Server error" }));
  throw new Error(body.detail || `HTTP ${response.status}`);
}

export async function getDietChatConversations(): Promise<DietChatConversation[]> {
  const response = await fetch(`${API_BASE_URL}/api/diet-chat/conversations`, {
    headers: getAuthHeaders(),
  });
  if (!response.ok) return readApiError(response);
  return response.json();
}

export async function createDietChatConversation(): Promise<DietChatConversation> {
  const response = await fetch(`${API_BASE_URL}/api/diet-chat/conversations`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({}),
  });
  if (!response.ok) return readApiError(response);
  return response.json();
}

export async function getDietChatConversation(
  conversationId: number,
): Promise<DietChatConversationDetail> {
  const response = await fetch(
    `${API_BASE_URL}/api/diet-chat/conversations/${conversationId}/messages`,
    { headers: getAuthHeaders() },
  );
  if (!response.ok) return readApiError(response);
  return response.json();
}

export async function deleteDietChatConversation(
  conversationId: number,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/diet-chat/conversations/${conversationId}`,
    { method: "DELETE", headers: getAuthHeaders() },
  );
  if (!response.ok) return readApiError(response);
}

export async function streamDietChat(
  body: DietChatStreamRequest,
  signal: AbortSignal,
): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}/api/diet-chat/stream`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (response.status === 401) {
    expireUserSession();
    throw new Error("Your session has expired. Please log in again.");
  }

  return response;
}
