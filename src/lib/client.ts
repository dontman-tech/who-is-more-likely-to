import type { PublicRoom, RoomConfig } from "@domain/types";
import type { QuestionPack } from "@domain/packs";

export interface Session {
  code: string;
  token: string;
  name: string;
  playerId: string;
}

const SESSION_KEY = "mlt.session";

/**
 * The session is persisted so a refresh, a background tab, or a phone lock
 * never costs the player their seat or their vote. This is the client half
 * of the rejoin contract the server already supports.
 */
export function saveSession(session: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* private mode — the game still works, it just will not survive a reload */
  }
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((data as { error?: string }).error ?? "Request failed.", res.status);
  }
  return data as T;
}

export function createRoom(
  hostName: string,
  options?: { packId?: string; customPrompts?: string[]; config?: Partial<RoomConfig> },
): Promise<{ room: PublicRoom; token: string }> {
  return request("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hostName,
      packId: options?.packId,
      customPrompts: options?.customPrompts,
      config: options?.config,
    }),
  });
}

export function listPacks(): Promise<{ packs: QuestionPack[] }> {
  return request("/api/packs");
}

export function joinRoom(
  code: string,
  payload: { name?: string; token?: string },
): Promise<{ room: PublicRoom; token: string }> {
  return request(`/api/rooms/${encodeURIComponent(code)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function fetchRoom(code: string, token: string): Promise<{ room: PublicRoom }> {
  return request(`/api/rooms/${encodeURIComponent(code)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export type Action =
  | { type: "startRound" }
  | { type: "openVoting" }
  | { type: "reveal" }
  | { type: "vote"; targetId: string | null }
  | { type: "scoreboard" }
  | { type: "end" }
  | { type: "kick"; playerId: string }
  | { type: "leave" };

export function act(
  code: string,
  token: string,
  action: Action,
): Promise<{ room: PublicRoom | null; left: boolean }> {
  return request(`/api/rooms/${encodeURIComponent(code)}/actions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(action),
  });
}
