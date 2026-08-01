export const SESSION_EXPIRED_EVENT = "wellora:session-expired";

const SESSION_NOTICE_KEY = "wellora_session_notice";
const SESSION_EXPIRED_MESSAGE = "Your session expired. Please sign in again.";
const AUTH_STORAGE_KEYS = [
  "wellora_token",
  "wellora_user",
  "wellora_remember",
  "current-role",
  "vendor-status",
];

let handlingExpiry = false;

interface JwtPayload {
  exp?: number;
}

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const encodedPayload = token.split(".")[1];
    if (!encodedPayload) return null;

    const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const bytes = Uint8Array.from(window.atob(padded), (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as JwtPayload;
  } catch {
    return null;
  }
}

export function getStoredSessionExpiryMs(): number | null {
  const token = localStorage.getItem("wellora_token");
  if (!token) return null;

  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return 0;
  return payload.exp * 1000;
}

export function clearSessionForLogin(showExpiredNotice = false): void {
  AUTH_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  localStorage.setItem("current-page", "login");

  if (showExpiredNotice) {
    sessionStorage.setItem(SESSION_NOTICE_KEY, SESSION_EXPIRED_MESSAGE);
  }
}

export function expireUserSession(): void {
  if (handlingExpiry) return;
  handlingExpiry = true;

  clearSessionForLogin(true);
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));

  window.setTimeout(() => {
    handlingExpiry = false;
  }, 0);
}

export function consumeSessionNotice(): string {
  const notice = sessionStorage.getItem(SESSION_NOTICE_KEY) ?? "";
  sessionStorage.removeItem(SESSION_NOTICE_KEY);
  return notice;
}
