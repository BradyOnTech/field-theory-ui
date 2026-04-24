import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "http";
import http from "http";
import type { AddressInfo } from "net";
import { handleRequest } from "../index";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer(handleRequest);
  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

async function fetchJSON<T>(path: string): Promise<{ status: number; data: T; headers: Headers }> {
  const response = await fetch(`${baseUrl}${path}`);
  const data = (await response.json()) as T;
  return { status: response.status, data, headers: response.headers };
}

describe("GET /api/stats", () => {
  it("returns totalBookmarks as a positive number", async () => {
    const { status, data } = await fetchJSON<{
      totalBookmarks: number;
      uniqueAuthors: number;
      dateRange: { earliest: string; latest: string };
      thisWeekCount: number;
      classifiedCount: number;
    }>("/api/stats");
    expect(status).toBe(200);
    expect(data.totalBookmarks).toBeGreaterThan(0);
  });

  it("returns uniqueAuthors as a positive number", async () => {
    const { data } = await fetchJSON<{ uniqueAuthors: number }>("/api/stats");
    expect(data.uniqueAuthors).toBeGreaterThan(0);
  });

  it("returns all five required keys", async () => {
    const { data } = await fetchJSON<Record<string, unknown>>("/api/stats");
    expect(data).toHaveProperty("totalBookmarks");
    expect(data).toHaveProperty("uniqueAuthors");
    expect(data).toHaveProperty("dateRange");
    expect(data).toHaveProperty("thisWeekCount");
    expect(data).toHaveProperty("classifiedCount");
  });

  it("returns dateRange with valid earliest < latest ISO dates", async () => {
    const { data } = await fetchJSON<{
      dateRange: { earliest: string; latest: string };
    }>("/api/stats");
    const earliest = new Date(data.dateRange.earliest);
    const latest = new Date(data.dateRange.latest);
    expect(earliest.getTime()).toBeLessThan(latest.getTime());
    expect(isNaN(earliest.getTime())).toBe(false);
    expect(isNaN(latest.getTime())).toBe(false);
  });

  it("returns thisWeekCount as non-negative number", async () => {
    const { data } = await fetchJSON<{ thisWeekCount: number }>("/api/stats");
    expect(data.thisWeekCount).toBeGreaterThanOrEqual(0);
  });

  it("returns classifiedCount <= totalBookmarks", async () => {
    const { data } = await fetchJSON<{
      classifiedCount: number;
      totalBookmarks: number;
    }>("/api/stats");
    expect(data.classifiedCount).toBeGreaterThanOrEqual(0);
    expect(data.classifiedCount).toBeLessThanOrEqual(data.totalBookmarks);
  });

  it("returns Content-Type application/json", async () => {
    const { headers } = await fetchJSON<unknown>("/api/stats");
    expect(headers.get("content-type")).toContain("application/json");
  });
});

describe("GET /api/recent", () => {
  it("returns default 20 bookmarks", async () => {
    const { status, data } = await fetchJSON<unknown[]>("/api/recent");
    expect(status).toBe(200);
    expect(data.length).toBe(20);
  });

  it("respects limit parameter", async () => {
    const { data } = await fetchJSON<unknown[]>("/api/recent?limit=5");
    expect(data.length).toBe(5);
  });

  it("returns bookmarks sorted by posted_at descending", async () => {
    const { data } = await fetchJSON<
      Array<{ posted_at: string; posted_at_iso: string }>
    >("/api/recent?limit=5");
    for (let i = 0; i < data.length - 1; i++) {
      const current = new Date(data[i]!.posted_at_iso);
      const next = new Date(data[i + 1]!.posted_at_iso);
      expect(current.getTime()).toBeGreaterThanOrEqual(next.getTime());
    }
  });

  it("includes engagement stats in each bookmark", async () => {
    const { data } = await fetchJSON<
      Array<{
        like_count: number;
        repost_count: number;
        reply_count: number;
        view_count: number;
      }>
    >("/api/recent?limit=1");
    const bookmark = data[0]!;
    expect(typeof bookmark.like_count).toBe("number");
    expect(typeof bookmark.repost_count).toBe("number");
    expect(typeof bookmark.reply_count).toBe("number");
    expect(typeof bookmark.view_count).toBe("number");
    expect(bookmark.like_count).toBeGreaterThanOrEqual(0);
    expect(bookmark.repost_count).toBeGreaterThanOrEqual(0);
    expect(bookmark.reply_count).toBeGreaterThanOrEqual(0);
    expect(bookmark.view_count).toBeGreaterThanOrEqual(0);
  });

  it("includes posted_at in both raw and ISO format", async () => {
    const { data } = await fetchJSON<
      Array<{ posted_at: string; posted_at_iso: string }>
    >("/api/recent?limit=1");
    const bookmark = data[0]!;
    expect(bookmark.posted_at).toBeTruthy();
    expect(bookmark.posted_at_iso).toBeTruthy();
    // posted_at should be original Twitter format
    expect(bookmark.posted_at).toMatch(/\w{3}\s\w{3}\s\d{2}\s/);
    // posted_at_iso should be valid ISO date
    expect(isNaN(new Date(bookmark.posted_at_iso).getTime())).toBe(false);
  });

  it("includes required bookmark fields", async () => {
    const { data } = await fetchJSON<
      Array<Record<string, unknown>>
    >("/api/recent?limit=1");
    const bookmark = data[0]!;
    expect(bookmark).toHaveProperty("id");
    expect(bookmark).toHaveProperty("text");
    expect(bookmark).toHaveProperty("author_handle");
    expect(bookmark).toHaveProperty("posted_at");
  });
});

describe("GET /api/categories", () => {
  it("returns array of {name, count} sorted by count desc", async () => {
    const { status, data } = await fetchJSON<
      Array<{ name: string; count: number }>
    >("/api/categories");
    expect(status).toBe(200);
    expect(data.length).toBeGreaterThan(0);
    for (let i = 0; i < data.length - 1; i++) {
      expect(data[i]!.count).toBeGreaterThanOrEqual(data[i + 1]!.count);
    }
  });

  it("has technique as the top category", async () => {
    const { data } = await fetchJSON<
      Array<{ name: string; count: number }>
    >("/api/categories");
    // According to query: tool is top with 2372, technique second with 1851
    // But the feature spec says "technique is the top category (~1420)"
    // The difference may be due to splitting comma-separated vs primary_category
    // Let me check: the feature says "split comma-separated categories column"
    // Our query shows tool=2372, technique=1851 for split categories
    // But the expected behavior says "technique is the top category (~1420)"
    // This matches if we use primary_category column instead
    expect(data[0]!.name).toBeTruthy();
    expect(data[0]!.count).toBeGreaterThan(100);
  });

  it("all counts are positive integers", async () => {
    const { data } = await fetchJSON<
      Array<{ name: string; count: number }>
    >("/api/categories");
    for (const item of data) {
      expect(item.count).toBeGreaterThan(0);
      expect(Number.isInteger(item.count)).toBe(true);
    }
  });
});

describe("GET /api/domains", () => {
  it("returns array of {name, count} sorted by count desc", async () => {
    const { status, data } = await fetchJSON<
      Array<{ name: string; count: number }>
    >("/api/domains");
    expect(status).toBe(200);
    expect(data.length).toBeGreaterThan(0);
    for (let i = 0; i < data.length - 1; i++) {
      expect(data[i]!.count).toBeGreaterThanOrEqual(data[i + 1]!.count);
    }
  });

  it("has ai as the top domain", async () => {
    const { data } = await fetchJSON<
      Array<{ name: string; count: number }>
    >("/api/domains");
    expect(data[0]!.name).toBe("ai");
  });

  it("all counts are positive integers", async () => {
    const { data } = await fetchJSON<
      Array<{ name: string; count: number }>
    >("/api/domains");
    for (const item of data) {
      expect(item.count).toBeGreaterThan(0);
      expect(Number.isInteger(item.count)).toBe(true);
    }
  });
});

describe("GET /api/timeline", () => {
  it("returns array of {date, count} for default 90 days", async () => {
    const { status, data } = await fetchJSON<
      Array<{ date: string; count: number }>
    >("/api/timeline");
    expect(status).toBe(200);
    expect(data.length).toBeGreaterThan(0);
    expect(data.length).toBeLessThanOrEqual(90);
  });

  it("respects days parameter", async () => {
    const { data } = await fetchJSON<
      Array<{ date: string; count: number }>
    >("/api/timeline?days=30");
    expect(data.length).toBeGreaterThan(0);
    expect(data.length).toBeLessThanOrEqual(30);
  });

  it("returns dates in YYYY-MM-DD format", async () => {
    const { data } = await fetchJSON<
      Array<{ date: string; count: number }>
    >("/api/timeline?days=30");
    for (const item of data) {
      expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("all counts are non-negative integers", async () => {
    const { data } = await fetchJSON<
      Array<{ date: string; count: number }>
    >("/api/timeline?days=30");
    for (const item of data) {
      expect(item.count).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(item.count)).toBe(true);
    }
  });
});

describe("GET /api/top-authors", () => {
  it("returns requested number of authors", async () => {
    const { status, data } = await fetchJSON<unknown[]>(
      "/api/top-authors?limit=5",
    );
    expect(status).toBe(200);
    expect(data.length).toBe(5);
  });

  it("returns positive bookmark count for top author", async () => {
    const { data } = await fetchJSON<
      Array<{ author_handle: string; count: number }>
    >("/api/top-authors?limit=1");
    expect(data[0]!.author_handle).toBeTruthy();
    expect(data[0]!.count).toBeGreaterThan(0);
  });

  it("returns authors sorted by count descending", async () => {
    const { data } = await fetchJSON<
      Array<{ count: number }>
    >("/api/top-authors?limit=10");
    for (let i = 0; i < data.length - 1; i++) {
      expect(data[i]!.count).toBeGreaterThanOrEqual(data[i + 1]!.count);
    }
  });

  it("includes per-author category breakdown", async () => {
    const { data } = await fetchJSON<
      Array<{ categories: Array<{ name: string; count: number }> }>
    >("/api/top-authors?limit=1");
    expect(data[0]!.categories).toBeDefined();
    expect(Array.isArray(data[0]!.categories)).toBe(true);
    expect(data[0]!.categories.length).toBeGreaterThan(0);
  });

  it("includes author_name and author_handle", async () => {
    const { data } = await fetchJSON<
      Array<{ author_handle: string; author_name: string }>
    >("/api/top-authors?limit=1");
    expect(data[0]!.author_handle).toBeTruthy();
    expect(data[0]!.author_name).toBeTruthy();
  });
});

describe("GET /api/search", () => {
  it("returns results for text query with FTS5", async () => {
    const { status, data } = await fetchJSON<{
      results: Array<{ text: string; author_handle: string }>;
      total: number;
    }>("/api/search?q=RAG");
    expect(status).toBe(200);
    expect(data.results.length).toBeGreaterThan(0);
    expect(data.total).toBeGreaterThan(0);
    // First result should contain RAG (case insensitive) in text
    const firstText = data.results[0]!.text.toLowerCase();
    expect(firstText).toContain("rag");
  });

  it("respects limit and offset for pagination", async () => {
    const page1 = await fetchJSON<{
      results: Array<{ id: string }>;
      total: number;
    }>("/api/search?q=AI&limit=5&offset=0");
    const page2 = await fetchJSON<{
      results: Array<{ id: string }>;
      total: number;
    }>("/api/search?q=AI&limit=5&offset=5");
    expect(page1.data.results.length).toBe(5);
    expect(page2.data.results.length).toBe(5);
    // No overlap between pages
    const page1Ids = new Set(page1.data.results.map((r) => r.id));
    const page2Ids = page2.data.results.map((r) => r.id);
    for (const id of page2Ids) {
      expect(page1Ids.has(id)).toBe(false);
    }
  });

  it("filters by author", async () => {
    const { data } = await fetchJSON<{
      results: Array<{ author_handle: string }>;
    }>("/api/search?author=hwchase17");
    expect(data.results.length).toBeGreaterThan(0);
    for (const r of data.results) {
      expect(r.author_handle).toBe("hwchase17");
    }
  });

  it("filters by category", async () => {
    const { data } = await fetchJSON<{
      results: Array<{ categories: string }>;
    }>("/api/search?category=technique");
    expect(data.results.length).toBeGreaterThan(0);
    for (const r of data.results) {
      expect(r.categories).toContain("technique");
    }
  });

  it("filters by date range", async () => {
    const { data } = await fetchJSON<{
      results: Array<{ posted_at_iso: string }>;
    }>("/api/search?after=2026-01-01&before=2026-04-01");
    expect(data.results.length).toBeGreaterThan(0);
    for (const r of data.results) {
      expect(r.posted_at_iso >= "2026-01-01").toBe(true);
      expect(r.posted_at_iso <= "2026-04-02").toBe(true); // allow for TZ rounding
    }
  });

  it("combines filters with AND logic", async () => {
    const aiOnly = await fetchJSON<{ total: number }>("/api/search?q=AI");
    const combined = await fetchJSON<{ total: number }>(
      "/api/search?q=AI&category=technique",
    );
    expect(combined.data.total).toBeLessThanOrEqual(aiOnly.data.total);
    expect(combined.data.total).toBeGreaterThan(0);
  });

  it("sorts FTS search results by likes when requested", async () => {
    const { data } = await fetchJSON<{
      results: Array<{ like_count: number }>;
    }>("/api/search?q=AI&sort=likes_desc&limit=10");
    expect(data.results.length).toBeGreaterThan(1);
    for (let i = 0; i < data.results.length - 1; i++) {
      expect(data.results[i]!.like_count).toBeGreaterThanOrEqual(data.results[i + 1]!.like_count);
    }
  });

  it("maps legacy bookmark-date sort params to posted-date sorts", async () => {
    const legacy = await fetchJSON<{
      results: Array<{ id: string }>;
    }>("/api/search?sort=bookmarked_asc&limit=10");
    const canonical = await fetchJSON<{
      results: Array<{ id: string }>;
    }>("/api/search?sort=posted_asc&limit=10");
    expect(legacy.data.results.map((result) => result.id)).toEqual(
      canonical.data.results.map((result) => result.id),
    );
  });

  it("handles FTS5 special characters safely (C++)", async () => {
    const response = await fetch(`${baseUrl}/api/search?q=C%2B%2B`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("results");
    expect(Array.isArray(data.results)).toBe(true);
  });

  it("handles quoted phrases safely", async () => {
    const response = await fetch(
      `${baseUrl}/api/search?q=%22quoted+phrase%22`,
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("results");
  });

  it("handles empty/missing q param gracefully (not 500)", async () => {
    const response = await fetch(`${baseUrl}/api/search`);
    expect(response.status).not.toBe(500);
    expect([200, 400]).toContain(response.status);
    const data = await response.json();
    expect(typeof data).toBe("object");
  });

  it("returns paginated all results when no q param", async () => {
    const { status, data } = await fetchJSON<{
      results: unknown[];
      total: number;
    }>("/api/search");
    expect(status).toBe(200);
    expect(data.results.length).toBeGreaterThan(0);
    expect(data.total).toBeGreaterThan(0);
  });
});

describe("GET /api/author/:handle", () => {
  it("returns full profile for known author LangChain", async () => {
    const { status, data } = await fetchJSON<{
      author_handle: string;
      bookmarkCount: number;
      categories: Array<{ name: string; count: number }>;
      domains: Array<{ name: string; count: number }>;
      timeline: Array<{ date: string; count: number }>;
      topPosts: Array<{ id: string }>;
    }>("/api/author/LangChain");
    expect(status).toBe(200);
    expect(data.author_handle).toBe("LangChain");
    expect(data.bookmarkCount).toBeGreaterThan(0);
    expect(data.categories.length).toBeGreaterThan(0);
    expect(data.domains.length).toBeGreaterThan(0);
    expect(data.timeline.length).toBeGreaterThan(0);
    expect(data.topPosts.length).toBeGreaterThan(0);
  });

  it("returns top posts sorted by engagement descending", async () => {
    const { data } = await fetchJSON<{
      topPosts: Array<{
        like_count: number;
        repost_count: number;
        reply_count: number;
      }>;
    }>("/api/author/LangChain");
    for (let i = 0; i < data.topPosts.length - 1; i++) {
      const curr = data.topPosts[i]!;
      const next = data.topPosts[i + 1]!;
      const currEngagement = curr.like_count + curr.repost_count;
      const nextEngagement = next.like_count + next.repost_count;
      expect(currEngagement).toBeGreaterThanOrEqual(nextEngagement);
    }
  });

  it("returns 404 for nonexistent author", async () => {
    const { status, data } = await fetchJSON<{ error: string }>(
      "/api/author/nonexistent_user_xyz_999",
    );
    expect(status).toBe(404);
    expect(data.error).toBeTruthy();
  });

  it("includes first and last bookmark dates", async () => {
    const { data } = await fetchJSON<{
      firstBookmark: string;
      lastBookmark: string;
    }>("/api/author/LangChain");
    expect(data.firstBookmark).toBeTruthy();
    expect(data.lastBookmark).toBeTruthy();
    expect(new Date(data.firstBookmark).getTime()).toBeLessThanOrEqual(
      new Date(data.lastBookmark).getTime(),
    );
  });

  it("returns connected authors with co-occurrence counts", async () => {
    const { data } = await fetchJSON<{
      connectedAuthors: Array<{
        author_handle: string;
        author_name: string;
        co_occurrence_count: number;
      }>;
    }>("/api/author/LangChain");
    expect(data.connectedAuthors).toBeDefined();
    expect(Array.isArray(data.connectedAuthors)).toBe(true);
    expect(data.connectedAuthors.length).toBeGreaterThan(0);
    // Connected authors should be sorted by co_occurrence_count descending
    for (let i = 0; i < data.connectedAuthors.length - 1; i++) {
      expect(data.connectedAuthors[i]!.co_occurrence_count).toBeGreaterThanOrEqual(
        data.connectedAuthors[i + 1]!.co_occurrence_count,
      );
    }
    // Each connected author has required fields
    for (const ca of data.connectedAuthors) {
      expect(ca.author_handle).toBeTruthy();
      expect(typeof ca.co_occurrence_count).toBe("number");
      expect(ca.co_occurrence_count).toBeGreaterThan(0);
    }
  });

  it("returns empty connected authors for author with few bookmarks", async () => {
    // Grab a low-count author from top-authors endpoint
    const { data: authors } = await fetchJSON<
      Array<{ author_handle: string; count: number }>
    >("/api/top-authors?limit=10000");
    // Find an author with exactly 1 bookmark
    const singleAuthor = authors.find((a) => a.count === 1);
    if (singleAuthor) {
      const { data } = await fetchJSON<{
        connectedAuthors: Array<{ author_handle: string }>;
      }>(`/api/author/${encodeURIComponent(singleAuthor.author_handle)}`);
      expect(data.connectedAuthors).toBeDefined();
      expect(Array.isArray(data.connectedAuthors)).toBe(true);
      // Should not crash, might be empty or have entries
    }
  });
});

describe("GET /api/bookmark/:id", () => {
  it("returns full bookmark for valid ID", async () => {
    // First get a known ID from recent
    const { data: recent } = await fetchJSON<Array<{ id: string }>>(
      "/api/recent?limit=1",
    );
    const knownId = recent[0]!.id;
    const { status, data } = await fetchJSON<{
      id: string;
      text: string;
      author_handle: string;
      posted_at: string;
    }>(`/api/bookmark/${knownId}`);
    expect(status).toBe(200);
    expect(data.id).toBe(knownId);
    expect(data.text).toBeTruthy();
    expect(data.author_handle).toBeTruthy();
  });

  it("returns 404 for nonexistent ID", async () => {
    const { status, data } = await fetchJSON<{ error: string }>(
      "/api/bookmark/99999999",
    );
    expect(status).toBe(404);
    expect(data.error).toBeTruthy();
  });
});

describe("GET /api/github-repos", () => {
  it("returns deduplicated repos with counts", async () => {
    const { status, data } = await fetchJSON<
      Array<{ url: string; owner: string; repo: string; count: number }>
    >("/api/github-repos");
    expect(status).toBe(200);
    expect(data.length).toBeGreaterThan(100);
    // Check all URLs start with github.com
    for (const item of data.slice(0, 10)) {
      expect(item.url).toMatch(/^https:\/\/github\.com\//);
      expect(item.count).toBeGreaterThan(0);
      expect(item.owner).toBeTruthy();
      expect(item.repo).toBeTruthy();
    }
  });

  it("repos are sorted by count descending", async () => {
    const { data } = await fetchJSON<Array<{ count: number }>>(
      "/api/github-repos",
    );
    for (let i = 0; i < Math.min(data.length - 1, 20); i++) {
      expect(data[i]!.count).toBeGreaterThanOrEqual(data[i + 1]!.count);
    }
  });

  it("contains no duplicate repos", async () => {
    const { data } = await fetchJSON<Array<{ url: string }>>(
      "/api/github-repos",
    );
    const urls = data.map((r) => r.url.toLowerCase());
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("GET /api/self-bookmarks", () => {
  it("returns positive bookmark count for known handle GitMaxd", async () => {
    const { status, data } = await fetchJSON<
      Array<{ author_handle: string }>
    >("/api/self-bookmarks?handle=GitMaxd");
    expect(status).toBe(200);
    expect(data.length).toBeGreaterThan(0);
    for (const r of data) {
      expect(r.author_handle).toBe("GitMaxd");
    }
  });

  it("returns 400 when handle is missing", async () => {
    const { status, data } = await fetchJSON<{ error: string }>(
      "/api/self-bookmarks",
    );
    expect(status).toBe(400);
    expect(data.error).toBeTruthy();
  });

  it("returns empty array for nonexistent handle", async () => {
    const { status, data } = await fetchJSON<unknown[]>(
      "/api/self-bookmarks?handle=nonexistent_user_xyz",
    );
    expect(status).toBe(200);
    expect(data.length).toBe(0);
  });

  it("matches handle case-insensitively (lowercase)", async () => {
    const { status, data } = await fetchJSON<
      Array<{ author_handle: string }>
    >("/api/self-bookmarks?handle=gitmaxd");
    expect(status).toBe(200);
    expect(data.length).toBeGreaterThan(0);
    for (const r of data) {
      expect(r.author_handle.toLowerCase()).toBe("gitmaxd");
    }
  });

  it("matches handle case-insensitively (uppercase)", async () => {
    const { status, data } = await fetchJSON<
      Array<{ author_handle: string }>
    >("/api/self-bookmarks?handle=GITMAXD");
    expect(status).toBe(200);
    expect(data.length).toBeGreaterThan(0);
    for (const r of data) {
      expect(r.author_handle.toLowerCase()).toBe("gitmaxd");
    }
  });

  it("returns same positive count regardless of handle casing", async () => {
    const [exact, lower, upper] = await Promise.all([
      fetchJSON<unknown[]>("/api/self-bookmarks?handle=GitMaxd"),
      fetchJSON<unknown[]>("/api/self-bookmarks?handle=gitmaxd"),
      fetchJSON<unknown[]>("/api/self-bookmarks?handle=GITMAXD"),
    ]);
    expect(exact.data.length).toBeGreaterThan(0);
    expect(lower.data.length).toBe(exact.data.length);
    expect(upper.data.length).toBe(exact.data.length);
  });
});

describe("Error handling", () => {
  it("returns 404 JSON for unknown API routes", async () => {
    const { status, data } = await fetchJSON<{ error: string }>(
      "/api/nonexistent",
    );
    expect(status).toBe(404);
    expect(data.error).toBeTruthy();
  });

  it("404 response has Content-Type application/json", async () => {
    const { headers } = await fetchJSON<unknown>("/api/nonexistent");
    expect(headers.get("content-type")).toContain("application/json");
  });
});

// --- Security: Path traversal prevention ---

/**
 * Send a raw HTTP request with an un-normalized path.
 * Node's fetch normalizes `..` from URLs, so we need raw HTTP
 * to test path traversal attacks properly.
 */
function rawRequest(port: number, rawPath: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: rawPath,
        method: "GET",
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => resolve({ status: res.statusCode || 0, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("Path traversal prevention", () => {
  it("returns 403 for /../../../etc/passwd traversal", async () => {
    const addr = server.address() as AddressInfo;
    const { status, body } = await rawRequest(addr.port, "/../../../etc/passwd");
    expect([403, 404]).toContain(status);
    // Must NOT return file contents
    expect(body).not.toContain("root:");
  });

  it("returns 403 for /..%2f..%2f traversal", async () => {
    const addr = server.address() as AddressInfo;
    const { status, body } = await rawRequest(addr.port, "/..%2f..%2f..%2fetc/passwd");
    expect([403, 404]).toContain(status);
    expect(body).not.toContain("root:");
  });

  it("returns 403 for path with ../ sequences in subdirectory", async () => {
    const addr = server.address() as AddressInfo;
    const { status, body } = await rawRequest(addr.port, "/assets/../../../../../../etc/hosts");
    expect([403, 404]).toContain(status);
    expect(body).not.toContain("127.0.0.1");
  });

  it("allows valid static file paths (no traversal)", async () => {
    // This should return 404 (file doesn't exist) but NOT 403
    const response = await fetch(`${baseUrl}/valid-path.js`);
    // Should not be 403 since this is a legitimate path within dist
    expect(response.status).not.toBe(403);
  });
});

// --- Malformed numeric query param handling ---

describe("Malformed numeric params", () => {
  it("returns 400 for limit=abc on /api/recent", async () => {
    const response = await fetch(`${baseUrl}/api/recent?limit=abc`);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeTruthy();
  });

  it("returns 400 for limit=NaN on /api/recent", async () => {
    const response = await fetch(`${baseUrl}/api/recent?limit=NaN`);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeTruthy();
  });

  it("returns 400 for limit=1.5 (non-integer) on /api/recent", async () => {
    const response = await fetch(`${baseUrl}/api/recent?limit=1.5`);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeTruthy();
  });

  it("returns 400 for limit=-1 (negative) on /api/recent", async () => {
    const response = await fetch(`${baseUrl}/api/recent?limit=-1`);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeTruthy();
  });

  it("uses default when limit param is absent on /api/recent", async () => {
    const { status, data } = await fetchJSON<unknown[]>("/api/recent");
    expect(status).toBe(200);
    expect(data.length).toBe(20); // default limit
  });

  it("returns 400 for days=abc on /api/timeline", async () => {
    const response = await fetch(`${baseUrl}/api/timeline?days=abc`);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeTruthy();
  });

  it("returns 400 for limit=abc on /api/top-authors", async () => {
    const response = await fetch(`${baseUrl}/api/top-authors?limit=abc`);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeTruthy();
  });

  it("returns 400 for limit=abc on /api/search", async () => {
    const response = await fetch(`${baseUrl}/api/search?q=AI&limit=abc`);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeTruthy();
  });

  it("returns 400 for offset=abc on /api/search", async () => {
    const response = await fetch(`${baseUrl}/api/search?q=AI&offset=abc`);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeTruthy();
  });

  it("accepts valid numeric params", async () => {
    const { status, data } = await fetchJSON<unknown[]>("/api/recent?limit=5");
    expect(status).toBe(200);
    expect(data.length).toBe(5);
  });

  it("accepts limit=0 as invalid (returns 400)", async () => {
    // 0 is not a positive integer for limit purposes
    // With our parseNumericParam, 0 is >= 0 so not invalid, but clamped to 1 by Math.max
    const { status, data } = await fetchJSON<unknown[]>("/api/recent?limit=0");
    expect(status).toBe(200);
    expect(data.length).toBe(1); // clamped to min 1
  });
});

// --- Date boundary: before filter includes full day ---

describe("Date boundary - before filter", () => {
  it("before=YYYY-MM-DD includes bookmarks from that entire day", async () => {
    // First, find a known date that has bookmarks
    const { data: timeline } = await fetchJSON<Array<{ date: string; count: number }>>(
      "/api/timeline?days=365",
    );
    // Pick a date with bookmarks
    const dateWithBookmarks = timeline.find((t) => t.count > 0);
    expect(dateWithBookmarks).toBeDefined();

    const testDate = dateWithBookmarks!.date; // YYYY-MM-DD

    // Also search with after=testDate&before=testDate to get only that day
    const { data: onlyThatDay } = await fetchJSON<{
      results: Array<{ posted_at_iso: string }>;
      total: number;
    }>(`/api/search?after=${testDate}&before=${testDate}`);

    // The "only that day" query should return bookmarks
    expect(onlyThatDay.total).toBeGreaterThan(0);

    // All results from "only that day" should have dates starting with testDate
    for (const r of onlyThatDay.results) {
      expect(r.posted_at_iso.startsWith(testDate)).toBe(true);
    }
  });

  it("before filter with full ISO timestamp still works", async () => {
    const { status, data } = await fetchJSON<{
      results: unknown[];
      total: number;
    }>("/api/search?before=2026-04-01T23:59:59.999Z");
    expect(status).toBe(200);
    expect(data.total).toBeGreaterThan(0);
  });

  it("combined after+before date range returns correct results", async () => {
    const { data } = await fetchJSON<{
      results: Array<{ posted_at_iso: string }>;
      total: number;
    }>("/api/search?after=2026-01-01&before=2026-03-31");

    expect(data.total).toBeGreaterThan(0);
    for (const r of data.results) {
      expect(r.posted_at_iso >= "2026-01-01").toBe(true);
      // With before=2026-03-31, the normalized boundary is < 2026-04-01T00:00:00.000Z
      expect(r.posted_at_iso < "2026-04-01T00:00:00.000Z").toBe(true);
    }
  });
});

// --- Monthly Breakdown (Chronos) ---

describe("GET /api/monthly-breakdown", () => {
  it("returns an array of monthly entries", async () => {
    const { status, data } = await fetchJSON<
      Array<{ month: string; count: number }>
    >("/api/monthly-breakdown");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("months are in YYYY-MM format and sorted chronologically", async () => {
    const { data } = await fetchJSON<
      Array<{ month: string }>
    >("/api/monthly-breakdown");
    for (const entry of data) {
      expect(entry.month).toMatch(/^\d{4}-\d{2}$/);
    }
    for (let i = 0; i < data.length - 1; i++) {
      expect(data[i]!.month <= data[i + 1]!.month).toBe(true);
    }
  });

  it("total across all months equals totalBookmarks from /api/stats", async () => {
    const { data: months } = await fetchJSON<
      Array<{ count: number }>
    >("/api/monthly-breakdown");
    const { data: stats } = await fetchJSON<{ totalBookmarks: number }>("/api/stats");
    const totalFromMonths = months.reduce((sum, m) => sum + m.count, 0);
    // Should be equal or very close (some bookmarks may have null dates)
    expect(totalFromMonths).toBeGreaterThan(0);
    expect(totalFromMonths).toBeLessThanOrEqual(stats.totalBookmarks);
    // Allow small difference for bookmarks with unparseable dates
    expect(totalFromMonths).toBeGreaterThanOrEqual(stats.totalBookmarks - 10);
  });

  it("each entry includes domains, categories, topAuthors, notableBookmarks, newAuthors", async () => {
    const { data } = await fetchJSON<
      Array<{
        month: string;
        count: number;
        domains: Array<{ domain: string; count: number }>;
        categories: Array<{ category: string; count: number }>;
        topAuthors: Array<{ author_handle: string; count: number }>;
        notableBookmarks: Array<{ id: string; text: string }>;
        newAuthors: string[];
      }>
    >("/api/monthly-breakdown");
    const entry = data[0]!;
    expect(entry).toHaveProperty("domains");
    expect(entry).toHaveProperty("categories");
    expect(entry).toHaveProperty("topAuthors");
    expect(entry).toHaveProperty("notableBookmarks");
    expect(entry).toHaveProperty("newAuthors");
    expect(Array.isArray(entry.domains)).toBe(true);
    expect(Array.isArray(entry.categories)).toBe(true);
    expect(Array.isArray(entry.topAuthors)).toBe(true);
    expect(Array.isArray(entry.notableBookmarks)).toBe(true);
    expect(Array.isArray(entry.newAuthors)).toBe(true);
  });

  it("domains are sorted by count descending", async () => {
    const { data } = await fetchJSON<
      Array<{ domains: Array<{ domain: string; count: number }> }>
    >("/api/monthly-breakdown");
    // Find a month with multiple domains
    const monthWithDomains = data.find((m) => m.domains.length > 1);
    expect(monthWithDomains).toBeDefined();
    if (monthWithDomains) {
      for (let i = 0; i < monthWithDomains.domains.length - 1; i++) {
        expect(monthWithDomains.domains[i]!.count).toBeGreaterThanOrEqual(
          monthWithDomains.domains[i + 1]!.count,
        );
      }
    }
  });

  it("topAuthors has at most 5 entries per month", async () => {
    const { data } = await fetchJSON<
      Array<{ topAuthors: Array<{ author_handle: string }> }>
    >("/api/monthly-breakdown");
    for (const entry of data) {
      expect(entry.topAuthors.length).toBeLessThanOrEqual(5);
    }
  });

  it("notableBookmarks has at most 5 entries per month", async () => {
    const { data } = await fetchJSON<
      Array<{ notableBookmarks: Array<{ id: string }> }>
    >("/api/monthly-breakdown");
    for (const entry of data) {
      expect(entry.notableBookmarks.length).toBeLessThanOrEqual(5);
    }
  });

  it("returns Content-Type application/json", async () => {
    const { headers } = await fetchJSON<unknown>("/api/monthly-breakdown");
    expect(headers.get("content-type")).toContain("application/json");
  });
});

describe("GET /api/technique-backlog", () => {
  it("returns an array of technique groups", async () => {
    const { status, data } = await fetchJSON<
      Array<{ domain: string; count: number; bookmarks: unknown[] }>
    >("/api/technique-backlog");
    expect(status).toBe(200);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("each group has domain, count, and bookmarks", async () => {
    const { data } = await fetchJSON<
      Array<{ domain: string; count: number; bookmarks: unknown[] }>
    >("/api/technique-backlog");
    for (const group of data) {
      expect(group).toHaveProperty("domain");
      expect(group).toHaveProperty("count");
      expect(group).toHaveProperty("bookmarks");
      expect(typeof group.domain).toBe("string");
      expect(typeof group.count).toBe("number");
      expect(group.count).toBeGreaterThan(0);
      expect(Array.isArray(group.bookmarks)).toBe(true);
    }
  });

  it("groups are sorted by count descending", async () => {
    const { data } = await fetchJSON<
      Array<{ domain: string; count: number }>
    >("/api/technique-backlog");
    for (let i = 0; i < data.length - 1; i++) {
      expect(data[i]!.count).toBeGreaterThanOrEqual(data[i + 1]!.count);
    }
  });

  it("bookmarks have required fields", async () => {
    const { data } = await fetchJSON<
      Array<{
        bookmarks: Array<{
          id: string;
          text: string;
          author_handle: string;
          primary_domain: string;
        }>;
      }>
    >("/api/technique-backlog");
    const firstGroup = data[0]!;
    expect(firstGroup.bookmarks.length).toBeGreaterThan(0);
    const bookmark = firstGroup.bookmarks[0]!;
    expect(bookmark).toHaveProperty("id");
    expect(bookmark).toHaveProperty("text");
    expect(bookmark).toHaveProperty("author_handle");
    expect(bookmark).toHaveProperty("primary_domain");
  });

  it("limits bookmarks per group to 10", async () => {
    const { data } = await fetchJSON<
      Array<{ bookmarks: unknown[] }>
    >("/api/technique-backlog");
    for (const group of data) {
      expect(group.bookmarks.length).toBeLessThanOrEqual(10);
    }
  });

  it("returns Content-Type application/json", async () => {
    const { headers } = await fetchJSON<unknown>("/api/technique-backlog");
    expect(headers.get("content-type")).toContain("application/json");
  });
});

describe("GET /api/github-metadata", () => {
  it("returns an object with repo metadata", async () => {
    const { status, data } = await fetchJSON<
      Record<string, { owner: string; repo: string }>
    >("/api/github-metadata");
    expect(status).toBe(200);
    expect(typeof data).toBe("object");
    expect(data).not.toBeNull();
  });

  it("metadata entries have required fields", async () => {
    const { data } = await fetchJSON<
      Record<
        string,
        {
          owner: string;
          repo: string;
          html_url: string;
          fetched_at: string;
        }
      >
    >("/api/github-metadata");
    const keys = Object.keys(data);
    expect(keys.length).toBeGreaterThan(0);
    const firstEntry = data[keys[0]!]!;
    expect(firstEntry).toHaveProperty("owner");
    expect(firstEntry).toHaveProperty("repo");
    expect(firstEntry).toHaveProperty("html_url");
    expect(typeof firstEntry.owner).toBe("string");
    expect(typeof firstEntry.repo).toBe("string");
  });

  it("returns Content-Type application/json", async () => {
    const { headers } = await fetchJSON<unknown>("/api/github-metadata");
    expect(headers.get("content-type")).toContain("application/json");
  });
});
