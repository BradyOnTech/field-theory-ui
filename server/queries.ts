// All SQLite queries go in this file. No raw SQL elsewhere.

import Database from "better-sqlite3";
import { readFileSync, writeFileSync, existsSync } from "fs";
import path from "path";
import os from "os";

const TWITTER_MONTHS: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

/**
 * Parse a date string into ISO format, supporting both Twitter-style and ISO 8601.
 * Twitter input:  "Mon Apr 06 15:40:46 +0000 2026"
 * ISO input:      "2026-04-06T15:40:46.000Z"
 * Output:         "2026-04-06T15:40:46.000Z"
 */
function parseTwitterDateToISO(dateStr: string | null): string | null {
  if (!dateStr || typeof dateStr !== "string") return null;

  const trimmed = dateStr.trim();

  // ISO 8601 detection: starts with YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) return date.toISOString();
    return null;
  }

  // Twitter format parsing
  const parts = trimmed.split(/\s+/);
  if (parts.length < 6) return null;

  const monthStr = parts[1];
  const day = parts[2];
  const time = parts[3];
  const offset = parts[4];
  const year = parts[5];

  if (!monthStr || !day || !time || !offset || !year) return null;

  const month = TWITTER_MONTHS[monthStr];
  if (!month) return null;

  const paddedDay = day.padStart(2, "0");

  // Parse timezone offset to adjust to UTC
  const offsetSign = offset.startsWith("-") ? -1 : 1;
  const offsetHours = parseInt(offset.slice(1, 3), 10);
  const offsetMinutes = parseInt(offset.slice(3, 5), 10);

  if (isNaN(offsetHours) || isNaN(offsetMinutes)) return null;

  // Build a Date object and adjust for offset
  const timeParts = time.split(":");
  if (timeParts.length !== 3) return null;

  const h = parseInt(timeParts[0]!, 10);
  const m = parseInt(timeParts[1]!, 10);
  const s = parseInt(timeParts[2]!, 10);

  if (isNaN(h) || isNaN(m) || isNaN(s)) return null;

  const totalOffsetMinutes = offsetSign * (offsetHours * 60 + offsetMinutes);
  const date = new Date(
    Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(paddedDay, 10), h, m, s) -
      totalOffsetMinutes * 60 * 1000,
  );

  if (isNaN(date.getTime())) return null;

  return date.toISOString();
}

/**
 * Parse a Twitter date string to YYYY-MM-DD format for grouping.
 */
function parseTwitterDateToYMD(dateStr: string | null): string | null {
  const iso = parseTwitterDateToISO(dateStr);
  if (!iso) return null;
  return iso.slice(0, 10);
}

// Database connection
const dbDir = process.env.FT_DATA_DIR || path.join(os.homedir(), ".ft-bookmarks");
const dbPath = path.join(dbDir, "bookmarks.db");

let schemaValidated = false;

// Required columns in the bookmarks table -- validated on first access
const REQUIRED_COLUMNS = [
  "id",
  "text",
  "author_handle",
  "posted_at",
  "categories",
  "primary_category",
  "domains",
  "primary_domain",
  "like_count",
  "repost_count",
  "bookmark_count",
  "github_urls",
] as const;

const OPTIONAL_COLUMNS = [
  "conversation_id",
  "in_reply_to_status_id",
  "quoted_status_id",
  "quoted_tweet_json",
  "tags_json",
  "ingested_via",
] as const;

export function getDb(): Database.Database {
  const database = new Database(dbPath, { readonly: true, fileMustExist: true });

  if (!schemaValidated) {
    validateSchema(database);
    schemaValidated = true;
  }

  database.function("parse_twitter_date_ymd", (dateStr: unknown) => {
    if (typeof dateStr !== "string") return null;
    return parseTwitterDateToYMD(dateStr);
  });

  database.function("parse_twitter_date_iso", (dateStr: unknown) => {
    if (typeof dateStr !== "string") return null;
    return parseTwitterDateToISO(dateStr);
  });

  return database;
}

// --- Writable DB handle (for Collections) ---
//
// Collections are a UI-owned concept that don't exist in the ft-synced schema.
// We keep a single cached read-write connection scoped to Collections tables.
// Readonly getDb() connections see the new tables too (same file), but are
// never mutated. ft sync only touches the bookmarks table, not ours.

let writableDb: Database.Database | null = null;

export function getWritableDb(): Database.Database {
  if (writableDb) return writableDb;

  const database = new Database(dbPath, { fileMustExist: true });
  ensureCollectionsSchema(database);

  database.function("parse_twitter_date_ymd", (dateStr: unknown) => {
    if (typeof dateStr !== "string") return null;
    return parseTwitterDateToYMD(dateStr);
  });

  database.function("parse_twitter_date_iso", (dateStr: unknown) => {
    if (typeof dateStr !== "string") return null;
    return parseTwitterDateToISO(dateStr);
  });

  writableDb = database;
  return writableDb;
}

function ensureCollectionsSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_collections_slug ON collections(slug);

    CREATE TABLE IF NOT EXISTS bookmark_collections (
      bookmark_id TEXT NOT NULL,
      collection_id INTEGER NOT NULL,
      added_at TEXT NOT NULL,
      added_by TEXT NOT NULL DEFAULT 'user',
      note TEXT,
      PRIMARY KEY (bookmark_id, collection_id),
      FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_bookmark_collections_bookmark
      ON bookmark_collections(bookmark_id);
    CREATE INDEX IF NOT EXISTS idx_bookmark_collections_collection
      ON bookmark_collections(collection_id);
  `);
}

/**
 * Validate that the bookmarks database has the expected schema.
 * Checks required columns in the bookmarks table and verifies
 * the bookmarks_fts FTS5 table exists. Throws a descriptive error
 * if validation fails.
 */
function validateSchema(database: Database.Database): void {
  // Check bookmarks table columns via PRAGMA table_info
  const columns = database.prepare("PRAGMA table_info(bookmarks)").all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((col) => col.name));

  const missingColumns = REQUIRED_COLUMNS.filter((col) => !columnNames.has(col));
  if (missingColumns.length > 0) {
    throw new Error(
      `Schema mismatch: bookmarks table is missing column ${missingColumns.join(", ")}. ` +
        "Please update the fieldtheory CLI: npm update -g fieldtheory && ft sync",
    );
  }

  const missingOptional = OPTIONAL_COLUMNS.filter((col) => !columnNames.has(col));
  if (missingOptional.length > 0) {
    console.warn(
      `Schema info: bookmarks table is missing optional columns: ${missingOptional.join(", ")}. ` +
        "Some features may be limited. Consider: npm update -g fieldtheory && ft sync",
    );
  }

  // Check that bookmarks_fts FTS5 table exists
  const ftsTable = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bookmarks_fts'")
    .get() as { name: string } | undefined;

  if (!ftsTable) {
    throw new Error(
      "Schema mismatch: bookmarks_fts table is missing. " +
        "Please update the fieldtheory CLI: npm update -g fieldtheory && ft sync",
    );
  }
}

// --- Raw row types (allow `any` for raw SQL rows per project convention) ---

/* eslint-disable @typescript-eslint/no-explicit-any */
type RawRow = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

// --- SQL helpers ---

const SPLIT_COLUMN_ALIAS: Record<string, string> = {
  categories: "cat",
  domains: "dom",
};

/**
 * Build the recursive CTE SQL for splitting a comma-separated column into
 * individual rows with counts. Used for both `categories` and `domains`.
 *
 * @param column - The column name to split ("categories" or "domains")
 * @param whereClause - Optional extra WHERE conditions prepended before the
 *   null/empty check (e.g. "author_handle = ? AND"). Must include trailing AND.
 */
function buildSplitColumnCTE(
  column: "categories" | "domains",
  whereClause?: string,
): string {
  const alias = SPLIT_COLUMN_ALIAS[column];
  const where = whereClause ? `${whereClause} ` : "";
  return `WITH RECURSIVE split AS (
        SELECT id,
               trim(substr(${column}, 1, instr(${column} || ',', ',') - 1)) as ${alias},
               substr(${column}, instr(${column} || ',', ',') + 1) as rest
        FROM bookmarks
        WHERE ${where}${column} IS NOT NULL AND ${column} != ''
        UNION ALL
        SELECT id,
               trim(substr(rest, 1, instr(rest || ',', ',') - 1)),
               substr(rest, instr(rest || ',', ',') + 1)
        FROM split
        WHERE rest != ''
      )
      SELECT ${alias} as name, COUNT(*) as count
      FROM split
      WHERE ${alias} != ''
      GROUP BY ${alias}
      ORDER BY count DESC`;
}

// --- Typed result interfaces ---

export interface StatsResult {
  totalBookmarks: number;
  uniqueAuthors: number;
  dateRange: {
    earliest: string;
    latest: string;
  };
  thisWeekCount: number;
  classifiedCount: number;
}

export interface BookmarkResult {
  id: string;
  tweet_id: string;
  url: string;
  text: string;
  author_handle: string;
  author_name: string;
  author_profile_image_url: string;
  posted_at: string;
  posted_at_iso: string;
  bookmarked_at: string | null;
  synced_at: string;
  language: string;
  like_count: number;
  repost_count: number;
  reply_count: number;
  quote_count: number;
  bookmark_count: number;
  view_count: number;
  media_count: number;
  link_count: number;
  links_json: string;
  categories: string;
  primary_category: string;
  domains: string;
  primary_domain: string;
  github_urls: string;
  conversation_id: string;
  in_reply_to_status_id: string;
  quoted_status_id: string;
  quoted_tweet_json: string;
  tags_json: string;
  ingested_via: string;
}

export interface CategoryResult {
  name: string;
  count: number;
}

export interface DomainResult {
  name: string;
  count: number;
}

interface TimelineResult {
  date: string;
  count: number;
}

export interface TopAuthorResult {
  author_handle: string;
  author_name: string;
  author_profile_image_url: string;
  count: number;
  primary_domain: string;
  categories: CategoryResult[];
}

// --- Query functions ---

export function getStats(): StatsResult {
  const database = getDb();

  const totalRow = database.prepare("SELECT COUNT(*) as total FROM bookmarks").get() as RawRow;
  const authorsRow = database
    .prepare("SELECT COUNT(DISTINCT author_handle) as total FROM bookmarks")
    .get() as RawRow;

  const dateRangeRow = database
    .prepare(
      `SELECT MIN(parse_twitter_date_iso(posted_at)) as earliest,
              MAX(parse_twitter_date_iso(posted_at)) as latest
       FROM bookmarks
       WHERE posted_at IS NOT NULL`,
    )
    .get() as RawRow;

  const earliest = (dateRangeRow?.earliest as string) || "";
  const latest = (dateRangeRow?.latest as string) || "";

  // Count bookmarks from this week
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekAgoISO = weekAgo.toISOString();

  const thisWeekRow = database
    .prepare(
      `SELECT COUNT(*) as total FROM bookmarks
       WHERE parse_twitter_date_iso(posted_at) >= ?`,
    )
    .get(weekAgoISO) as RawRow;

  const classifiedRow = database
    .prepare(
      "SELECT COUNT(*) as total FROM bookmarks WHERE categories IS NOT NULL AND categories != ''",
    )
    .get() as RawRow;

  return {
    totalBookmarks: totalRow.total as number,
    uniqueAuthors: authorsRow.total as number,
    dateRange: {
      earliest,
      latest,
    },
    thisWeekCount: (thisWeekRow.total as number) || 0,
    classifiedCount: classifiedRow.total as number,
  };
}

function mapBookmarkRow(row: RawRow): BookmarkResult {
  return {
    id: row.id as string,
    tweet_id: row.tweet_id as string,
    url: row.url as string,
    text: row.text as string,
    author_handle: row.author_handle as string,
    author_name: row.author_name as string,
    author_profile_image_url: (row.author_profile_image_url as string) || "",
    posted_at: row.posted_at as string,
    posted_at_iso: parseTwitterDateToISO(row.posted_at as string) || "",
    bookmarked_at: (row.bookmarked_at as string) || null,
    synced_at: row.synced_at as string,
    language: (row.language as string) || "",
    like_count: (row.like_count as number) || 0,
    repost_count: (row.repost_count as number) || 0,
    reply_count: (row.reply_count as number) || 0,
    quote_count: (row.quote_count as number) || 0,
    bookmark_count: (row.bookmark_count as number) || 0,
    view_count: (row.view_count as number) || 0,
    media_count: (row.media_count as number) || 0,
    link_count: (row.link_count as number) || 0,
    links_json: (row.links_json as string) || "",
    categories: (row.categories as string) || "",
    primary_category: (row.primary_category as string) || "",
    domains: (row.domains as string) || "",
    primary_domain: (row.primary_domain as string) || "",
    github_urls: (row.github_urls as string) || "",
    conversation_id: (row.conversation_id as string) || "",
    in_reply_to_status_id: (row.in_reply_to_status_id as string) || "",
    quoted_status_id: (row.quoted_status_id as string) || "",
    quoted_tweet_json: (row.quoted_tweet_json as string) || "",
    tags_json: (row.tags_json as string) || "",
    ingested_via: (row.ingested_via as string) || "",
  };
}

export function getRecent(limit = 20): BookmarkResult[] {
  const database = getDb();
  const rows = database
    .prepare(
      `SELECT * FROM bookmarks
       WHERE posted_at IS NOT NULL
       ORDER BY parse_twitter_date_iso(posted_at) DESC
       LIMIT ?`,
    )
    .all(limit) as RawRow[];

  return rows.map(mapBookmarkRow);
}

export function getCategories(): CategoryResult[] {
  const database = getDb();

  // Split comma-separated categories and count each
  const rows = database
    .prepare(buildSplitColumnCTE("categories"))
    .all() as RawRow[];

  return rows.map((row) => ({
    name: row.name as string,
    count: row.count as number,
  }));
}

export function getDomains(): DomainResult[] {
  const database = getDb();

  // Split comma-separated domains and count each
  const rows = database
    .prepare(buildSplitColumnCTE("domains"))
    .all() as RawRow[];

  return rows.map((row) => ({
    name: row.name as string,
    count: row.count as number,
  }));
}

export function getTimeline(days = 90): TimelineResult[] {
  const database = getDb();

  // Get all bookmarks with parsed dates, then group by day
  // We need to compute the cutoff date
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  const rows = database
    .prepare(
      `SELECT parse_twitter_date_ymd(posted_at) as date, COUNT(*) as count
       FROM bookmarks
       WHERE posted_at IS NOT NULL
         AND parse_twitter_date_ymd(posted_at) >= ?
       GROUP BY parse_twitter_date_ymd(posted_at)
       ORDER BY date ASC`,
    )
    .all(cutoffISO) as RawRow[];

  return rows
    .filter((row) => row.date !== null)
    .map((row) => ({
      date: row.date as string,
      count: row.count as number,
    }));
}

export function getTopAuthors(limit = 20): TopAuthorResult[] {
  const database = getDb();
  const safeLimit = Math.min(Math.max(1, limit), 10000);

  // Get top authors by count with their most common primary_domain
  const authorRows = database
    .prepare(
      `SELECT author_handle, author_name, author_profile_image_url,
              COUNT(*) as count,
              (SELECT b2.primary_domain FROM bookmarks b2
               WHERE b2.author_handle = bookmarks.author_handle
                 AND b2.primary_domain IS NOT NULL AND b2.primary_domain != ''
               GROUP BY b2.primary_domain
               ORDER BY COUNT(*) DESC LIMIT 1) as primary_domain
       FROM bookmarks
       GROUP BY author_handle
       ORDER BY count DESC
       LIMIT ?`,
    )
    .all(safeLimit) as RawRow[];

  // For small result sets, include category breakdown; for large ones, skip for performance
  if (safeLimit <= 100) {
    const getCategoriesStmt = database.prepare(
      buildSplitColumnCTE("categories", "author_handle = ? AND"),
    );

    return authorRows.map((row) => {
      const categories = getCategoriesStmt.all(row.author_handle) as RawRow[];
      return {
        author_handle: row.author_handle as string,
        author_name: (row.author_name as string) || "",
        author_profile_image_url: (row.author_profile_image_url as string) || "",
        count: row.count as number,
        primary_domain: (row.primary_domain as string) || "",
        categories: categories.map((c) => ({
          name: c.name as string,
          count: c.count as number,
        })),
      };
    });
  }

  // For large result sets, return without per-author category breakdown for performance
  return authorRows.map((row) => ({
    author_handle: row.author_handle as string,
    author_name: (row.author_name as string) || "",
    author_profile_image_url: (row.author_profile_image_url as string) || "",
    count: row.count as number,
    primary_domain: (row.primary_domain as string) || "",
    categories: [],
  }));
}

// --- Search result interfaces ---

export type SortKey =
  | "posted_desc"
  | "posted_asc"
  | "likes_desc"
  | "reposts_desc"
  | "bookmark_count_desc"
  | "relevance";

const VALID_SORTS: ReadonlySet<SortKey> = new Set<SortKey>([
  "posted_desc",
  "posted_asc",
  "likes_desc",
  "reposts_desc",
  "bookmark_count_desc",
  "relevance",
]);
// The synced ft dataset leaves bookmarked_at null, so preserve stale bookmark-date
// sort params by degrading them to the equivalent posted_at sorts.
const LEGACY_SORT_ALIASES: Readonly<Record<string, SortKey>> = {
  bookmarked_desc: "posted_desc",
  bookmarked_asc: "posted_asc",
};

function normalizeSort(sort: string | undefined, hasFts: boolean): SortKey {
  const normalized = sort ? (LEGACY_SORT_ALIASES[sort] ?? sort) : undefined;
  if (normalized && VALID_SORTS.has(normalized as SortKey)) {
    // Relevance only meaningful inside the FTS path; fall back otherwise.
    if (normalized === "relevance" && !hasFts) return "posted_desc";
    return normalized as SortKey;
  }
  return "posted_desc";
}

/**
 * Build the ORDER BY fragment for a given sort key. Uses the column prefix so
 * this works in both plain and JOINed (FTS) queries. NULLs are always placed
 * LAST so missing values don't dominate the top of the list.
 */
function buildSortClause(sort: SortKey, prefix = ""): string {
  const p = prefix;
  switch (sort) {
    case "posted_asc":
      return `ORDER BY parse_twitter_date_iso(${p}posted_at) ASC NULLS LAST, ${p}id ASC`;
    case "likes_desc":
      return `ORDER BY COALESCE(${p}like_count, 0) DESC, parse_twitter_date_iso(${p}posted_at) DESC`;
    case "reposts_desc":
      return `ORDER BY COALESCE(${p}repost_count, 0) DESC, parse_twitter_date_iso(${p}posted_at) DESC`;
    case "bookmark_count_desc":
      return `ORDER BY COALESCE(${p}bookmark_count, 0) DESC, parse_twitter_date_iso(${p}posted_at) DESC`;
    case "relevance":
      // FTS path only — handled inline there (bm25 then posted_at). Defensive fallback:
      return `ORDER BY parse_twitter_date_iso(${p}posted_at) DESC`;
    case "posted_desc":
    default:
      return `ORDER BY parse_twitter_date_iso(${p}posted_at) DESC NULLS LAST, ${p}id DESC`;
  }
}

interface SearchFilters {
  q?: string;
  author?: string;
  category?: string;
  domain?: string;
  collection?: string; // collection slug
  after?: string;
  before?: string;
  sort?: SortKey | string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  results: BookmarkResult[];
  total: number;
}

/**
 * Normalize a "before" date filter to ensure the entire day is included.
 * If the input is a date-only value (YYYY-MM-DD), we use < next_day instead of <= date
 * to include all timestamps within that day.
 * Returns { value: string, useStrictLessThan: boolean }
 */
function normalizeBeforeDate(before: string): { value: string; useStrictLessThan: boolean } {
  // Check if this is a date-only value (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(before)) {
    const date = new Date(before + "T00:00:00.000Z");
    if (!isNaN(date.getTime())) {
      // Add one day and use strict less-than
      const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);
      return { value: nextDay.toISOString(), useStrictLessThan: true };
    }
  }
  // Already has time component or is in another format -- use as-is with <=
  return { value: before, useStrictLessThan: false };
}

/**
 * Build WHERE clause conditions for search filters (author, category, domain,
 * after/before date). Used by both the FTS and non-FTS search paths.
 *
 * @param filters - The search filter parameters
 * @param tablePrefix - Column prefix, e.g. "b." for JOINed queries or "" for direct table queries
 * @returns Object with conditions array and corresponding parameter values
 */
function buildSearchFilters(
  filters: Pick<SearchFilters, "author" | "category" | "domain" | "collection" | "after" | "before">,
  tablePrefix = "",
): { conditions: string[]; values: (string | number)[] } {
  const { author, category, domain, collection, after, before } = filters;
  const p = tablePrefix;
  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (author) {
    conditions.push(`${p}author_handle = ?`);
    values.push(author);
  }
  if (category) {
    conditions.push(`(',' || ${p}categories || ',') LIKE '%,' || ? || ',%'`);
    values.push(category);
  }
  if (domain) {
    conditions.push(`(',' || ${p}domains || ',') LIKE '%,' || ? || ',%'`);
    values.push(domain);
  }
  if (collection) {
    // Subquery against bookmark_collections; slug is user-supplied so bind safely.
    conditions.push(
      `${p}id IN (SELECT bc.bookmark_id FROM bookmark_collections bc
                   JOIN collections c ON c.id = bc.collection_id
                   WHERE c.slug = ?)`,
    );
    values.push(collection);
  }
  if (after) {
    conditions.push(`parse_twitter_date_iso(${p}posted_at) >= ?`);
    values.push(after);
  }
  if (before) {
    const normalized = normalizeBeforeDate(before);
    if (normalized.useStrictLessThan) {
      conditions.push(`parse_twitter_date_iso(${p}posted_at) < ?`);
    } else {
      conditions.push(`parse_twitter_date_iso(${p}posted_at) <= ?`);
    }
    values.push(normalized.value);
  }

  return { conditions, values };
}

/**
 * Escape FTS5 special characters from user input to prevent query syntax crashes.
 * FTS5 operators: AND, OR, NOT, NEAR, *, ^, ", (, ), +, -
 * Strategy: strip/escape operators and special chars, wrap remaining terms in double quotes.
 */
function sanitizeFTS5Query(input: string): string {
  // Remove FTS5 special characters: " * ^ ( ) + - : { }
  let cleaned = input.replace(/[*^(){}":]/g, " ");
  // Remove standalone FTS5 operators: AND, OR, NOT, NEAR
  cleaned = cleaned.replace(/\b(AND|OR|NOT|NEAR)\b/gi, " ");
  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  // Wrap each remaining token in quotes for safe matching
  const tokens = cleaned.split(" ").filter((t) => t.length > 0);
  return tokens.map((t) => `"${t}"`).join(" ");
}

export function searchBookmarks(filters: SearchFilters): SearchResult {
  const database = getDb();
  const { q } = filters;
  const limit = Math.min(Math.max(1, filters.limit || 20), 100);
  const offset = Math.max(0, filters.offset || 0);

  // If there's a text query, use FTS5
  if (q && q.trim()) {
    const sanitized = sanitizeFTS5Query(q);
    if (!sanitized) {
      // Query had only special characters; fall through to non-FTS path
      return searchBookmarksNoFTS(filters, limit, offset);
    }

    // Build WHERE clauses for additional filters
    const { conditions, values: params } = buildSearchFilters(filters, "b.");

    const whereClause = conditions.length > 0 ? "AND " + conditions.join(" AND ") : "";

    // Count query
    const countSql = `
      SELECT COUNT(*) as total
      FROM bookmarks_fts fts
      JOIN bookmarks b ON b.rowid = fts.rowid
      WHERE bookmarks_fts MATCH ?
      ${whereClause}
    `;
    const countRow = database.prepare(countSql).get(sanitized, ...params) as RawRow;
    const total = (countRow?.total as number) || 0;

    const sort = normalizeSort(filters.sort, true);
    const orderBy =
      sort === "relevance"
        ? "ORDER BY bm25(bookmarks_fts), parse_twitter_date_iso(b.posted_at) DESC"
        : buildSortClause(sort, "b.");

    // Results query with BM25 ranking available as a secondary tiebreaker
    const resultsSql = `
      SELECT b.*, bm25(bookmarks_fts) as rank
      FROM bookmarks_fts fts
      JOIN bookmarks b ON b.rowid = fts.rowid
      WHERE bookmarks_fts MATCH ?
      ${whereClause}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;
    const rows = database.prepare(resultsSql).all(sanitized, ...params, limit, offset) as RawRow[];

    return {
      results: rows.map(mapBookmarkRow),
      total,
    };
  }

  // No text query — return filtered results without FTS5
  return searchBookmarksNoFTS(filters, limit, offset);
}

function searchBookmarksNoFTS(
  filters: SearchFilters,
  limit: number,
  offset: number,
): SearchResult {
  const database = getDb();

  const { conditions, values: params } = buildSearchFilters(filters);

  const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

  const countSql = `SELECT COUNT(*) as total FROM bookmarks ${whereClause}`;
  const countRow = database.prepare(countSql).get(...params) as RawRow;
  const total = (countRow?.total as number) || 0;

  const sort = normalizeSort(filters.sort, false);
  const orderBy = buildSortClause(sort);

  const resultsSql = `
    SELECT * FROM bookmarks
    ${whereClause}
    ${orderBy}
    LIMIT ? OFFSET ?
  `;
  const rows = database.prepare(resultsSql).all(...params, limit, offset) as RawRow[];

  return {
    results: rows.map(mapBookmarkRow),
    total,
  };
}

// --- Author Profile ---

interface ConnectedAuthorResult {
  author_handle: string;
  author_name: string;
  author_profile_image_url: string;
  co_occurrence_count: number;
}

interface AuthorProfileResult {
  author_handle: string;
  author_name: string;
  author_profile_image_url: string;
  bookmarkCount: number;
  categories: CategoryResult[];
  domains: DomainResult[];
  timeline: TimelineResult[];
  topPosts: BookmarkResult[];
  connectedAuthors: ConnectedAuthorResult[];
  firstBookmark: string;
  lastBookmark: string;
}

export function getAuthorProfile(handle: string): AuthorProfileResult | null {
  const database = getDb();

  // Get basic info and count
  const authorRow = database
    .prepare(
      `SELECT author_handle, author_name, author_profile_image_url, COUNT(*) as count
       FROM bookmarks
       WHERE author_handle = ?
       GROUP BY author_handle`,
    )
    .get(handle) as RawRow | undefined;

  if (!authorRow) return null;

  // Category breakdown
  const categoryRows = database
    .prepare(buildSplitColumnCTE("categories", "author_handle = ? AND"))
    .all(handle) as RawRow[];

  // Domain breakdown
  const domainRows = database
    .prepare(buildSplitColumnCTE("domains", "author_handle = ? AND"))
    .all(handle) as RawRow[];

  // Activity timeline (daily counts for this author)
  const timelineRows = database
    .prepare(
      `SELECT parse_twitter_date_ymd(posted_at) as date, COUNT(*) as count
       FROM bookmarks
       WHERE author_handle = ? AND posted_at IS NOT NULL
       GROUP BY parse_twitter_date_ymd(posted_at)
       ORDER BY date ASC`,
    )
    .all(handle) as RawRow[];

  // Top posts by engagement (like_count + repost_count per spec)
  const topPostRows = database
    .prepare(
      `SELECT *, (COALESCE(like_count, 0) + COALESCE(repost_count, 0)) as engagement
       FROM bookmarks
       WHERE author_handle = ?
       ORDER BY engagement DESC, COALESCE(like_count, 0) DESC, id ASC
       LIMIT 10`,
    )
    .all(handle) as RawRow[];

  // First and last bookmark dates
  const dateRangeRow = database
    .prepare(
      `SELECT MIN(parse_twitter_date_iso(posted_at)) as first_date,
              MAX(parse_twitter_date_iso(posted_at)) as last_date
       FROM bookmarks
       WHERE author_handle = ? AND posted_at IS NOT NULL`,
    )
    .get(handle) as RawRow;

  // Connected authors: other authors frequently co-bookmarked on the same day
  const connectedRows = database
    .prepare(
      `WITH author_dates AS (
        SELECT DISTINCT parse_twitter_date_ymd(posted_at) as date
        FROM bookmarks
        WHERE author_handle = ? AND posted_at IS NOT NULL
      )
      SELECT b.author_handle, b.author_name, b.author_profile_image_url,
             COUNT(DISTINCT ad.date) as co_occurrence_count
      FROM author_dates ad
      JOIN bookmarks b ON parse_twitter_date_ymd(b.posted_at) = ad.date
      WHERE b.author_handle != ?
      GROUP BY b.author_handle
      ORDER BY co_occurrence_count DESC
      LIMIT 15`,
    )
    .all(handle, handle) as RawRow[];

  return {
    author_handle: authorRow.author_handle as string,
    author_name: (authorRow.author_name as string) || "",
    author_profile_image_url: (authorRow.author_profile_image_url as string) || "",
    bookmarkCount: authorRow.count as number,
    categories: categoryRows.map((r) => ({
      name: r.name as string,
      count: r.count as number,
    })),
    domains: domainRows.map((r) => ({
      name: r.name as string,
      count: r.count as number,
    })),
    timeline: timelineRows
      .filter((r) => r.date !== null)
      .map((r) => ({
        date: r.date as string,
        count: r.count as number,
      })),
    topPosts: topPostRows.map(mapBookmarkRow),
    connectedAuthors: connectedRows.map((r) => ({
      author_handle: r.author_handle as string,
      author_name: (r.author_name as string) || "",
      author_profile_image_url: (r.author_profile_image_url as string) || "",
      co_occurrence_count: r.co_occurrence_count as number,
    })),
    firstBookmark: (dateRangeRow?.first_date as string) || "",
    lastBookmark: (dateRangeRow?.last_date as string) || "",
  };
}

// --- Single Bookmark ---

export function getBookmarkById(id: string): BookmarkResult | null {
  const database = getDb();
  const row = database
    .prepare("SELECT * FROM bookmarks WHERE id = ?")
    .get(id) as RawRow | undefined;

  if (!row) return null;
  return mapBookmarkRow(row);
}

// --- GitHub Repos ---

interface GitHubRepoResult {
  url: string;
  owner: string;
  repo: string;
  count: number;
  lastSeen: string;
}

export function getGitHubRepos(): GitHubRepoResult[] {
  const database = getDb();

  const rows = database
    .prepare(
      `SELECT github_urls, parse_twitter_date_iso(posted_at) as posted_iso FROM bookmarks
       WHERE github_urls IS NOT NULL AND github_urls != '' AND github_urls != '[]'`,
    )
    .all() as RawRow[];

  const repoCounts = new Map<string, { url: string; owner: string; repo: string; count: number; lastSeen: string }>();

  for (const row of rows) {
    const urlsStr = row.github_urls as string;
    const postedIso = (row.posted_iso as string) || "";
    let urls: string[];
    try {
      urls = JSON.parse(urlsStr) as string[];
    } catch {
      continue;
    }
    if (!Array.isArray(urls)) continue;

    const seenInRow = new Set<string>();

    for (const rawUrl of urls) {
      if (typeof rawUrl !== "string") continue;
      const match = rawUrl.match(/github\.com\/([^/]+)\/([^/?#]+)/);
      if (!match) continue;
      const owner = match[1]!;
      const repo = match[2]!.replace(/\.git$/, "");
      const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;

      if (seenInRow.has(key)) continue;
      seenInRow.add(key);

      const existing = repoCounts.get(key);
      if (existing) {
        existing.count++;
        if (postedIso > existing.lastSeen) existing.lastSeen = postedIso;
      } else {
        repoCounts.set(key, {
          url: `https://github.com/${owner}/${repo}`,
          owner,
          repo,
          count: 1,
          lastSeen: postedIso,
        });
      }
    }
  }

  return Array.from(repoCounts.values()).sort((a, b) => b.count - a.count);
}

// --- Random Bookmark ---

export function getRandomBookmark(): BookmarkResult | null {
  const database = getDb();
  const row = database
    .prepare("SELECT * FROM bookmarks ORDER BY RANDOM() LIMIT 1")
    .get() as RawRow | undefined;
  if (!row) return null;
  return mapBookmarkRow(row);
}

// --- Self Bookmarks ---

export function getSelfBookmarks(handle: string): BookmarkResult[] {
  const database = getDb();
  const rows = database
    .prepare(
      `SELECT * FROM bookmarks
       WHERE author_handle = ? COLLATE NOCASE
       ORDER BY parse_twitter_date_iso(posted_at) DESC`,
    )
    .all(handle) as RawRow[];

  return rows.map(mapBookmarkRow);
}

// --- Monthly Breakdown (Chronos) ---

interface MonthDomainCount {
  domain: string;
  count: number;
}

interface MonthCategoryCount {
  category: string;
  count: number;
}

interface MonthAuthor {
  author_handle: string;
  author_name: string;
  count: number;
}

interface MonthBookmark {
  id: string;
  text: string;
  author_handle: string;
  posted_at_iso: string;
  like_count: number;
  repost_count: number;
}

interface MonthlyBreakdownEntry {
  month: string; // YYYY-MM
  count: number;
  domains: MonthDomainCount[];
  categories: MonthCategoryCount[];
  topAuthors: MonthAuthor[];
  notableBookmarks: MonthBookmark[];
  newAuthors: string[];
}

export function getMonthlyBreakdown(): MonthlyBreakdownEntry[] {
  const database = getDb();

  // Get all bookmarks with parsed month
  const rows = database
    .prepare(
      `SELECT id, text, author_handle, author_name, posted_at,
              parse_twitter_date_iso(posted_at) as posted_at_iso,
              like_count, repost_count,
              primary_domain, primary_category
       FROM bookmarks
       WHERE posted_at IS NOT NULL AND parse_twitter_date_iso(posted_at) IS NOT NULL
       ORDER BY parse_twitter_date_iso(posted_at) ASC`,
    )
    .all() as RawRow[];

  // Group by month (YYYY-MM)
  const monthMap = new Map<
    string,
    {
      count: number;
      domainCounts: Map<string, number>;
      categoryCounts: Map<string, number>;
      authorCounts: Map<string, { name: string; count: number }>;
      bookmarks: Array<{
        id: string;
        text: string;
        author_handle: string;
        posted_at_iso: string;
        like_count: number;
        repost_count: number;
      }>;
    }
  >();

  // Track first appearance of each author to detect "new authors"
  const authorFirstMonth = new Map<string, string>();

  for (const row of rows) {
    const iso = row.posted_at_iso as string;
    if (!iso) continue;
    const month = iso.slice(0, 7); // YYYY-MM
    const handle = row.author_handle as string;
    const domain = (row.primary_domain as string) || "";
    const category = (row.primary_category as string) || "";

    if (!authorFirstMonth.has(handle)) {
      authorFirstMonth.set(handle, month);
    }

    let entry = monthMap.get(month);
    if (!entry) {
      entry = {
        count: 0,
        domainCounts: new Map(),
        categoryCounts: new Map(),
        authorCounts: new Map(),
        bookmarks: [],
      };
      monthMap.set(month, entry);
    }

    entry.count++;

    if (domain) {
      entry.domainCounts.set(domain, (entry.domainCounts.get(domain) || 0) + 1);
    }
    if (category) {
      entry.categoryCounts.set(category, (entry.categoryCounts.get(category) || 0) + 1);
    }

    const existing = entry.authorCounts.get(handle);
    if (existing) {
      existing.count++;
    } else {
      entry.authorCounts.set(handle, {
        name: (row.author_name as string) || "",
        count: 1,
      });
    }

    entry.bookmarks.push({
      id: row.id as string,
      text: row.text as string,
      author_handle: handle,
      posted_at_iso: iso,
      like_count: (row.like_count as number) || 0,
      repost_count: (row.repost_count as number) || 0,
    });
  }

  // Build sorted result
  const months = Array.from(monthMap.keys()).sort();

  return months.map((month) => {
    const entry = monthMap.get(month)!;

    const domains = Array.from(entry.domainCounts.entries())
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count);

    const categories = Array.from(entry.categoryCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    const topAuthors = Array.from(entry.authorCounts.entries())
      .map(([author_handle, { name, count }]) => ({
        author_handle,
        author_name: name,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Notable bookmarks: top by engagement
    const notableBookmarks = [...entry.bookmarks]
      .sort((a, b) => b.like_count + b.repost_count - (a.like_count + a.repost_count))
      .slice(0, 5)
      .map((b) => ({
        id: b.id,
        text: b.text,
        author_handle: b.author_handle,
        posted_at_iso: b.posted_at_iso,
        like_count: b.like_count,
        repost_count: b.repost_count,
      }));

    // New authors: authors whose first month is this month
    const newAuthors = Array.from(entry.authorCounts.keys()).filter(
      (handle) => authorFirstMonth.get(handle) === month,
    );

    return {
      month,
      count: entry.count,
      domains,
      categories,
      topAuthors,
      notableBookmarks,
      newAuthors,
    };
  });
}

// --- Technique Backlog (Forge) ---

interface TechniqueBookmarkResult {
  id: string;
  text: string;
  author_handle: string;
  author_name: string;
  posted_at_iso: string;
  like_count: number;
  repost_count: number;
  primary_domain: string;
}

interface TechniqueGroupResult {
  domain: string;
  count: number;
  bookmarks: TechniqueBookmarkResult[];
}

export function getTechniqueBacklog(): TechniqueGroupResult[] {
  const database = getDb();

  const rows = database
    .prepare(
      `SELECT id, text, author_handle, author_name, posted_at,
              parse_twitter_date_iso(posted_at) as posted_at_iso,
              like_count, repost_count, primary_domain
       FROM bookmarks
       WHERE primary_category = 'technique'
         AND posted_at IS NOT NULL
       ORDER BY parse_twitter_date_iso(posted_at) DESC`,
    )
    .all() as RawRow[];

  // Group by primary_domain
  const groups = new Map<string, TechniqueBookmarkResult[]>();

  for (const row of rows) {
    const domain = (row.primary_domain as string) || "other";
    const bookmark: TechniqueBookmarkResult = {
      id: row.id as string,
      text: row.text as string,
      author_handle: row.author_handle as string,
      author_name: (row.author_name as string) || "",
      posted_at_iso: (row.posted_at_iso as string) || "",
      like_count: (row.like_count as number) || 0,
      repost_count: (row.repost_count as number) || 0,
      primary_domain: domain,
    };

    const existing = groups.get(domain);
    if (existing) {
      existing.push(bookmark);
    } else {
      groups.set(domain, [bookmark]);
    }
  }

  // Sort groups by count descending, limit bookmarks per group
  return Array.from(groups.entries())
    .map(([domain, bookmarks]) => ({
      domain,
      count: bookmarks.length,
      bookmarks: bookmarks.slice(0, 10), // Return top 10 per group
    }))
    .sort((a, b) => b.count - a.count);
}

// --- GitHub Metadata Cache (Forge) ---

interface GitHubMetadataEntry {
  owner: string;
  repo: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  html_url: string;
  fetched_at: string;
  error?: string;
}

interface GitHubMetadataCache {
  [key: string]: GitHubMetadataEntry;
}

const GITHUB_CACHE_PATH = path.join(
  process.env.FT_DATA_DIR || path.join(os.homedir(), ".ft-bookmarks"),
  "github-cache.json",
);

function readGitHubCache(): GitHubMetadataCache {
  try {
    if (existsSync(GITHUB_CACHE_PATH)) {
      const data = readFileSync(GITHUB_CACHE_PATH, "utf-8");
      return JSON.parse(data) as GitHubMetadataCache;
    }
  } catch {
    // Invalid cache file, start fresh
  }
  return {};
}

function writeGitHubCache(cache: GitHubMetadataCache): void {
  try {
    writeFileSync(GITHUB_CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write GitHub cache:", err);
  }
}

async function fetchGitHubRepoMetadata(
  owner: string,
  repo: string,
): Promise<GitHubMetadataEntry> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "FieldTheoryUI/1.0",
      },
    });

    if (response.status === 404) {
      return {
        owner,
        repo,
        description: null,
        stargazers_count: 0,
        language: null,
        html_url: `https://github.com/${owner}/${repo}`,
        fetched_at: new Date().toISOString(),
        error: "not_found",
      };
    }

    if (response.status === 403 || response.status === 429) {
      return {
        owner,
        repo,
        description: null,
        stargazers_count: 0,
        language: null,
        html_url: `https://github.com/${owner}/${repo}`,
        fetched_at: new Date().toISOString(),
        error: "rate_limited",
      };
    }

    if (!response.ok) {
      return {
        owner,
        repo,
        description: null,
        stargazers_count: 0,
        language: null,
        html_url: `https://github.com/${owner}/${repo}`,
        fetched_at: new Date().toISOString(),
        error: `http_${response.status}`,
      };
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const data = (await response.json()) as any;
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return {
      owner,
      repo,
      description: (data.description as string) || null,
      stargazers_count: (data.stargazers_count as number) || 0,
      language: (data.language as string) || null,
      html_url: (data.html_url as string) || `https://github.com/${owner}/${repo}`,
      fetched_at: new Date().toISOString(),
    };
  } catch {
    return {
      owner,
      repo,
      description: null,
      stargazers_count: 0,
      language: null,
      html_url: `https://github.com/${owner}/${repo}`,
      fetched_at: new Date().toISOString(),
      error: "fetch_failed",
    };
  }
}

/**
 * Get GitHub metadata for the given repos. Reads from cache, fetches missing
 * ones from the GitHub API (up to maxFetch to respect rate limits), and
 * writes back to cache.
 */
export async function getGitHubMetadata(
  repos: Array<{ owner: string; repo: string }>,
  maxFetch = 10,
): Promise<Record<string, GitHubMetadataEntry>> {
  const cache = readGitHubCache();
  const result: Record<string, GitHubMetadataEntry> = {};
  const uncached: Array<{ owner: string; repo: string; key: string }> = [];

  for (const { owner, repo } of repos) {
    const key = `${owner.toLowerCase()}/${repo.toLowerCase()}`;
    if (cache[key]) {
      result[key] = cache[key];
    } else {
      uncached.push({ owner, repo, key });
    }
  }

  // Fetch missing metadata (limited to avoid rate limit)
  let fetched = 0;
  for (let i = 0; i < uncached.length; i++) {
    const { owner, repo, key } = uncached[i]!;
    if (fetched >= maxFetch) {
      // Mark remaining as not yet fetched (only if not already in result)
      if (!result[key]) {
        result[key] = {
          owner,
          repo,
          description: null,
          stargazers_count: 0,
          language: null,
          html_url: `https://github.com/${owner}/${repo}`,
          fetched_at: "",
          error: "rate_limited",
        };
      }
      continue;
    }

    const metadata = await fetchGitHubRepoMetadata(owner, repo);

    // If rate limited, stop fetching more
    if (metadata.error === "rate_limited") {
      result[key] = metadata;
      // Don't cache rate-limited responses; mark remaining as rate_limited too
      // Use numeric index to correctly slice remaining items
      for (let j = i + 1; j < uncached.length; j++) {
        const remaining = uncached[j]!;
        // Only mark as rate_limited if not already fetched
        if (!result[remaining.key]) {
          result[remaining.key] = {
            owner: remaining.owner,
            repo: remaining.repo,
            description: null,
            stargazers_count: 0,
            language: null,
            html_url: `https://github.com/${remaining.owner}/${remaining.repo}`,
            fetched_at: "",
            error: "rate_limited",
          };
        }
      }
      break;
    }

    // Cache successful fetches and errors (404 etc.) to avoid re-fetching
    cache[key] = metadata;
    result[key] = metadata;
    fetched++;
  }

  // Write updated cache
  if (fetched > 0) {
    writeGitHubCache(cache);
  }

  return result;
}

// --- Conversation Threading ---

interface ConversationGroupResult {
  conversation_id: string;
  bookmark_count: number;
  authors: string[];
  earliest_iso: string;
  latest_iso: string;
}

export function getConversationGroups(limit = 20): ConversationGroupResult[] {
  const database = getDb();
  const safeLimit = Math.min(Math.max(1, limit), 100);

  const rows = database
    .prepare(
      `SELECT conversation_id,
              COUNT(*) as bookmark_count,
              GROUP_CONCAT(DISTINCT author_handle) as authors,
              MIN(parse_twitter_date_iso(posted_at)) as earliest_iso,
              MAX(parse_twitter_date_iso(posted_at)) as latest_iso
       FROM bookmarks
       WHERE conversation_id IS NOT NULL AND conversation_id != ''
       GROUP BY conversation_id
       HAVING COUNT(*) > 1
       ORDER BY bookmark_count DESC
       LIMIT ?`,
    )
    .all(safeLimit) as RawRow[];

  return rows.map((row) => ({
    conversation_id: row.conversation_id as string,
    bookmark_count: row.bookmark_count as number,
    authors: ((row.authors as string) || "").split(",").filter(Boolean),
    earliest_iso: (row.earliest_iso as string) || "",
    latest_iso: (row.latest_iso as string) || "",
  }));
}

export function getBookmarksByConversation(conversationId: string): BookmarkResult[] {
  const database = getDb();
  const rows = database
    .prepare(
      `SELECT * FROM bookmarks
       WHERE conversation_id = ?
       ORDER BY parse_twitter_date_iso(posted_at) ASC`,
    )
    .all(conversationId) as RawRow[];

  return rows.map(mapBookmarkRow);
}

// --- Collections ---

export interface CollectionSummary {
  id: number;
  slug: string;
  name: string;
  description: string;
  color: string;
  created_at: string;
  updated_at: string;
  bookmark_count: number;
}

export interface CollectionMembership {
  slug: string;
  name: string;
  color: string;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function uniqueSlug(database: Database.Database, base: string): string {
  let slug = base || "collection";
  const stmt = database.prepare("SELECT 1 FROM collections WHERE slug = ?");
  if (!stmt.get(slug)) return slug;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!stmt.get(candidate)) return candidate;
  }
  throw new Error("Could not generate a unique collection slug");
}

export function listCollections(): CollectionSummary[] {
  const database = getWritableDb();
  const rows = database
    .prepare(
      `SELECT c.id, c.slug, c.name, c.description, c.color,
              c.created_at, c.updated_at,
              COUNT(bc.bookmark_id) as bookmark_count
       FROM collections c
       LEFT JOIN bookmark_collections bc ON bc.collection_id = c.id
       GROUP BY c.id
       ORDER BY bookmark_count DESC, LOWER(c.name) ASC`,
    )
    .all() as RawRow[];

  return rows.map((r) => ({
    id: r.id as number,
    slug: r.slug as string,
    name: r.name as string,
    description: (r.description as string) || "",
    color: (r.color as string) || "",
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    bookmark_count: (r.bookmark_count as number) || 0,
  }));
}

export function getCollectionBySlug(slug: string): CollectionSummary | null {
  const database = getWritableDb();
  const row = database
    .prepare(
      `SELECT c.id, c.slug, c.name, c.description, c.color,
              c.created_at, c.updated_at,
              (SELECT COUNT(*) FROM bookmark_collections
                 WHERE collection_id = c.id) as bookmark_count
       FROM collections c
       WHERE c.slug = ?`,
    )
    .get(slug) as RawRow | undefined;

  if (!row) return null;
  return {
    id: row.id as number,
    slug: row.slug as string,
    name: row.name as string,
    description: (row.description as string) || "",
    color: (row.color as string) || "",
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    bookmark_count: (row.bookmark_count as number) || 0,
  };
}

export function createCollection(input: {
  name: string;
  description?: string;
  color?: string;
  slug?: string;
}): CollectionSummary {
  const name = input.name.trim();
  if (!name) throw new Error("Collection name is required");

  const database = getWritableDb();
  const baseSlug = input.slug ? slugify(input.slug) : slugify(name);
  const slug = uniqueSlug(database, baseSlug);
  const now = new Date().toISOString();

  database
    .prepare(
      `INSERT INTO collections (slug, name, description, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(slug, name, input.description || null, input.color || null, now, now);

  const created = getCollectionBySlug(slug);
  if (!created) throw new Error("Failed to create collection");
  return created;
}

export function updateCollection(
  slug: string,
  updates: { name?: string; description?: string; color?: string },
): CollectionSummary | null {
  const database = getWritableDb();
  const existing = getCollectionBySlug(slug);
  if (!existing) return null;

  const fields: string[] = [];
  const values: (string | null)[] = [];

  if (updates.name !== undefined) {
    const name = updates.name.trim();
    if (!name) throw new Error("Collection name cannot be empty");
    fields.push("name = ?");
    values.push(name);
  }
  if (updates.description !== undefined) {
    fields.push("description = ?");
    values.push(updates.description || null);
  }
  if (updates.color !== undefined) {
    fields.push("color = ?");
    values.push(updates.color || null);
  }
  if (fields.length === 0) return existing;

  fields.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(slug);

  database
    .prepare(`UPDATE collections SET ${fields.join(", ")} WHERE slug = ?`)
    .run(...values);

  return getCollectionBySlug(slug);
}

export function deleteCollection(slug: string): boolean {
  const database = getWritableDb();
  const existing = getCollectionBySlug(slug);
  if (!existing) return false;

  // Manually cascade to bookmark_collections since FK enforcement requires
  // PRAGMA foreign_keys = ON per connection, which we don't rely on.
  const tx = database.transaction(() => {
    database
      .prepare("DELETE FROM bookmark_collections WHERE collection_id = ?")
      .run(existing.id);
    database.prepare("DELETE FROM collections WHERE id = ?").run(existing.id);
  });
  tx();
  return true;
}

export function addBookmarksToCollection(
  slug: string,
  bookmarkIds: string[],
  addedBy: "user" | "mcp" | "rule" = "user",
): { added: number; skipped: number } {
  if (bookmarkIds.length === 0) return { added: 0, skipped: 0 };

  const database = getWritableDb();
  const collection = getCollectionBySlug(slug);
  if (!collection) throw new Error(`Collection not found: ${slug}`);

  const now = new Date().toISOString();
  const stmt = database.prepare(
    `INSERT OR IGNORE INTO bookmark_collections
       (bookmark_id, collection_id, added_at, added_by)
     VALUES (?, ?, ?, ?)`,
  );

  let added = 0;
  let skipped = 0;
  const tx = database.transaction(() => {
    for (const id of bookmarkIds) {
      const result = stmt.run(id, collection.id, now, addedBy);
      if (result.changes > 0) added++;
      else skipped++;
    }
    // Touch updated_at on the collection so recency sorts reflect activity.
    database
      .prepare("UPDATE collections SET updated_at = ? WHERE id = ?")
      .run(now, collection.id);
  });
  tx();

  return { added, skipped };
}

export function removeBookmarksFromCollection(
  slug: string,
  bookmarkIds: string[],
): { removed: number } {
  if (bookmarkIds.length === 0) return { removed: 0 };

  const database = getWritableDb();
  const collection = getCollectionBySlug(slug);
  if (!collection) throw new Error(`Collection not found: ${slug}`);

  const placeholders = bookmarkIds.map(() => "?").join(",");
  const result = database
    .prepare(
      `DELETE FROM bookmark_collections
       WHERE collection_id = ? AND bookmark_id IN (${placeholders})`,
    )
    .run(collection.id, ...bookmarkIds);

  return { removed: result.changes };
}

export function getBookmarksByCollection(
  slug: string,
  limit = 50,
  offset = 0,
): { results: BookmarkResult[]; total: number } | null {
  const database = getWritableDb();
  const collection = getCollectionBySlug(slug);
  if (!collection) return null;

  const safeLimit = Math.min(Math.max(1, limit), 200);
  const safeOffset = Math.max(0, offset);

  const total = collection.bookmark_count;
  const rows = database
    .prepare(
      `SELECT b.*
       FROM bookmark_collections bc
       JOIN bookmarks b ON b.id = bc.bookmark_id
       WHERE bc.collection_id = ?
       ORDER BY bc.added_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(collection.id, safeLimit, safeOffset) as RawRow[];

  return { results: rows.map(mapBookmarkRow), total };
}

export function getCollectionsForBookmark(bookmarkId: string): CollectionMembership[] {
  const database = getWritableDb();
  const rows = database
    .prepare(
      `SELECT c.slug, c.name, c.color
       FROM bookmark_collections bc
       JOIN collections c ON c.id = bc.collection_id
       WHERE bc.bookmark_id = ?
       ORDER BY LOWER(c.name) ASC`,
    )
    .all(bookmarkId) as RawRow[];

  return rows.map((r) => ({
    slug: r.slug as string,
    name: r.name as string,
    color: (r.color as string) || "",
  }));
}
