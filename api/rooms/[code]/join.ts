import type { VercelRequest, VercelResponse } from "@vercel/node";
import { joinRoom, rejoinRoom, toPublicRoom } from "../../../lib/engine";
import { jsonError, queryParam, readBody, requiredString, withRoom } from "../../../lib/server";

/**
 * POST /api/rooms/:code/join
 *
 * Two modes, one endpoint:
 *   - with `token`: rejoin, restoring identity, score, and any vote cast. This
 *     is what makes a locked phone or a refresh harmless.
 *   - with `name`: take a new seat.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST to join a room." });
    return;
  }

  try {
    const code = queryParam(req, "code");
    if (!code) {
      res.status(400).json({ error: "Room code is required." });
      return;
    }

    const body = readBody<{ name?: unknown; token?: unknown }>(req);
    const token = typeof body.token === "string" ? body.token.trim() : "";

    const payload = await withRoom(code, (room) => {
      if (token) {
        const { playerId } = rejoinRoom(room, token);
        return { room: toPublicRoom(room, playerId), token };
      }
      const name = requiredString(body.name, "name", 64);
      const { playerId, token: newToken } = joinRoom(room, name);
      return { room: toPublicRoom(room, playerId), token: newToken };
    });

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(payload);
  } catch (error) {
    jsonError(res, error);
  }
}
