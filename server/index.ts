import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readFileSync, existsSync, statSync } from "fs";
import { spawn, type ChildProcess } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import os from "os";
import {
  getDb,
  getStats,
  getRecent,
  getCategories,
  getDomains,
  getTimeline,
  getTopAuthors,
  searchBookmarks,
  getAuthorProfile,
  getBookmarkById,
  getGitHubRepos,
  getSelfBookmarks,
  getRandomBookmark,
  getMonthlyBreakdown,
  getTechniqueBacklog,
  getGitHubMetadata,
  getConversationGroups,
  getBookmarksByConversation,
} from "./queries";
import { handleOracleQuery, type OracleContext } from "./oracle";
import { handleOracleProQueryStream, isProModeAvailable, isWebSearchAvailable } from "./oracle-pro";

const PORT = parseInt(process.env.PORT || "3939", 10);
const __dirname = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "..", "dist");

// MIME types for static file serving
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".webmanifest": "application/manifest+json",
};

// --- Sync process state ---
let syncProcess: ChildProcess | null = null;
let syncLines: string[] = [];
let syncDone = false;
let syncExitCode: number | null = null;
const syncListeners = new Set<ServerResponse>();

function startSync(): { status: string } {
  if (syncProcess) return { status: "already_running" };

  syncLines = [];
  syncDone = false;
  syncExitCode = null;

  syncProcess = spawn("ft", ["sync", "--classify"], {
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const onData = (chunk: Buffer) => {
    const text = chunk.toString();
    for (const raw of text.split("\n")) {
      // eslint-disable-next-line no-control-regex
      const line = raw.replace(/\r/g, "").replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x0f/g, "").trim();
      if (!line) continue;
      syncLines.push(line);
      const event = `data: ${JSON.stringify({ line })}\n\n`;
      for (const res of syncListeners) {
        try { res.write(event); } catch { /* client gone */ }
      }
    }
  };

  syncProcess.stdout?.on("data", onData);
  syncProcess.stderr?.on("data", onData);

  syncProcess.on("close", (code) => {
    syncDone = true;
    syncExitCode = code ?? 1;
    syncProcess = null;
    const event = `data: ${JSON.stringify({ done: true, code: syncExitCode })}\n\n`;
    for (const res of syncListeners) {
      try { res.write(event); res.end(); } catch { /* client gone */ }
    }
    syncListeners.clear();
  });

  syncProcess.on("error", (err) => {
    const line = `Error: ${err.message}`;
    syncLines.push(line);
    syncDone = true;
    syncExitCode = 1;
    syncProcess = null;
    const event = `data: ${JSON.stringify({ done: true, code: 1, error: err.message })}\n\n`;
    for (const res of syncListeners) {
      try { res.write(event); res.end(); } catch { /* client gone */ }
    }
    syncListeners.clear();
  });

  return { status: "started" };
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function sendJSON(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(data));
}

function writeSSEHeaders(res: ServerResponse): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    ...CORS_HEADERS,
  });
}

function sendError(res: ServerResponse, message: string, status = 500): void {
  sendJSON(res, { error: message }, status);
}

function parseQueryParams(urlStr: string): URLSearchParams {
  const qIndex = urlStr.indexOf("?");
  if (qIndex === -1) return new URLSearchParams();
  return new URLSearchParams(urlStr.slice(qIndex + 1));
}

function getPathname(urlStr: string): string {
  const qIndex = urlStr.indexOf("?");
  return qIndex === -1 ? urlStr : urlStr.slice(0, qIndex);
}

/**
 * Parse a numeric query parameter. Returns the parsed integer if valid and finite,
 * or the defaultValue if the parameter is absent or invalid.
 * Returns { value, invalid } where invalid is true if the param was present but malformed.
 */
function parseNumericParam(
  params: URLSearchParams,
  name: string,
  defaultValue: number,
): { value: number; invalid: boolean } {
  const raw = params.get(name);
  if (raw === null || raw === "") {
    return { value: defaultValue, invalid: false };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    return { value: defaultValue, invalid: true };
  }
  return { value: parsed, invalid: false };
}

function serveStaticFile(res: ServerResponse, filePath: string): boolean {
  try {
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      return false;
    }
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const content = readFileSync(filePath);
    res.writeHead(200, {
      "Content-Type": contentType,
      ...CORS_HEADERS,
    });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

export function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const urlStr = req.url || "/";
  const pathname = getPathname(urlStr);
  const params = parseQueryParams(urlStr);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  // --- Sync routes (outside main switch — POST + SSE) ---
  if (pathname === "/api/sync" && req.method === "POST") {
    const result = startSync();
    sendJSON(res, result);
    return;
  }

  if (pathname === "/api/sync/stream" && req.method === "GET") {
    writeSSEHeaders(res);
    for (const line of syncLines) {
      res.write(`data: ${JSON.stringify({ line })}\n\n`);
    }
    if (syncDone) {
      res.write(`data: ${JSON.stringify({ done: true, code: syncExitCode })}\n\n`);
      res.end();
      return;
    }
    syncListeners.add(res);
    req.on("close", () => { syncListeners.delete(res); });
    return;
  }

  if (pathname === "/api/sync/status" && req.method === "GET") {
    sendJSON(res, { running: syncProcess !== null });
    return;
  }

  // --- Oracle stream route (POST with JSON body) ---
  if (pathname === "/api/oracle/stream" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => {
      let q: string;
      let streamContext: OracleContext[] = [];
      try {
        const parsed = JSON.parse(body) as { q?: string; context?: OracleContext[] };
        q = parsed.q ?? "";
        streamContext = parsed.context ?? [];
      } catch {
        sendError(res, "Invalid JSON body", 400);
        return;
      }
      if (!q) {
        sendError(res, "q is required", 400);
        return;
      }
      if (!isProModeAvailable()) {
        sendError(res, "Pro mode is not available", 400);
        return;
      }
      writeSSEHeaders(res);
      (async () => {
        try {
          for await (const event of handleOracleProQueryStream(q, streamContext)) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          }
        } catch (err) {
          console.error("Oracle Pro stream error:", err);
          res.write(`data: ${JSON.stringify({ step: "error", error: "Oracle Pro stream failed" })}\n\n`);
        }
        res.end();
      })();
    });
    return;
  }

  // API routes
  if (pathname.startsWith("/api/")) {
    try {
      switch (pathname) {
        case "/api/stats": {
          const stats = getStats();
          sendJSON(res, stats);
          return;
        }
        case "/api/recent": {
          const { value: limit, invalid: limitInvalid } = parseNumericParam(params, "limit", 20);
          if (limitInvalid) {
            sendError(res, "Invalid limit parameter: must be a positive integer", 400);
            return;
          }
          const safeLimit = Math.min(Math.max(1, limit), 100);
          const bookmarks = getRecent(safeLimit);
          sendJSON(res, bookmarks);
          return;
        }
        case "/api/categories": {
          const categories = getCategories();
          sendJSON(res, categories);
          return;
        }
        case "/api/domains": {
          const domains = getDomains();
          sendJSON(res, domains);
          return;
        }
        case "/api/timeline": {
          const { value: days, invalid: daysInvalid } = parseNumericParam(params, "days", 90);
          if (daysInvalid) {
            sendError(res, "Invalid days parameter: must be a positive integer", 400);
            return;
          }
          const safeDays = Math.min(Math.max(1, days), 365);
          const timeline = getTimeline(safeDays);
          sendJSON(res, timeline);
          return;
        }
        case "/api/top-authors": {
          const { value: limit, invalid: limitInvalid } = parseNumericParam(params, "limit", 20);
          if (limitInvalid) {
            sendError(res, "Invalid limit parameter: must be a positive integer", 400);
            return;
          }
          const authors = getTopAuthors(limit);
          sendJSON(res, authors);
          return;
        }
        case "/api/search": {
          const q = params.get("q") || undefined;
          const author = params.get("author") || undefined;
          const category = params.get("category") || undefined;
          const domain = params.get("domain") || undefined;
          const after = params.get("after") || undefined;
          const before = params.get("before") || undefined;
          const { value: limit, invalid: limitInvalid } = parseNumericParam(params, "limit", 20);
          if (limitInvalid) {
            sendError(res, "Invalid limit parameter: must be a positive integer", 400);
            return;
          }
          const { value: offset, invalid: offsetInvalid } = parseNumericParam(params, "offset", 0);
          if (offsetInvalid) {
            sendError(res, "Invalid offset parameter: must be a non-negative integer", 400);
            return;
          }
          const result = searchBookmarks({
            q,
            author,
            category,
            domain,
            after,
            before,
            limit,
            offset,
          });
          sendJSON(res, result);
          return;
        }
        case "/api/github-repos": {
          const repos = getGitHubRepos();
          sendJSON(res, repos);
          return;
        }
        case "/api/self-bookmarks": {
          const handle = params.get("handle");
          if (!handle) {
            sendError(res, "handle query parameter is required", 400);
            return;
          }
          const bookmarks = getSelfBookmarks(handle);
          sendJSON(res, bookmarks);
          return;
        }
        case "/api/random-bookmark": {
          const bookmark = getRandomBookmark();
          if (!bookmark) {
            sendError(res, "No bookmarks found", 404);
            return;
          }
          sendJSON(res, bookmark);
          return;
        }
        case "/api/monthly-breakdown": {
          const data = getMonthlyBreakdown();
          sendJSON(res, data);
          return;
        }
        case "/api/technique-backlog": {
          const groups = getTechniqueBacklog();
          sendJSON(res, groups);
          return;
        }
        case "/api/github-metadata": {
          const MAX_GITHUB_DISPLAY_REPOS = 50;
          const allRepos = getGitHubRepos();
          const topRepos = allRepos.slice(0, MAX_GITHUB_DISPLAY_REPOS).map((r) => ({
            owner: r.owner,
            repo: r.repo,
          }));
          getGitHubMetadata(topRepos)
            .then((metadata) => sendJSON(res, metadata))
            .catch((err) => {
              console.error("GitHub metadata error:", err);
              sendError(res, "Failed to fetch GitHub metadata", 500);
            });
          return;
        }
        case "/api/conversations": {
          const { value: limit, invalid: limitInvalid } = parseNumericParam(params, "limit", 20);
          if (limitInvalid) {
            sendError(res, "Invalid limit parameter: must be a positive integer", 400);
            return;
          }
          const safeLimit = Math.min(Math.max(1, limit), 100);
          const groups = getConversationGroups(safeLimit);
          sendJSON(res, groups);
          return;
        }
        case "/api/oracle/status": {
          sendJSON(res, { proAvailable: isProModeAvailable(), webSearchAvailable: isWebSearchAvailable() });
          return;
        }
        case "/api/oracle": {
          const q = params.get("q");
          if (!q) {
            sendError(res, "q query parameter is required", 400);
            return;
          }
          let context: OracleContext[] = [];
          const contextParam = params.get("context");
          if (contextParam) {
            try {
              context = JSON.parse(contextParam) as OracleContext[];
            } catch {
              // Invalid context JSON, ignore and use empty
            }
          }
          handleOracleQuery(q, context)
            .then((result) => sendJSON(res, result))
            .catch((err) => {
              console.error("Oracle error:", err);
              sendError(res, "Oracle query failed", 500);
            });
          return;
        }
        default: {
          // Check for parameterized routes
          if (pathname.startsWith("/api/author/")) {
            const handle = decodeURIComponent(pathname.slice("/api/author/".length));
            if (!handle) {
              sendError(res, "Author handle is required", 400);
              return;
            }
            const profile = getAuthorProfile(handle);
            if (!profile) {
              sendError(res, "Author not found", 404);
              return;
            }
            sendJSON(res, profile);
            return;
          }
          if (pathname.startsWith("/api/bookmark/")) {
            const id = decodeURIComponent(pathname.slice("/api/bookmark/".length));
            if (!id) {
              sendError(res, "Bookmark ID is required", 400);
              return;
            }
            const bookmark = getBookmarkById(id);
            if (!bookmark) {
              sendError(res, "Bookmark not found", 404);
              return;
            }
            sendJSON(res, bookmark);
            return;
          }
          if (pathname.startsWith("/api/conversations/")) {
            const conversationId = decodeURIComponent(pathname.slice("/api/conversations/".length));
            if (!conversationId) {
              sendError(res, "Conversation ID is required", 400);
              return;
            }
            const bookmarks = getBookmarksByConversation(conversationId);
            if (bookmarks.length === 0) {
              sendError(res, "Conversation not found", 404);
              return;
            }
            sendJSON(res, bookmarks);
            return;
          }
          sendError(res, "Not found", 404);
          return;
        }
      }
    } catch (err) {
      console.error("API error:", err);
      sendError(res, "Internal server error", 500);
      return;
    }
  }

  // Static file serving from dist/
  if (existsSync(DIST_DIR)) {
    // Decode URL-encoded characters (e.g., %2e%2e → ..) before path resolution
    let decodedPathname: string;
    try {
      decodedPathname = decodeURIComponent(pathname);
    } catch {
      // Malformed URI encoding
      sendError(res, "Bad request", 400);
      return;
    }

    // Resolve the full path and verify it stays within DIST_DIR to prevent path traversal
    const resolvedDist = path.resolve(DIST_DIR);
    const filePath = path.resolve(DIST_DIR, decodedPathname.replace(/^\/+/, ""));
    if (!filePath.startsWith(resolvedDist + path.sep) && filePath !== resolvedDist) {
      sendError(res, "Forbidden", 403);
      return;
    }
    if (serveStaticFile(res, filePath)) return;

    // SPA fallback: serve index.html for non-file routes
    const indexPath = path.join(DIST_DIR, "index.html");
    if (serveStaticFile(res, indexPath)) return;
  }

  // Fallback 404
  sendError(res, "Not found", 404);
}

// Get local network IP for LAN access
function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    const addrs = interfaces[name];
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) {
        return addr.address;
      }
    }
  }
  return "localhost";
}

// Only start server if this file is run directly (not imported by tests)
const isMainModule = process.argv[1] && (
  process.argv[1].endsWith("server/index.ts") ||
  process.argv[1].endsWith("server/index.js")
);

if (isMainModule) {
  // Validate database schema eagerly on startup (not on first request).
  // If the schema is invalid, exit immediately with a clear error.
  try {
    getDb();
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }

  const server = createServer(handleRequest);

  server.listen(PORT, () => {
    const localIP = getLocalIP();
    console.log(`\n  Field Theory API server running:\n`);
    console.log(`  Local:   http://localhost:${PORT}`);
    console.log(`  Network: http://${localIP}:${PORT}\n`);
  });
}
