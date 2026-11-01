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

/**
 * Load a room and run `fn` under the lock, but only write back when `fn`
 * reports that it changed something.
 *
 * This is the read path. A poll that finds nothing new — no expired timer, no
 * presence worth persisting — must not spend a write. On Redis that is a real
 * cost: a room with six phones polling every 3s would otherwise issue a write
 * per poll, and the whole point of the free tier is to stay inside it.
 *
 * The common case is optimistically probed against a clone first, because a
 * lock-and-write cycle costs four commands (lock, get, write, release) while a
 * bare get costs one. Only when the probe reports a change do we take the lock
 * and redo the work on the real room, so the fast path can never mutate shared
 * state or return a result that a concurrent writer has invalidated.
 */
export async function withRoomRead<T>(
  code: string,
  fn: (room: Room) => { result: T; changed: boolean } | Promise<{ result: T; changed: boolean }>,
): Promise<T> {
  const store = getStore();
  const normalized = code.trim().toUpperCase();
  const missing = () => new GameError("Room not found. Check the code and try again.", 404);

  const current = await store.get(normalized);
  if (!current) throw missing();

  const probe = structuredClone(current);
  const probed = await fn(probe);
  if (!probed.changed) return probed.result;

  return store.withLock(normalized, async () => {
    const room = await store.get(normalized);
    if (!room) throw missing();
    const { result, changed } = await fn(room);
    if (changed) await store.set(normalized, room);
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
