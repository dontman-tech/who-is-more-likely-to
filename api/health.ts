import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * GET /api/health — deployment smoke test.
 *
 * The shared library is imported dynamically so that a failure to resolve it is
 * reported as data rather than crashing the whole function. A static import
 * would take the process down at load time and surface only as an opaque
 * FUNCTION_INVOCATION_FAILED with no detail.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Use GET to check health." });
    return;
  }

  const report: Record<string, unknown> = {
    ok: true,
    node: process.version,
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
  };

  try {
    const { listPacks } = await import("../lib/packs");
    report.packs = listPacks().map((p) => p.id);
  } catch (err) {
    report.ok = false;
    report.libImportError = (err as NodeJS.ErrnoException).code ?? String(err);
    report.libImportMessage = (err as Error).message;
  }

  res.status(200).json(report);
}
