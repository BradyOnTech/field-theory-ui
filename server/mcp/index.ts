#!/usr/bin/env node
/**
 * Field Theory MCP server.
 *
 * Exposes your local bookmarks DB (~/.ft-bookmarks/bookmarks.db) to any MCP
 * client (Claude Desktop, Claude Code, Cursor, …) as a set of read + write
 * tools. All state lives in the same SQLite file that ft sync writes and the
 * UI reads — this server just reuses the query helpers in ../queries.ts.
 *
 * Writes to Collections are tagged added_by="mcp" so you can distinguish
 * agent-made changes from manual ones.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getDb,
  getWritableDb,
  getStats,
  getCategories,
  getDomains,
  searchBookmarks,
  getBookmarkById,
  getBookmarksByConversation,
  listCollections,
  createCollection,
  deleteCollection,
  addBookmarksToCollection,
  removeBookmarksFromCollection,
  getBookmarksByCollection,
  getCollectionsForBookmark,
} from "../queries";

const server = new McpServer({
  name: "field-theory",
  version: "0.1.0",
});

/**
 * Strip heavy fields an agent rarely needs so we don't blow the context window.
 * article_text, quoted_tweet_json, links_json can each be several KB.
 */
function compactBookmark(b: ReturnType<typeof getBookmarkById>) {
  if (!b) return null;
  return {
    id: b.id,
    url: b.url,
    text: b.text,
    author_handle: b.author_handle,
    author_name: b.author_name,
    posted_at: b.posted_at_iso || b.posted_at,
    primary_category: b.primary_category,
    categories: b.categories ? b.categories.split(",").filter(Boolean) : [],
    primary_domain: b.primary_domain,
    domains: b.domains ? b.domains.split(",").filter(Boolean) : [],
    like_count: b.like_count,
    repost_count: b.repost_count,
    bookmark_count: b.bookmark_count,
    conversation_id: b.conversation_id || null,
    github_urls: b.github_urls ? (JSON.parse(b.github_urls || "[]") as string[]) : [],
  };
}

function asJsonText(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

// --- Read tools ---

server.registerTool(
  "search_bookmarks",
  {
    title: "Search bookmarks",
    description:
      "Full-text search across bookmarked posts. Returns compact bookmarks with id, author, text, categories, domains. " +
      "Filter by author handle, category slug, domain slug, collection slug, or date range (ISO 8601). " +
      "Use this as the primary discovery tool. Default limit 20, max 100.",
    inputSchema: {
      query: z.string().optional().describe("Full-text search query"),
      author: z.string().optional().describe("Filter by author handle (without @)"),
      category: z.string().optional().describe("Filter by category slug (e.g. 'technique')"),
      domain: z.string().optional().describe("Filter by domain slug (e.g. 'ai')"),
      collection: z.string().optional().describe("Filter by collection slug"),
      after: z.string().optional().describe("ISO date: only bookmarks posted on/after"),
      before: z.string().optional().describe("ISO date: only bookmarks posted on/before"),
      sort: z
        .enum([
          "posted_desc",
          "posted_asc",
          "likes_desc",
          "reposts_desc",
          "bookmark_count_desc",
          "relevance",
        ])
        .optional()
        .describe("Sort order. Default: posted_desc (newest first). 'relevance' needs a query."),
      limit: z.number().int().min(1).max(100).optional().default(20),
      offset: z.number().int().min(0).optional().default(0),
    },
  },
  async (args) => {
    const result = searchBookmarks({
      q: args.query,
      author: args.author,
      category: args.category,
      domain: args.domain,
      collection: args.collection,
      after: args.after,
      before: args.before,
      sort: args.sort,
      limit: args.limit,
      offset: args.offset,
    });
    return asJsonText({
      total: result.total,
      offset: args.offset,
      returned: result.results.length,
      results: result.results.map(compactBookmark),
    });
  },
);

server.registerTool(
  "get_bookmark",
  {
    title: "Get a bookmark by id",
    description:
      "Fetch one bookmark by its numeric id (tweet id), with full metadata and its current collection memberships.",
    inputSchema: {
      id: z.string().describe("Bookmark id (same value as the tweet_id)"),
    },
  },
  async ({ id }) => {
    const bookmark = getBookmarkById(id);
    if (!bookmark) return asJsonText({ error: "not_found", id });
    const collections = getCollectionsForBookmark(id);
    return asJsonText({ ...compactBookmark(bookmark), collections });
  },
);

server.registerTool(
  "get_conversation",
  {
    title: "Get a conversation thread",
    description:
      "Return all bookmarks in the same X conversation (reply chain) in chronological order. " +
      "Use this when a bookmark is a reply and you need the surrounding thread.",
    inputSchema: {
      conversation_id: z.string(),
    },
  },
  async ({ conversation_id }) => {
    const rows = getBookmarksByConversation(conversation_id);
    return asJsonText({ count: rows.length, results: rows.map(compactBookmark) });
  },
);

server.registerTool(
  "stats",
  {
    title: "Library stats",
    description:
      "High-level counts (total bookmarks, unique authors, date range, weekly activity, classified count).",
    inputSchema: {},
  },
  async () => asJsonText(getStats()),
);

server.registerTool(
  "list_categories",
  {
    title: "List categories",
    description:
      "All category slugs and their counts. Categories describe the FORMAT of a bookmark " +
      "(technique, tool, opinion, launch, research, security, commerce, …). Use the returned slugs " +
      "with search_bookmarks.category.",
    inputSchema: {},
  },
  async () => asJsonText(getCategories()),
);

server.registerTool(
  "list_domains",
  {
    title: "List domains",
    description:
      "All domain slugs and their counts. Domains describe the SUBJECT of a bookmark " +
      "(ai, web-dev, finance, devops, …). Use the returned slugs with search_bookmarks.domain.",
    inputSchema: {},
  },
  async () => asJsonText(getDomains()),
);

// --- Collections tools ---

server.registerTool(
  "list_collections",
  {
    title: "List collections",
    description:
      "User-defined collections that cross-cut categories and domains (e.g. a project or theme). " +
      "Returns each collection's slug, name, description, color, and bookmark count.",
    inputSchema: {},
  },
  async () => asJsonText(listCollections()),
);

server.registerTool(
  "get_bookmarks_by_collection",
  {
    title: "Get bookmarks in a collection",
    description: "List bookmarks that belong to a collection, most-recently-added first.",
    inputSchema: {
      slug: z.string().describe("Collection slug"),
      limit: z.number().int().min(1).max(200).optional().default(50),
      offset: z.number().int().min(0).optional().default(0),
    },
  },
  async ({ slug, limit, offset }) => {
    const result = getBookmarksByCollection(slug, limit, offset);
    if (!result) return asJsonText({ error: "not_found", slug });
    return asJsonText({
      total: result.total,
      offset,
      returned: result.results.length,
      results: result.results.map(compactBookmark),
    });
  },
);

server.registerTool(
  "create_collection",
  {
    title: "Create a collection",
    description:
      "Create a new collection for grouping bookmarks across categories/domains. " +
      "Returns the created collection including its slug (auto-generated from the name).",
    inputSchema: {
      name: z.string().min(1).describe("Human-readable name"),
      description: z.string().optional(),
      color: z.string().optional().describe("Hex color like '#7c3aed' for UI chips"),
    },
  },
  async ({ name, description, color }) => {
    try {
      const created = createCollection({ name, description, color });
      return asJsonText(created);
    } catch (err) {
      return asJsonText({ error: (err as Error).message });
    }
  },
);

server.registerTool(
  "delete_collection",
  {
    title: "Delete a collection",
    description:
      "Permanently delete a collection and all its bookmark memberships. Bookmarks themselves are not affected.",
    inputSchema: {
      slug: z.string(),
    },
  },
  async ({ slug }) => {
    const ok = deleteCollection(slug);
    return asJsonText({ deleted: ok, slug });
  },
);

server.registerTool(
  "add_to_collection",
  {
    title: "Add bookmarks to a collection",
    description:
      "Add one or more bookmarks (by id) to a collection. Idempotent — already-present bookmarks are skipped. " +
      "Writes are tagged added_by='mcp' so agent additions can be audited later.",
    inputSchema: {
      slug: z.string().describe("Collection slug"),
      bookmark_ids: z.array(z.string()).min(1).describe("One or more bookmark ids"),
    },
  },
  async ({ slug, bookmark_ids }) => {
    try {
      const result = addBookmarksToCollection(slug, bookmark_ids, "mcp");
      return asJsonText({ slug, ...result });
    } catch (err) {
      return asJsonText({ error: (err as Error).message });
    }
  },
);

server.registerTool(
  "remove_from_collection",
  {
    title: "Remove bookmarks from a collection",
    description: "Remove one or more bookmarks (by id) from a collection. Bookmarks themselves are not deleted.",
    inputSchema: {
      slug: z.string(),
      bookmark_ids: z.array(z.string()).min(1),
    },
  },
  async ({ slug, bookmark_ids }) => {
    try {
      const result = removeBookmarksFromCollection(slug, bookmark_ids);
      return asJsonText({ slug, ...result });
    } catch (err) {
      return asJsonText({ error: (err as Error).message });
    }
  },
);

// --- Entry point ---

async function main(): Promise<void> {
  // Fail fast with a clear stderr message if the DB is missing or the ft-synced
  // schema has drifted. The MCP client will surface the process exit.
  try {
    getDb();
    getWritableDb();
  } catch (e) {
    process.stderr.write(`field-theory MCP: ${(e as Error).message}\n`);
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  process.stderr.write(`field-theory MCP fatal: ${(err as Error).message}\n`);
  process.exit(1);
});
