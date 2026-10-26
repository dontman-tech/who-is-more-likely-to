/**
 * Local development server.
 *
 * `vite` alone cannot run the files under `api/`, because those are Vercel
 * Node functions. This server mounts the real handlers behind a tiny
 * Vercel-compatible request/response shim and serves the built frontend, so
 * the whole game can be played locally with one command and no Redis.
 *
 * Usage: npm run build && npm run dev:server
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = join(ROOT, "dist");
const PORT = Number(process.env.PORT ?? 12000);

type Handler = (req: unknown, res: unknown) => unknown | Promise<unknown>;

interface Route {
  pattern: RegExp;
  load: () => Promise<{ default: Handler }>;
}

// Order matters: more specific patterns are matched first.
const ROUTES: Route[] = [
  { pattern: /^\/api\/packs$/, load: () => import("../api/packs") },
  { pattern: /^\/api\/rooms$/, load: () => import("../api/rooms/index") },
  { pattern: /^\/api\/rooms\/([^/]+)\/join$/, load: () => import("../api/rooms/[code]/join") },
  {
    pattern: /^\/api\/rooms\/([^/]+)\/actions$/,
    load: () => import("../api/rooms/[code]/actions"),
  },
  { pattern: /^\/api\/rooms\/([^/]+)$/, load: () => import("../api/rooms/[code]/index") },
];

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Minimal VercelRequest/VercelResponse shim over node:http. */
function makeRes(res: ServerResponse) {
  let statusCode = 200;
  const headers: Record<string, string> = {};
  return {
    res,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: unknown) {
      headers["Content-Type"] = "application/json; charset=utf-8";
      res.writeHead(statusCode, headers);
      res.end(JSON.stringify(payload));
      return this;
    },
    send(payload: unknown) {
      res.writeHead(statusCode, headers);
      res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
      return this;
    },
  };
}

async function serveStatic(pathname: string, res: ServerResponse): Promise<void> {
  // Resolve inside DIST only; `normalize` plus a prefix check blocks traversal.
  const relative = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(DIST, relative);
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = join(filePath, "index.html");
  } catch {
    // Unknown path: hand it to the SPA, which routes client-side.
    filePath = join(DIST, "index.html");
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const pathname = url.pathname;

    if (!pathname.startsWith("/api/")) {
      await serveStatic(pathname, res);
      return;
    }

    for (const route of ROUTES) {
      const match = pathname.match(route.pattern);
      if (!match) continue;

      const query: Record<string, string> = {};
      url.searchParams.forEach((value, key) => {
        query[key] = value;
      });
      // Vercel exposes dynamic segments on `req.query`.
      if (match[1]) query.code = decodeURIComponent(match[1]);

      try {
        const mod = await route.load();
        const body = await readBody(req);
        const vercelReq = { method: req.method, headers: req.headers, query, body };
        await mod.default(vercelReq, makeRes(res));
      } catch (error) {
        console.error(`[api] ${req.method} ${pathname} failed:`, error);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Local server error. See the terminal." }));
        }
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `No handler for ${pathname}` }));
  })();
});

server.listen(PORT, () => {
  const store = process.env.UPSTASH_REDIS_REST_URL
    ? "Upstash Redis"
    : "in-memory (rooms reset when this process stops)";
  console.log(`who-is-more-likely-to  ->  http://localhost:${PORT}`);
  console.log(`  static: ${DIST}`);
  console.log(`  store:  ${store}`);
});
