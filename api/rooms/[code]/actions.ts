import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  castVote,
  endRoom,
  findPlayerByToken,
  GameError,
  kickPlayer,
  leaveRoom,
  openVoting,
  reveal,
  showScoreboard,
  startRound,
  tick,
  toPublicRoom,
} from "../../../lib/engine";
import { bearerToken, jsonError, queryParam, rateLimit, readBody, withRoom } from "../../../lib/server";

/**
 * POST /api/rooms/:code/actions
 *
 * Every mutation funnels through here as a discriminated `type`, so auth,
 * locking, rate limiting, and the state projection are written once and
 * adding an action is a single `case`.
 */
type ActionBody =
  | { type: "startRound" }
  | { type: "openVoting" }
  | { type: "reveal" }
  | { type: "vote"; targetId: string | null }
  | { type: "scoreboard" }
  | { type: "end" }
  | { type: "kick"; playerId: string }
  | { type: "leave" };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST to act on a room." });
    return;
  }

  try {
    const code = queryParam(req, "code");
    if (!code) throw new GameError("Room code is required.", 400);

    const token = bearerToken(req);
    if (!token) throw new GameError("Missing session token.", 401);

    const body = readBody<ActionBody>(req);
    if (!body || typeof body.type !== "string") {
      throw new GameError("An action type is required.", 400);
    }

    const payload = await withRoom(code, (room) => {
      const player = findPlayerByToken(room, token);
      if (!player) throw new GameError("Session not recognised. Rejoin the room.", 401);

      rateLimit(room);
      room.writeLog.push(Date.now());

      // A late client may arrive after a deadline passed; settle that first so
      // the action is validated against the phase the room is really in.
      tick(room);

      switch (body.type) {
        case "startRound":
          startRound(room, player.id);
          break;
        case "openVoting":
          openVoting(room, player.id);
          break;
        case "reveal":
          // Host closes voting early; same rules apply as the auto-reveal.
          if (room.hostId !== player.id) {
            throw new GameError("Only the host can reveal early.", 403);
          }
          reveal(room);
          break;
        case "vote":
          castVote(room, player.id, body.targetId ?? null);
          break;
        case "scoreboard":
          showScoreboard(room, player.id);
          break;
        case "kick":
          if (typeof body.playerId !== "string") {
            throw new GameError("A playerId is required to remove someone.", 400);
          }
          kickPlayer(room, player.id, body.playerId);
          break;
        case "leave":
          leaveRoom(room, player.id);
          break;
        case "end":
          endRoom(room, player.id);
          break;
        default: {
          // Exhaustiveness check: adding an action without a case is a
          // compile error rather than a silent 400 at runtime.
          const never: never = body;
          throw new GameError(`Unknown action: ${JSON.stringify(never)}`, 400);
        }
      }

      return toPublicRoom(room, player.id);
    });

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ room: payload });
  } catch (error) {
    jsonError(res, error);
  }
}
