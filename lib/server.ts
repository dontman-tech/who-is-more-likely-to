import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GameError } from "./engine";
import { getStore } from "./store";
import type { Room } from "./types";

/**
 * Server-side helpers for the Vercel functions. Keeping these here (rather
 * than under `api/`) means every route file stays a thin handler and the
 * lock / persist / error rules are written exactly once.
 */

export function jsonError(res: VercelResponse, error: unknown): void {
  if (error instanceof GameError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : "Unexpected error.";
  // Surface unexpected failures rather than pretending they are user errors.
  res.status(500).json({ error: message });
}

/**
 * Load a room, run `fn` under the room lock, and persist the result. Every
 * mutating route goes through here, so no write can race another and no route
 * can forget to save.
 */
export async function withRoom<T>(
  code: string,
  fn: (room: Room) => Promise<T> | T,
): Promise<T> {
  const store = getStore();
  const normalized = code.trim().toUpperCase();
  return store.withLock(normalized, async () => {
    const room = await store.get(normalized);
    if (!room) {
      throw new GameError("Room not found. Check the code and try again.", 404);
    }
    const result = await fn(room);
    await store.set(normalized, room);
    return result;
  });
}

export function bearerToken(req: VercelRequest): string | null {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  return null;
}

/** Vercel parses JSON bodies for us; this handles the string and empty cases. */
export function readBody<T>(req: VercelRequest): T {
  const body = req.body;
  if (body === undefined || body === null) {
    throw new GameError("Request body must be valid JSON.", 400);
  }
  if (typeof body === "string") {
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new GameError("Request body must be valid JSON.", 400);
    }
  }
  return body as T;
}

/** Parse and validate a string field from an untrusted body. */
export function requiredString(value: unknown, field: string, maxLength = 64): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new GameError(`${field} is required.`, 400);
  }
  if (value.length > maxLength) {
    throw new GameError(`${field} is too long.`, 400);
  }
  return value;
}

/**
 * Cheap abuse control: cap writes per room per window. The engine already
 * validates every action, so this only needs to blunt brute-force loops.
 */
export function rateLimit(room: Room, limit = 120, windowMs = 10_000): void {
  const now = Date.now();
  const recent = room.writeLog.filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    throw new GameError("Too many actions, slow down for a moment.", 429);
  }
}

export function queryParam(req: VercelRequest, name: string): string | null {
  const value = req.query[name];
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}
