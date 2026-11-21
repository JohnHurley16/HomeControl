// A small static file server for cc-web. No dependencies.
import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

export interface StaticOptions {
  dir: string;
  port: number;
  /** Served as /cc-config.json so one build runs on any house. */
  config: Record<string, unknown>;
  log: (message: string) => void;
}

export function startStaticServer(opts: StaticOptions): Server {
  const root = resolve(opts.dir);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405).end();
        return;
      }
      if (url.pathname === "/cc-config.json") {
        res.writeHead(200, { "Content-Type": TYPES[".json"], "Cache-Control": "no-cache" });
        res.end(JSON.stringify(opts.config));
        return;
      }
      if (url.pathname === "/healthz") {
        res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
        return;
      }
      let path = normalize(join(root, decodeURIComponent(url.pathname)));
      if (path !== root && !path.startsWith(root + sep)) {
        res.writeHead(403).end();
        return;
      }
      let info = await stat(path).catch(() => null);
      if (info?.isDirectory()) {
        path = join(path, "index.html");
        info = await stat(path).catch(() => null);
      }
      if (!info) {
        // Unknown paths get the app shell; the app routes with the URL hash anyway.
        path = join(root, "index.html");
      }
      const body = await readFile(path);
      const ext = extname(path);
      const hashed = path.includes(`${sep}assets${sep}`);
      res.writeHead(200, {
        "Content-Type": TYPES[ext] ?? "application/octet-stream",
        "Cache-Control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch (err) {
      opts.log(`static: ${String(err)}`);
      res.writeHead(500).end();
    }
  });
  server.listen(opts.port, () => opts.log(`front end on port ${opts.port}, serving ${root}`));
  return server;
}
