import { createAgent, tool, SystemMessage, anthropicPromptCachingMiddleware } from "langchain";
import { TavilySearch } from "@langchain/tavily";
import { z } from "zod";
import { getDb } from "./queries";
import { OPENUI_PROMPT } from "./openui-prompt";
import type { OracleContext } from "./oracle";

// --- Model auto-detection ---

type Provider = "anthropic" | "openai";

function detectProvider(): Provider | null {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

export function isProModeAvailable(): boolean {
  return detectProvider() !== null;
}

export function isWebSearchAvailable(): boolean {
  return !!process.env.TAVILY_API_KEY;
}

// --- Schema introspection ---

let cachedSchema: string | null = null;

function getBookmarksSchema(): string {
  if (cachedSchema) return cachedSchema;
  const db = getDb();
  const columns = db.prepare("PRAGMA table_info(bookmarks)").all() as {
    name: string;
    type: string;
    pk: number;
  }[];

  const lines = columns.map(
    (c) => `  ${c.name} ${c.type || "TEXT"}${c.pk ? " PRIMARY KEY" : ""}`,
  );
  cachedSchema = `CREATE TABLE bookmarks (\n${lines.join(",\n")}\n);

-- FTS5 virtual table for full-text search:
-- bookmarks_fts(text, author_handle, author_name)
-- Usage: SELECT rowid FROM bookmarks_fts WHERE bookmarks_fts MATCH 'search terms'
-- Join: SELECT b.* FROM bookmarks b JOIN bookmarks_fts fts ON b.rowid = fts.rowid WHERE fts.bookmarks_fts MATCH 'term'

-- DATE COLUMNS (critical — read carefully):
-- posted_at: Twitter format "Mon Apr 06 15:40:46 +0000 2026" — when the TWEET was originally posted. Spans multiple years (2022–2026). USE THIS for all time-based queries: "this month", "last year", "over time", "trends", "recent". Parse with parse_twitter_date_ymd(posted_at) for 'YYYY-MM-DD' or parse_twitter_date_iso(posted_at) for ISO 8601.
-- synced_at: ISO 8601 format — when the bookmark was IMPORTED into this local database by the Field Theory CLI. All bookmarks may have been imported in a narrow window (e.g. a few days) even though the tweets span years. ONLY use synced_at when the user explicitly asks about import/sync dates (e.g. "when did I sync", "what was imported today").
-- bookmarked_at: ALWAYS NULL in this database — never use this column.
-- DEFAULT: When the user says "this month", "last 6 months", "over time", "trends", "recent", or any time-based query, ALWAYS use posted_at (via parse_twitter_date_ymd). The synced_at column does NOT reflect when tweets were posted or bookmarked — it only reflects the CLI import timestamp.
-- categories, domains: comma-separated strings (e.g. "ai,machine_learning")
-- primary_category, primary_domain: single value extracted from categories/domains
-- like_count, repost_count, bookmark_count: engagement integers
-- view_count: always NULL (not populated by data source)
-- links_json, tags_json, github_urls: JSON strings`;

  return cachedSchema;
}

// --- SQL safety ---

const DENY_RE = /\b(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE|TRUNCATE)\b/i;
const HAS_LIMIT_RE = /\blimit\b\s+\d+/i;

function sanitizeSql(q: string): string {
  let query = String(q ?? "").trim();

  const semis = [...query].filter((c) => c === ";").length;
  if (semis > 1 || (query.endsWith(";") && query.slice(0, -1).includes(";"))) {
    throw new Error("Multiple statements are not allowed.");
  }
  query = query.replace(/;+\s*$/g, "").trim();

  if (!query.toLowerCase().startsWith("select")) {
    throw new Error("Only SELECT statements are allowed.");
  }
  if (DENY_RE.test(query)) {
    throw new Error("DML/DDL detected. Only read-only queries are permitted.");
  }

  if (!HAS_LIMIT_RE.test(query)) {
    query += " LIMIT 500";
  }
  return query;
}

// --- execute_sql tool ---

const executeSql = tool(
  async ({ query }: { query: string }) => {
    const safe = sanitizeSql(query);
    try {
      const db = getDb();
      const rows = db.prepare(safe).all();
      return JSON.stringify(rows, null, 2);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return `Error: ${msg}`;
    }
  },
  {
    name: "execute_sql",
    description:
      "Execute a READ-ONLY SQLite SELECT query against the bookmarks database and return JSON rows. If the query fails, an error message is returned — revise and retry.",
    schema: z.object({
      query: z.string().describe("A valid SQLite SELECT query (read-only)."),
    }),
  },
);

// --- Build system prompt ---

function buildSystemPrompt(): SystemMessage {
  const schema = getBookmarksSchema();
  const promptText = `${OPENUI_PROMPT}

--- DATABASE SCHEMA ---

Authoritative schema (do not invent columns or tables):
${schema}

SQL Rules:
- Think step-by-step before writing SQL.
- Call execute_sql with ONE SELECT query at a time.
- Read-only only: no INSERT, UPDATE, DELETE, ALTER, DROP, CREATE, REPLACE, or TRUNCATE.
- Limit raw bookmark rows to 20 unless the user asks for more. For GROUP BY aggregations (monthly counts, category breakdowns, etc.), do NOT add a LIMIT — aggregated results are small and must be complete.
- For time-series queries ("over time", "trends", "monthly", dashboards, charts), always aggregate by MONTH using strftime('%Y-%m', parse_twitter_date_ymd(posted_at)) — not by individual day. Monthly granularity produces 12-30 data points which render cleanly in charts. Daily granularity produces hundreds of rows and bloats the context window. Only use daily granularity if the user explicitly asks for daily data or a narrow date range (e.g. "last 7 days").
- If execute_sql returns "Error:", revise the SQL and try again (max 5 attempts).
- Prefer explicit column lists over SELECT *.
- For date filtering, use the custom function parse_twitter_date_ymd(posted_at) which returns 'YYYY-MM-DD'.
- For full-text search, JOIN bookmarks_fts: SELECT b.* FROM bookmarks b JOIN bookmarks_fts fts ON b.rowid = fts.rowid WHERE fts.bookmarks_fts MATCH 'term'
- For category/domain filtering, use primary_category or primary_domain columns (single values).

Output Rules:
- ALWAYS call execute_sql first when the user's question involves their bookmark data, even if you plan to answer in plain text. Never guess or assume data — always verify by querying.
- After retrieving data, choose your response format:
  - openui-lang: Use for data-rich presentations (dashboards, charts, tables, KPIs, ranked lists, breakdowns). Your response must be raw openui-lang — no markdown, no prose.
  - Plain text: Use for conversational follow-ups, explanations, summaries, clarifications, or when the data answer is simple enough for a sentence or two. Respond in markdown prose.
- Only skip execute_sql for purely meta questions (e.g. "what can you do?", "how does this work?").
- Never mix the two formats in a single response.${isWebSearchAvailable() ? `

--- WEB SEARCH ---
You have a TavilySearch tool that searches the internet for current information.
Use it when:
- The user asks to research, investigate, or explore a topic beyond their bookmarks.
- Bookmark data alone is insufficient to fully answer the question.
- The user wants current or recent information not captured in bookmarks.
- You need to verify or supplement bookmark data with external sources.
When combining web search with bookmark data, ALWAYS query the bookmarks database
first for context, then search the web, then synthesize both sources in your response.` : ""}`;

  const contentBlock: Record<string, unknown> = { type: "text", text: promptText };
  if (detectProvider() === "anthropic") {
    contentBlock.cache_control = { type: "ephemeral" };
  }
  return new SystemMessage({ content: [contentBlock] });
}

// --- Model string for createAgent ---

function getModelString(): string {
  if (process.env.CHAT_MODEL) return process.env.CHAT_MODEL;
  const provider = detectProvider();
  if (provider === "anthropic") return "anthropic:claude-sonnet-4-6";
  if (provider === "openai") return "openai:gpt-5.4-mini";
  throw new Error("No LLM API key configured for Pro mode.");
}

// --- Stream event types ---

type OracleStreamEvent =
  | { step: "model"; status: "thinking" }
  | { step: "tools"; status: "querying" | "executed" }
  | { step: "token"; content: string }
  | { step: "token_reset" }
  | { step: "done"; answer: string; mode: "pro" };

// --- Public handler ---

export async function* handleOracleProQueryStream(
  query: string,
  context: OracleContext[],
): AsyncGenerator<OracleStreamEvent> {
  const modelStr = getModelString();

  const tools = isWebSearchAvailable()
    ? [executeSql, new TavilySearch({ maxResults: 5 })]
    : [executeSql];

  const agent = createAgent({
    model: modelStr,
    tools,
    systemPrompt: buildSystemPrompt(),
    maxIterations: 8,
    middleware: [anthropicPromptCachingMiddleware({ ttl: "5m" })],
  });

  const messages: { role: "user" | "assistant"; content: string }[] = [];
  for (const c of context) {
    messages.push({ role: c.role, content: c.content });
  }
  messages.push({ role: "user", content: query });

  let finalAnswer = "";
  let yieldedThinking = false;
  let streamedTokens = false;

  for await (const [mode, chunk] of await agent.stream(
    { messages },
    { streamMode: ["updates", "messages"] },
  )) {
    if (mode === "updates") {
      const entries = Object.entries(chunk as Record<string, unknown>);
      if (entries.length === 0) continue;
      const [step, content] = entries[0] as [string, Record<string, unknown>];
      const msgs = content.messages as Record<string, unknown>[] | undefined;
      const lastMsg = msgs?.at(-1);

      if (step === "tools") {
        if (streamedTokens) {
          yield { step: "token_reset" };
          streamedTokens = false;
        }
        yield { step: "tools", status: "executed" };
        yieldedThinking = false;
      } else if (lastMsg) {
        const toolCalls = (lastMsg as Record<string, unknown>).tool_calls as unknown[] | undefined;
        if (toolCalls?.length && !yieldedThinking) {
          yield { step: "model", status: "thinking" };
          yieldedThinking = true;
        }
        const msgContent = lastMsg.content;
        if (typeof msgContent === "string" && msgContent) {
          finalAnswer = msgContent;
        } else if (Array.isArray(msgContent)) {
          const text = (msgContent as Record<string, unknown>[])
            .filter((b) => b.type === "text" && typeof b.text === "string")
            .map((b) => b.text as string)
            .join("");
          if (text) finalAnswer = text;
        } else if (msgContent && typeof msgContent !== "string") {
          finalAnswer = JSON.stringify(msgContent);
        }
      }
    } else if (mode === "messages") {
      const [messageChunk, metadata] = chunk as [Record<string, unknown>, Record<string, unknown>];
      if (metadata.langgraph_node === "tools") continue;

      const rawContent = messageChunk.content;
      let tokenText = "";

      if (typeof rawContent === "string") {
        tokenText = rawContent;
      } else if (Array.isArray(rawContent)) {
        tokenText = (rawContent as Record<string, unknown>[])
          .filter((b) => typeof b.text === "string")
          .map((b) => b.text as string)
          .join("");
      }

      if (tokenText) {
        streamedTokens = true;
        yield { step: "token", content: tokenText };
      }
    }
  }

  yield {
    step: "done",
    answer: finalAnswer,
    mode: "pro",
  };
}
