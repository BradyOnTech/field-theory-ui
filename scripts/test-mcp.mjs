#!/usr/bin/env node
/**
 * Quick smoke test for the Field Theory MCP server.
 * Spawns `npm run mcp`, performs the JSON-RPC handshake, lists tools,
 * exercises a few, prints results, then exits.
 */
import { spawn } from "node:child_process";

const child = spawn("npx", ["tsx", "server/mcp/index.ts"], {
  stdio: ["pipe", "pipe", "inherit"],
});

let buffer = "";
const pending = new Map();
let nextId = 1;

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  let idx;
  while ((idx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    } catch (err) {
      console.error("parse error:", err, "line:", line);
    }
  }
});

function send(method, params = {}) {
  const id = nextId++;
  const msg = { jsonrpc: "2.0", id, method, params };
  child.stdin.write(JSON.stringify(msg) + "\n");
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timeout: ${method}`));
      }
    }, 10_000);
  });
}

function notify(method, params = {}) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

async function main() {
  console.log("→ initialize");
  const init = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "ft-smoke-test", version: "0.1.0" },
  });
  console.log("  server:", init.serverInfo.name, init.serverInfo.version);
  notify("notifications/initialized");

  console.log("\n→ tools/list");
  const { tools } = await send("tools/list");
  console.log("  ", tools.length, "tools:");
  for (const t of tools) console.log("   •", t.name, "-", t.description.slice(0, 60) + (t.description.length > 60 ? "…" : ""));

  console.log("\n→ call stats");
  const stats = await send("tools/call", { name: "stats", arguments: {} });
  console.log(stats.content[0].text);

  console.log("\n→ call list_collections (initial)");
  let res = await send("tools/call", { name: "list_collections", arguments: {} });
  console.log(res.content[0].text);

  console.log("\n→ call create_collection");
  res = await send("tools/call", { name: "create_collection", arguments: { name: "MCP Smoke Test", color: "#10b981" } });
  console.log(res.content[0].text);
  const created = JSON.parse(res.content[0].text);

  console.log("\n→ call search_bookmarks (limit 2)");
  res = await send("tools/call", { name: "search_bookmarks", arguments: { limit: 2 } });
  const search = JSON.parse(res.content[0].text);
  console.log("  total:", search.total, "returned:", search.returned);
  const ids = search.results.map((r) => r.id);
  console.log("  ids:", ids);

  console.log("\n→ call add_to_collection");
  res = await send("tools/call", { name: "add_to_collection", arguments: { slug: created.slug, bookmark_ids: ids } });
  console.log(res.content[0].text);

  console.log("\n→ call get_bookmark (first id)");
  res = await send("tools/call", { name: "get_bookmark", arguments: { id: ids[0] } });
  const bm = JSON.parse(res.content[0].text);
  console.log("  author:", bm.author_handle, "collections:", bm.collections?.map((c) => c.slug));

  console.log("\n→ call search_bookmarks with collection filter");
  res = await send("tools/call", { name: "search_bookmarks", arguments: { collection: created.slug } });
  const filt = JSON.parse(res.content[0].text);
  console.log("  total:", filt.total, "returned:", filt.returned);

  console.log("\n→ call delete_collection (cleanup)");
  res = await send("tools/call", { name: "delete_collection", arguments: { slug: created.slug } });
  console.log(res.content[0].text);

  child.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error("FAIL:", err);
  child.kill();
  process.exit(1);
});
