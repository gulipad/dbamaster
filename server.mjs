import { createServer, request as httpRequest } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { spawn } from "node:child_process";

const PORT = process.env.PORT || 3000;
const MASTRA_PORT = 4111;
const STATIC_DIR = join(import.meta.dirname, "packages/frontend/dist");

// Start Mastra server in background
const mastra = spawn("node", ["packages/backend/.mastra/output/index.mjs"], {
  stdio: "inherit",
  env: { ...process.env, PORT: String(MASTRA_PORT), HOST: "127.0.0.1" },
});

mastra.on("exit", (code) => {
  console.error(`Mastra exited with code ${code}`);
  process.exit(1);
});

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const PROXY_PREFIXES = ["/api", "/auth", "/progress"];

function shouldProxy(pathname) {
  return PROXY_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Proxy API routes to Mastra
  if (shouldProxy(url.pathname)) {
    const proxyReq = httpRequest(
      {
        hostname: "127.0.0.1",
        port: MASTRA_PORT,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on("error", () => {
      res.writeHead(502);
      res.end("Backend unavailable");
    });
    req.pipe(proxyReq);
    return;
  }

  // Serve static files
  const filePath = join(STATIC_DIR, url.pathname);
  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  } catch {
    // SPA fallback — serve index.html for all unmatched routes
    try {
      const index = await readFile(join(STATIC_DIR, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(index);
    } catch {
      res.writeHead(500);
      res.end("Frontend not built");
    }
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on port ${PORT}`);
});
