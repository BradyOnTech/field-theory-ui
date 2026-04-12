import { describe, it, expect } from "vitest";
import { fallbackParsing, formatApiCall, isCountQuery, enforceCountQuerySearch } from "../oracle";
import { searchBookmarks } from "../queries";

describe("Oracle fallback parsing fixes", () => {
  describe("stop words handling", () => {
    it("extracts 'AI' from 'how many bookmarks about AI do I have?'", () => {
      const result = fallbackParsing("how many bookmarks about AI do I have?", []);
      expect(result.intent).toBe("count");
      // fallbackParsing lowercases input; FTS5 search is case-insensitive
      expect(result.params.q!.toLowerCase()).toBe("ai");
      // Crucially: should NOT include stop words like "do", "i", "have"
      expect(result.params.q).not.toMatch(/\bdo\b|\bi\b|\bhave\b/i);
    });

    it("extracts 'machine learning' from 'how many bookmarks about machine learning do I have?'", () => {
      const result = fallbackParsing(
        "how many bookmarks about machine learning do I have?",
        [],
      );
      expect(result.intent).toBe("count");
      expect(result.params.q!.toLowerCase()).toBe("machine learning");
    });

    it("extracts 'RAG' from 'how many bookmarks about RAG are there?'", () => {
      const result = fallbackParsing("how many bookmarks about RAG are there?", []);
      expect(result.intent).toBe("count");
      expect(result.params.q!.toLowerCase()).toBe("rag");
      // Should NOT include "are" or "there"
      expect(result.params.q).not.toMatch(/\bare\b|\bthere\b/i);
    });

    it("does not include stop words in keyword extraction", () => {
      const result = fallbackParsing("how many bookmarks about AI do I have?", []);
      expect(result.params.q).not.toMatch(/\b(do|i|have)\b/i);
    });

    it("handles 'how many' without topic by returning stats", () => {
      const result = fallbackParsing("how many total bookmarks", []);
      expect(result.endpoint).toBe("/api/stats");
      expect(result.intent).toBe("stats");
    });

    it("handles 'how many bookmarks with tool' correctly", () => {
      const result = fallbackParsing("how many bookmarks with tool?", []);
      expect(result.intent).toBe("count");
      expect(result.params.q).toBe("tool");
    });
  });

  describe("follow-up context", () => {
    it("combines prior context with author follow-up", () => {
      const context = [
        { role: "user" as const, content: "Show me AI bookmarks" },
        {
          role: "assistant" as const,
          content: "Found results",
          apiCall: "/api/search?q=AI&limit=10",
        },
      ];
      const result = fallbackParsing("now just from @hwchase17", context);
      expect(result.params.author).toBe("hwchase17");
      expect(result.params.q).toBe("AI");
    });
  });

  describe("formatApiCall", () => {
    it("formats endpoint without params", () => {
      const result = formatApiCall({
        endpoint: "/api/stats",
        params: {},
        intent: "stats",
      });
      expect(result).toBe("/api/stats");
    });

    it("formats endpoint with params", () => {
      const result = formatApiCall({
        endpoint: "/api/search",
        params: { q: "AI", category: "tool" },
        intent: "list",
      });
      expect(result).toContain("/api/search?");
      expect(result).toContain("q=AI");
      expect(result).toContain("category=tool");
    });
  });
});

describe("isCountQuery", () => {
  it("detects 'how many' queries", () => {
    expect(isCountQuery("How many bookmarks about AI do I have?")).toBe(true);
    expect(isCountQuery("how many bookmarks about RAG are there?")).toBe(true);
    expect(isCountQuery("How many AI bookmarks?")).toBe(true);
  });

  it("detects 'count' queries", () => {
    expect(isCountQuery("count bookmarks about AI")).toBe(true);
    expect(isCountQuery("What is the count of AI bookmarks?")).toBe(true);
  });

  it("does not detect non-count queries", () => {
    expect(isCountQuery("Show me AI bookmarks")).toBe(false);
    expect(isCountQuery("Who are the top authors?")).toBe(false);
    expect(isCountQuery("What categories are there?")).toBe(false);
  });
});

describe("enforceCountQuerySearch", () => {
  it("overrides /api/categories to /api/search for count queries", () => {
    const parsed = {
      endpoint: "/api/categories",
      params: { name: "ai" },
      intent: "categories" as const,
    };
    const result = enforceCountQuerySearch(parsed, "How many bookmarks about AI do I have?");
    expect(result.endpoint).toBe("/api/search");
    expect(result.intent).toBe("count");
    expect(result.params.q!.toLowerCase()).toContain("ai");
  });

  it("overrides /api/domains to /api/search for count queries", () => {
    const parsed = {
      endpoint: "/api/domains",
      params: { name: "ai" },
      intent: "domains" as const,
    };
    const result = enforceCountQuerySearch(parsed, "How many bookmarks about AI do I have?");
    expect(result.endpoint).toBe("/api/search");
    expect(result.intent).toBe("count");
    expect(result.params.q!.toLowerCase()).toContain("ai");
  });

  it("keeps /api/search when already correct", () => {
    const parsed = {
      endpoint: "/api/search",
      params: { q: "AI" },
      intent: "count" as const,
    };
    const result = enforceCountQuerySearch(parsed, "How many bookmarks about AI?");
    expect(result.endpoint).toBe("/api/search");
    expect(result.params.q).toBe("AI");
    expect(result.intent).toBe("count");
  });

  it("does not modify non-count queries", () => {
    const parsed = {
      endpoint: "/api/categories",
      params: {},
      intent: "categories" as const,
    };
    const result = enforceCountQuerySearch(parsed, "What categories are there?");
    expect(result.endpoint).toBe("/api/categories");
    expect(result.intent).toBe("categories");
  });

  it("extracts keyword from query when params have no q", () => {
    const parsed = {
      endpoint: "/api/categories",
      params: {},
      intent: "count" as const,
    };
    const result = enforceCountQuerySearch(parsed, "How many bookmarks about machine learning?");
    expect(result.endpoint).toBe("/api/search");
    expect(result.params.q!.toLowerCase()).toBe("machine learning");
  });

  it("preserves author filter when overriding endpoint", () => {
    const parsed = {
      endpoint: "/api/categories",
      params: { name: "ai", author: "hwchase17" },
      intent: "count" as const,
    };
    const result = enforceCountQuerySearch(parsed, "How many AI bookmarks from @hwchase17?");
    expect(result.endpoint).toBe("/api/search");
    expect(result.params.author).toBe("hwchase17");
  });

  it("falls back to /api/stats for 'how many total bookmarks' with no keyword", () => {
    const parsed = {
      endpoint: "/api/categories",
      params: {},
      intent: "count" as const,
    };
    const result = enforceCountQuerySearch(parsed, "how many total bookmarks");
    expect(result.endpoint).toBe("/api/stats");
    expect(result.intent).toBe("stats");
  });
});

describe("Oracle count accuracy (VAL-ORACLE-002)", () => {
  it("Oracle count for 'AI' matches /api/search?q=AI total within ±20%", () => {
    // Get the FTS5 search total for AI
    const searchResult = searchBookmarks({ q: "AI", limit: 1, offset: 0 });
    const searchTotal = searchResult.total;

    // Simulate what Oracle does: fallback parsing for count query
    const parsed = fallbackParsing("How many bookmarks about AI do I have?", []);

    // Verify it routes to /api/search
    expect(parsed.endpoint).toBe("/api/search");
    expect(parsed.intent).toBe("count");
    expect(parsed.params.q!.toLowerCase()).toBe("ai");

    // Execute the search with parsed params
    const oracleResult = searchBookmarks({
      q: parsed.params.q,
      limit: 1,
      offset: 0,
    });

    // The Oracle total should match the direct search total exactly
    // (since they both use the same FTS5 search)
    expect(oracleResult.total).toBe(searchTotal);

    // And the total should be in a reasonable range (not 3243 from domain count)
    // The FTS5 search for "AI" returns ~984, not the domain=ai count of ~3243
    expect(oracleResult.total).toBeGreaterThan(100); // sanity: at least some AI bookmarks
    expect(oracleResult.total).toBeLessThan(2000); // sanity: not the inflated domain count

    // Verify ±20% tolerance: Oracle total within 20% of search total
    const tolerance = searchTotal * 0.2;
    expect(oracleResult.total).toBeGreaterThanOrEqual(searchTotal - tolerance);
    expect(oracleResult.total).toBeLessThanOrEqual(searchTotal + tolerance);
  });

  it("enforceCountQuerySearch corrects Claude returning /api/domains for AI count", () => {
    // Simulate Claude returning wrong endpoint (the original bug)
    const claudeResult = {
      endpoint: "/api/domains",
      params: { name: "ai" },
      intent: "domains" as const,
    };

    // enforceCountQuerySearch should fix this
    const corrected = enforceCountQuerySearch(
      claudeResult,
      "How many bookmarks about AI do I have?",
    );

    expect(corrected.endpoint).toBe("/api/search");
    expect(corrected.intent).toBe("count");

    // Execute the corrected search
    const result = searchBookmarks({
      q: corrected.params.q,
      limit: 1,
      offset: 0,
    });

    // Should get FTS5 total, not domain count
    expect(result.total).toBeLessThan(2000);
    expect(result.total).toBeGreaterThan(100);
  });

  it("transparent API call shows /api/search for count queries", () => {
    const parsed = fallbackParsing("How many bookmarks about AI do I have?", []);
    const apiCall = formatApiCall(parsed);

    // Should show /api/search, not /api/categories or /api/domains
    expect(apiCall).toContain("/api/search");
    expect(apiCall).toContain("q=");
    expect(apiCall.toLowerCase()).toContain("ai");
    expect(apiCall).not.toContain("/api/categories");
    expect(apiCall).not.toContain("/api/domains");
  });
});
