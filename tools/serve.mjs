import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { handleChat } from "../server/ai-proxy.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist");
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".woff2": "font/woff2",
};

const server = createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }

  if (pathname === "/api/chat") {
    await serveChat(request, response);
    return;
  }

  if (pathname === "/") pathname = "/index.html";
  else if (pathname.endsWith("/")) pathname += "index.html";
  const target = path.resolve(root, `.${pathname}`);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const info = await stat(target);
    if (!info.isFile()) throw new Error("Not a file");
    response.writeHead(200, { "Content-Type": types[path.extname(target)] ?? "application/octet-stream" });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found. Run npm run build first.");
  }
});

// Local stand-in for the Vercel Function at /api/chat. Reads RADEON_API_KEY from the
// environment of the terminal that runs `npm run dev`; without it the assistant reports
// that AI is not configured.
async function serveChat(request, response) {
  const controller = new AbortController();
  response.on("close", () => controller.abort());
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) if (typeof value === "string") headers.set(name, value);
  const webRequest = new Request(`http://${request.headers.host}${request.url}`, {
    method: request.method,
    headers,
    body: request.method === "POST" ? Readable.toWeb(request) : undefined,
    duplex: "half",
    signal: controller.signal,
  });
  try {
    const result = await handleChat(webRequest, process.env);
    response.writeHead(result.status, Object.fromEntries(result.headers));
    if (!result.body) return response.end();
    Readable.fromWeb(result.body).on("error", () => response.end()).pipe(response);
  } catch (error) {
    if (!response.headersSent) response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "local_proxy_failed" }));
  }
}

const port = Number(process.env.ECON_TAB_PORT ?? process.env.PORT ?? 4173);
server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  console.log(`Local preview: http://127.0.0.1:${typeof address === "object" && address ? address.port : port}`);
});
