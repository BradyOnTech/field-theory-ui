// Oracle NL-to-query translation: LLM CLI integration (Claude or Codex) with fallback pattern matching.

import { execFileSync, spawn } from "child_process";
import {
  searchBookmarks,
  getStats,
  getRecent,
  getCategories,
  getDomains,
  getTopAuthors,
  type BookmarkResult,
  type SearchResult,
  type StatsResult,
  type CategoryResult,
  type DomainResult,
  type TopAuthorResult,
} from "./queries";

// --- Types ---

export interface OracleContext {
  role: "user" | "assistant";
  content: string;
  apiCall?: string;
}

interface OracleResponse {
  answer: string;
  apiCall: string;
  results: BookmarkResult[];
  total: number;
}

interface ParsedIntent {
  endpoint: string;
  params: Record<string, string>;
  intent: "count" | "list" | "stats" | "categories" | "domains" | "authors";
}

// --- LLM engine detection (Claude CLI or Codex CLI) ---

type LlmEngine = "claude" | "codex";
let cachedEngine: LlmEngine | null | undefined = undefined;

function detectEngine(): LlmEngine | null {
  if (cachedEngine !== undefined) return cachedEngine;
  try {
    execFileSync("which", ["claude"], { stdio: "ignore" });
    cachedEngine = "claude";
    return cachedEngine;
  } catch { /* not found */ }
  try {
    execFileSync("which", ["codex"], { stdio: "ignore" });
    cachedEngine = "codex";
    return cachedEngine;
  } catch { /* not found */ }
  cachedEngine = null;
  return cachedEngine;
}

// --- LLM CLI invocation ---

function buildPrompt(query: string, context: OracleContext[]): string {
  const contextStr = context.length > 0
    ? context
        .map((c) => `${c.role}: ${c.content}${c.apiCall ? ` [API: ${c.apiCall}]` : ""}`)
        .join("\n")
    : "No previous conversation.";

  const totalBookmarks = getStats().totalBookmarks;

  return `You are a bookmark search assistant. The user has a collection of ${totalBookmarks} bookmarks from X/Twitter stored in a SQLite database.

Available API endpoints:
- /api/search?q=TEXT&author=HANDLE&category=CATEGORY&domain=DOMAIN&after=YYYY-MM-DD&before=YYYY-MM-DD&limit=N
  Returns: { results: [...], total: number }
  Categories available: technique, tool, concept, research, tutorial, news, opinion, resource, announcement, discussion, case_study, comparison, best_practice, architecture, integration, workflow, library, framework, model, dataset, benchmark, paper, demo, thread
  Domains available: ai, web, devops, security, data, mobile, cloud, blockchain, design, iot, gaming, finance, health, education, science, media, social, ecommerce, productivity, developer_tools, open_source, infrastructure, machine_learning, natural_language_processing, computer_vision
- /api/stats - Returns: { totalBookmarks, uniqueAuthors, dateRange, thisWeekCount, classifiedCount }
- /api/recent?limit=N - Returns: array of recent bookmarks
- /api/categories - Returns: array of { name, count }
- /api/domains - Returns: array of { name, count }
- /api/top-authors?limit=N - Returns: array of { author_handle, count, ... }

Previous conversation context:
${contextStr}

User query: "${query}"

Respond with ONLY a valid JSON object (no markdown, no explanation). Choose the most appropriate endpoint and parameters:
{"endpoint": "/api/search", "params": {"q": "AI"}, "intent": "count"}

Rules:
- intent must be one of: "count", "list", "stats", "categories", "domains", "authors"
- For "how many" / counting queries, use intent "count" with /api/search
- For "show me" / listing queries, use intent "list" with /api/search or /api/recent
- For general stats, use /api/stats with intent "stats"
- For category questions, use /api/categories with intent "categories"
- For domain questions, use /api/domains with intent "domains"
- For author questions, use /api/top-authors with intent "authors"
- When user references previous context (e.g., "now just from @handle"), combine the prior search params with the new constraint
- For author handles, omit the @ symbol in the param value
- Keep limit reasonable: 10 for list, 20 for search results`;
}

function execLlm(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      timeout: 30000,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.on("close", (code: number) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${bin} exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function callLlm(prompt: string): Promise<ParsedIntent | null> {
  const engine = detectEngine();
  if (!engine) return null;

  try {
    const bin = engine === "claude" ? "claude" : "codex";
    const args = engine === "claude"
      ? ["-p", "--output-format", "text", prompt]
      : ["exec", prompt];

    const stdout = await execLlm(bin, args);

    // Parse Claude's response - extract JSON from the output
    const trimmed = stdout.trim();

    // Robust JSON extraction: find the first '{' and last '}' and try to parse
    // This handles nested JSON (e.g., params with objects/arrays)
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

    const jsonCandidate = trimmed.slice(firstBrace, lastBrace + 1);
    let parsed: ParsedIntent | null = null;

    // Try parsing the full substring first
    try {
      parsed = JSON.parse(jsonCandidate) as ParsedIntent;
    } catch {
      // If that fails, try progressively shorter substrings from the end
      // (in case there's trailing text after the JSON)
      for (let end = lastBrace; end > firstBrace; end--) {
        if (trimmed[end] === "}") {
          try {
            parsed = JSON.parse(trimmed.slice(firstBrace, end + 1)) as ParsedIntent;
            break;
          } catch {
            continue;
          }
        }
      }
    }

    if (!parsed || !parsed.endpoint || !parsed.intent) return null;
    return parsed;
  } catch {
    return null;
  }
}

// --- Shared text utilities ---

const STOP_WORDS = new Set([
  "do", "i", "have", "are", "there", "is", "the", "a", "an", "my", "me",
  "we", "you", "they", "it", "that", "this", "what", "which", "who",
  "can", "could", "would", "should", "will", "does", "did", "was", "were",
  "been", "being", "be", "has", "had", "having", "please", "just", "also",
  "show", "find", "about",
]);

function extractKeywords(text: string): string {
  return text
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .join(" ")
    .trim();
}

// --- Fallback pattern matching ---

function fallbackParsing(query: string, context: OracleContext[]): ParsedIntent {
  const lower = query.toLowerCase().trim();

  // Extract prior context params if this is a follow-up
  const priorParams: Record<string, string> = {};
  if (context.length > 0) {
    const lastAssistant = [...context].reverse().find((c) => c.role === "assistant" && c.apiCall);
    if (lastAssistant?.apiCall) {
      const urlMatch = lastAssistant.apiCall.match(/\?(.+)$/);
      if (urlMatch) {
        const sp = new URLSearchParams(urlMatch[1]);
        for (const [key, val] of sp.entries()) {
          if (key !== "limit" && key !== "offset") {
            priorParams[key] = val;
          }
        }
      }
    }
  }

  // Check if this is a follow-up with author constraint
  const authorFollowUp = lower.match(/(?:just|only|now)\s+(?:from|by)\s+@?(\w+)/);
  if (authorFollowUp && Object.keys(priorParams).length > 0) {
    return {
      endpoint: "/api/search",
      params: { ...priorParams, author: authorFollowUp[1]!, limit: "10" },
      intent: "list",
    };
  }

  // Check if this references prior context with category/domain constraint
  const categoryFollowUp = lower.match(
    /(?:just|only|now)\s+(?:in|about|with)\s+(?:category\s+)?(\w+)/,
  );
  if (categoryFollowUp && Object.keys(priorParams).length > 0) {
    return {
      endpoint: "/api/search",
      params: { ...priorParams, category: categoryFollowUp[1]!, limit: "10" },
      intent: "list",
    };
  }

  // Stats query
  if (lower.match(/(?:how many|total|count)\s+(?:bookmarks?|total)/)) {
    // Check for topic/keyword in the query
    const aboutMatch = lower.match(
      /(?:about|on|related to|regarding|for|with)\s+(.+?)(?:\?|$)/,
    );
    if (aboutMatch) {
      const keyword = extractKeywords(aboutMatch[1]!);
      if (keyword) {
        return {
          endpoint: "/api/search",
          params: { q: keyword, ...priorParams },
          intent: "count",
        };
      }
    }
    return { endpoint: "/api/stats", params: {}, intent: "stats" };
  }

  // "how many" with topic
  if (lower.match(/how many/)) {
    const aboutMatch = lower.match(
      /(?:about|on|related to|regarding|for|with|tagged)\s+(.+?)(?:\?|$)/,
    );
    if (aboutMatch) {
      const keyword = extractKeywords(aboutMatch[1]!);
      if (keyword) {
        return {
          endpoint: "/api/search",
          params: { q: keyword, ...priorParams },
          intent: "count",
        };
      }
    }
    return { endpoint: "/api/stats", params: {}, intent: "stats" };
  }

  // Recent bookmarks
  if (lower.match(/(?:recent|latest|newest|last)\s/)) {
    const params: Record<string, string> = { limit: "10", ...priorParams };

    // Check for category
    const catMatch = lower.match(
      /(?:tool|technique|concept|research|tutorial|news|opinion|resource|announcement|discussion)/,
    );
    if (catMatch) {
      params.category = catMatch[0];
    }

    // Check for domain
    const domMatch = lower.match(
      /(?:ai|web|devops|security|data|mobile|cloud|blockchain|design)/,
    );
    if (domMatch) {
      params.domain = domMatch[0];
    }

    // Check for author
    const authMatch = lower.match(/@(\w+)/);
    if (authMatch) {
      params.author = authMatch[1]!;
    }

    return { endpoint: "/api/search", params, intent: "list" };
  }

  // "show me" queries
  if (lower.match(/(?:show|find|get|list|search|look)/)) {
    const params: Record<string, string> = { limit: "10", ...priorParams };

    // Extract search terms
    const searchMatch = lower.match(
      /(?:show me|find|get|list|search for|look for)\s+(.+?)(?:\s+bookmarks?|\s+from\s|$)/,
    );

    // Check for category
    const catMatch = lower.match(
      /\b(tool|technique|concept|research|tutorial|news|opinion|resource|announcement|discussion)\b/,
    );
    if (catMatch) {
      params.category = catMatch[1]!;
    }

    // Check for domain
    const domMatch = lower.match(
      /\b(ai|web|devops|security|data|mobile|cloud|blockchain|design)\b/,
    );
    if (domMatch) {
      params.domain = domMatch[1]!;
    }

    // Check for author
    const authMatch = lower.match(/@(\w+)/);
    if (authMatch) {
      params.author = authMatch[1]!;
    }

    // Extract keywords for text search
    if (searchMatch) {
      let keywords = searchMatch[1]!
        .replace(/\b(recent|latest|newest|my|the|all|some|any|about)\b/gi, "")
        .replace(/\b(bookmarks?|posts?|tweets?)\b/gi, "")
        .trim();
      // Remove words that are already captured as params
      if (params.category) keywords = keywords.replace(new RegExp(`\\b${params.category}\\b`, "gi"), "").trim();
      if (params.domain) keywords = keywords.replace(new RegExp(`\\b${params.domain}\\b`, "gi"), "").trim();
      if (keywords) params.q = keywords;
    }

    return { endpoint: "/api/search", params, intent: "list" };
  }

  // Author queries
  if (lower.match(/(?:top|best|most|popular)\s+(?:authors|people|users)/)) {
    return { endpoint: "/api/top-authors", params: { limit: "10" }, intent: "authors" };
  }

  // Category queries
  if (lower.match(/(?:what|which)\s+categor/)) {
    return { endpoint: "/api/categories", params: {}, intent: "categories" };
  }

  // Domain queries
  if (lower.match(/(?:what|which)\s+domain/)) {
    return { endpoint: "/api/domains", params: {}, intent: "domains" };
  }

  // Default: text search with the query as keyword
  const cleaned = lower.replace(/[?!.,;:'"]/g, "");
  const searchTerms = extractKeywords(cleaned).split(" ").slice(0, 3).join(" ");

  return {
    endpoint: "/api/search",
    params: { q: searchTerms || lower.slice(0, 50), ...priorParams, limit: "10" },
    intent: lower.includes("how many") || lower.includes("count") ? "count" : "list",
  };
}

// --- Execute the API call internally ---

function executeApiCall(
  parsed: ParsedIntent,
): { results: BookmarkResult[]; total: number; rawData?: unknown } {
  switch (parsed.endpoint) {
    case "/api/search": {
      const result: SearchResult = searchBookmarks({
        q: parsed.params.q,
        author: parsed.params.author,
        category: parsed.params.category,
        domain: parsed.params.domain,
        after: parsed.params.after,
        before: parsed.params.before,
        limit: parsed.params.limit ? parseInt(parsed.params.limit, 10) : 20,
        offset: parsed.params.offset ? parseInt(parsed.params.offset, 10) : 0,
      });
      return { results: result.results, total: result.total };
    }
    case "/api/stats": {
      const stats: StatsResult = getStats();
      return {
        results: [],
        total: stats.totalBookmarks,
        rawData: stats,
      };
    }
    case "/api/recent": {
      const limit = parsed.params.limit ? parseInt(parsed.params.limit, 10) : 10;
      const bookmarks = getRecent(limit);
      return { results: bookmarks, total: bookmarks.length };
    }
    case "/api/categories": {
      const cats: CategoryResult[] = getCategories();
      return {
        results: [],
        total: cats.length,
        rawData: cats,
      };
    }
    case "/api/domains": {
      const doms: DomainResult[] = getDomains();
      return {
        results: [],
        total: doms.length,
        rawData: doms,
      };
    }
    case "/api/top-authors": {
      const limit = parsed.params.limit ? parseInt(parsed.params.limit, 10) : 10;
      const authors: TopAuthorResult[] = getTopAuthors(limit);
      return {
        results: [],
        total: authors.length,
        rawData: authors,
      };
    }
    default:
      return { results: [], total: 0 };
  }
}

// --- Format the API call string for transparency ---

function formatApiCall(parsed: ParsedIntent): string {
  const paramEntries = Object.entries(parsed.params).filter(
    ([, v]) => v !== undefined && v !== "",
  );
  if (paramEntries.length === 0) return parsed.endpoint;
  const qs = paramEntries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  return `${parsed.endpoint}?${qs}`;
}

// --- Generate natural language answer ---

function generateAnswer(
  parsed: ParsedIntent,
  data: { results: BookmarkResult[]; total: number; rawData?: unknown },
): string {
  switch (parsed.intent) {
    case "count": {
      const topic = parsed.params.q || "matching";
      return `You have ${data.total} bookmarks about "${topic}".`;
    }
    case "list": {
      if (data.results.length === 0) {
        return "No bookmarks found matching your query.";
      }
      const qualifier = parsed.params.category ? ` in category "${parsed.params.category}"` : "";
      const authorQ = parsed.params.author ? ` from @${parsed.params.author}` : "";
      return `Found ${data.total} bookmarks${qualifier}${authorQ}. Here are ${Math.min(data.results.length, data.total)}:`;
    }
    case "stats": {
      const stats = data.rawData as StatsResult;
      return `Your collection has ${stats.totalBookmarks.toLocaleString()} total bookmarks from ${stats.uniqueAuthors.toLocaleString()} unique authors. ${stats.thisWeekCount} were added this week, and ${stats.classifiedCount.toLocaleString()} are classified.`;
    }
    case "categories": {
      const cats = data.rawData as CategoryResult[];
      const top5 = cats.slice(0, 5).map((c) => `${c.name} (${c.count})`).join(", ");
      return `There are ${cats.length} categories. Top 5: ${top5}.`;
    }
    case "domains": {
      const doms = data.rawData as DomainResult[];
      const top5 = doms.slice(0, 5).map((d) => `${d.name} (${d.count})`).join(", ");
      return `There are ${doms.length} domains. Top 5: ${top5}.`;
    }
    case "authors": {
      const authors = data.rawData as TopAuthorResult[];
      const top5 = authors
        .slice(0, 5)
        .map((a) => `@${a.author_handle} (${a.count})`)
        .join(", ");
      return `Top authors: ${top5}.`;
    }
    default:
      return `Found ${data.total} results.`;
  }
}

// --- Detect count-type queries and ensure they use /api/search ---

function isCountQuery(query: string): boolean {
  const lower = query.toLowerCase();
  return /how many/.test(lower) || /\bcount\b/.test(lower);
}

function enforceCountQuerySearch(parsed: ParsedIntent, query: string): ParsedIntent {
  // For count-type queries, always use /api/search with FTS5 text matching.
  // Never use /api/categories or /api/domains for "how many" queries —
  // those return domain/category totals (e.g. domain=ai → 3243) which
  // don't match FTS5 search totals (e.g. search q=AI → ~984).
  if (!isCountQuery(query)) return parsed;

  // If already using /api/search with a query term and count intent, keep it
  if (parsed.endpoint === "/api/search" && parsed.params.q && parsed.intent === "count") {
    return parsed;
  }

  // Extract keyword from params or from the original query
  let keyword = parsed.params.q || parsed.params.name || "";

  if (!keyword) {
    // Try to extract keyword from the query text
    const lower = query.toLowerCase();
    const aboutMatch = lower.match(
      /(?:about|on|related to|regarding|for|with|tagged)\s+(.+?)(?:\?|$)/,
    );
    if (aboutMatch) {
      keyword = extractKeywords(aboutMatch[1]!);
    }
  }

  // If we still have no keyword, check if this was a "how many total bookmarks" type query
  // which should go to /api/stats
  if (!keyword) {
    const lower = query.toLowerCase();
    if (lower.match(/(?:how many|total|count)\s+(?:bookmarks?|total)/)) {
      return { endpoint: "/api/stats", params: {}, intent: "stats" };
    }
    return parsed; // No keyword to search for, keep original
  }

  // Preserve any existing filter params (author, category, date range)
  // but switch to /api/search
  const searchParams: Record<string, string> = { q: keyword };
  if (parsed.params.author) searchParams.author = parsed.params.author;
  if (parsed.params.after) searchParams.after = parsed.params.after;
  if (parsed.params.before) searchParams.before = parsed.params.before;

  return {
    endpoint: "/api/search",
    params: searchParams,
    intent: "count",
  };
}

// --- Main Oracle handler ---

export async function handleOracleQuery(
  query: string,
  context: OracleContext[],
): Promise<OracleResponse> {
  let parsed: ParsedIntent;
  const engine = detectEngine();

  if (engine) {
    const prompt = buildPrompt(query, context);
    const llmResult = await callLlm(prompt);
    if (llmResult) {
      parsed = llmResult;
    } else {
      parsed = fallbackParsing(query, context);
    }
  } else {
    parsed = fallbackParsing(query, context);
  }

  // Enforce: count-type queries ("how many") always use /api/search with FTS5
  parsed = enforceCountQuerySearch(parsed, query);

  const apiCall = formatApiCall(parsed);
  const data = executeApiCall(parsed);
  const answer = generateAnswer(parsed, data);

  return {
    answer,
    apiCall,
    results: data.results,
    total: data.total,
  };
}

// Export for testing
export { fallbackParsing, formatApiCall, isCountQuery, enforceCountQuerySearch };
