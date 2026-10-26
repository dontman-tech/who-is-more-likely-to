import type { VercelRequest, VercelResponse } from "@vercel/node";
import { findPlayerByToken, GameError, tick, toPublicRoom } from "../../../lib/engine";
import { bearerToken, jsonError, queryParam, withRoom } from "../../../lib/server";

/**
 * GET /api/rooms/:code — current state for one player.
 *
 * Reads are not free: `tick` advances any expired timer, so a read can change
 * the room. That is deliberate — it means the room keeps moving even if every
 * phone is backgrounded, and no client holds the clock.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Use GET to read room state." });
    return;
  }

  try {
    const code = queryParam(req, "code");
    if (!code) throw new GameError("Room code is required.", 400);

    const token = bearerToken(req);
    if (!token) throw new GameError("Missing session token.", 401);

    const payload = await withRoom(code, (room) => {
      const player = findPlayerByToken(room, token);
      if (!player) throw new GameError("Session not recognised. Rejoin the room.", 401);

      // Presence + timers both advance on read, so a stale client that only
      // ever polls will still keep the room alive and on schedule.
      player.lastSeen = Date.now();
      player.connected = true;
      tick(room);

      return toPublicRoom(room, player.id);
    });

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ room: payload });
  } catch (error) {
    jsonError(res, error);
  }
}
