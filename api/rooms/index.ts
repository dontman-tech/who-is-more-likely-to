import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createRoom, toPublicRoom } from "../../lib/engine";
import { DEFAULT_PACK_ID } from "../../lib/packs";
import { getStore } from "../../lib/store";
import { jsonError, readBody, requiredString } from "../../lib/server";
import type { RoomConfig } from "../../lib/types";

/**
 * POST /api/rooms — create a room. The caller becomes the host and receives
 * their private session token. The token is returned exactly once, here.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST to create a room." });
    return;
  }

  try {
    const body = readBody<{
      hostName?: unknown;
      packId?: unknown;
      customPrompts?: unknown;
      config?: Partial<RoomConfig>;
    }>(req);

    const hostName = requiredString(body.hostName, "hostName", 64);
    const packId =
      typeof body.packId === "string" && body.packId.length > 0
        ? body.packId
        : DEFAULT_PACK_ID;

    const { room, hostToken } = createRoom({
      hostName,
      packId,
      customPrompts: body.customPrompts,
      config: body.config,
    });

    const store = getStore();
    await store.set(room.code, room);

    res.status(201).json({ room: toPublicRoom(room, room.hostId), token: hostToken });
  } catch (error) {
    jsonError(res, error);
  }
}
