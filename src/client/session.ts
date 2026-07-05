import type { UserSession } from "../shared/types";

export const SESSION_STORAGE_KEY = "lgm-session";
const ACTIVITY_STORAGE_KEY = "lgm-last-activity";
export const INACTIVITY_TIMEOUT_MS = 8 * 60 * 60 * 1000;

export type StoredSession = UserSession & {
  savedAt: number;
};

export function readStoredSession(): StoredSession | null {
  const saved = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved) as StoredSession;
  } catch {
    return null;
  }
}

export function persistSession(session: UserSession) {
  const stored: StoredSession = { ...session, savedAt: Date.now() };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stored));
  touchSessionActivity();
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(ACTIVITY_STORAGE_KEY);
}

export function touchSessionActivity() {
  localStorage.setItem(ACTIVITY_STORAGE_KEY, String(Date.now()));
}

function tokenExpiresAt(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? "")) as { exp?: number };
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function getSessionExpiryReason(session: UserSession): "expired" | "inactive" | null {
  const expiresAt = tokenExpiresAt(session.token);
  if (expiresAt && Date.now() >= expiresAt) return "expired";

  const lastActivity = Number(localStorage.getItem(ACTIVITY_STORAGE_KEY) || 0);
  if (lastActivity && Date.now() - lastActivity > INACTIVITY_TIMEOUT_MS) return "inactive";

  return null;
}

export function sessionExpiryMessage(reason: "expired" | "inactive") {
  if (reason === "expired") {
    return "Your login session expired. Please sign in again or logout to use another account.";
  }
  return "You were signed out after a long period of inactivity. Please sign in again or logout to use another account.";
}
