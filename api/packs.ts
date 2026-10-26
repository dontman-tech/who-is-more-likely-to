import type { VercelRequest, VercelResponse } from "@vercel/node";
import { listPacks } from "../lib/packs";

/** GET /api/packs — catalogue for the question pack picker. */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Use GET to list packs." });
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.status(200).json({ packs: listPacks() });
}
