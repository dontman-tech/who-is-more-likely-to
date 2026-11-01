import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  findPlayerByToken,
  GameError,
  markStale,
  seePlayer,
  tick,
  toPublicRoom,
} from "../../../lib/engine";
import { bearerToken, jsonError, queryParam, withRoomRead } from "../../../lib/server";

/**
 * GET /api/rooms/:code — current state for one player.
 *
 * Reads are not free: `tick` advances any expired timer, so a read can change
 * the room. That is deliberate — it means the room keeps moving even if every
 * phone is backgrounded, and no client holds the clock.
 *
 * What a read does *not* do is write on every poll. `withRoomRead` only
 * persists when a timer actually fired or presence was worth recording, so an
 * idle poll costs one read and no write. See `seePlayer` for the presence rule.
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

    const payload = await withRoomRead(code, (room) => {
      const player = findPlayerByToken(room, token);
      if (!player) throw new GameError("Session not recognised. Rejoin the room.", 401);

      // Presence first, so this player's own projection reads as online even
      // when the write is skipped. Then settle any expired timer, and finally
      // age out anyone who has gone quiet, so the dot on their chip goes off.
      const presenceChanged = seePlayer(room, player.id);
      const phaseChanged = tick(room);
      const staleChanged = markStale(room);

      return {
        result: toPublicRoom(room, player.id),
        changed: presenceChanged || phaseChanged || staleChanged,
      };
    });

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ room: payload });
  } catch (error) {
    jsonError(res, error);
  }
}
