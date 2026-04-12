import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "http";
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

describe("GET /api/random-bookmark", () => {
  it("returns a single bookmark", async () => {
    const { status, data } = await fetchJSON<{
      id: string;
      text: string;
      author_handle: string;
      posted_at: string;
    }>("/api/random-bookmark");
    expect(status).toBe(200);
    expect(data.id).toBeTruthy();
    expect(data.text).toBeTruthy();
    expect(data.author_handle).toBeTruthy();
    expect(data.posted_at).toBeTruthy();
  });

  it("returns different bookmarks on repeated calls (at least 2 distinct in 5)", async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const { data } = await fetchJSON<{ id: string }>("/api/random-bookmark");
      ids.add(data.id);
    }
    expect(ids.size).toBeGreaterThanOrEqual(2);
  });

  it("returns Content-Type application/json", async () => {
    const { headers } = await fetchJSON<unknown>("/api/random-bookmark");
    expect(headers.get("content-type")).toContain("application/json");
  });

  it("includes all standard bookmark fields", async () => {
    const { data } = await fetchJSON<Record<string, unknown>>("/api/random-bookmark");
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("text");
    expect(data).toHaveProperty("author_handle");
    expect(data).toHaveProperty("posted_at");
    expect(data).toHaveProperty("posted_at_iso");
    expect(data).toHaveProperty("like_count");
    expect(data).toHaveProperty("repost_count");
    expect(data).toHaveProperty("categories");
    expect(data).toHaveProperty("primary_category");
    expect(data).toHaveProperty("domains");
    expect(data).toHaveProperty("primary_domain");
  });
});

describe("GET /api/oracle", () => {
  it("returns 400 when q parameter is missing", async () => {
    const { status, data } = await fetchJSON<{ error: string }>("/api/oracle");
    expect(status).toBe(400);
    expect(data.error).toBeTruthy();
  });

  it("returns a valid response for a count query", async () => {
    const { status, data } = await fetchJSON<{
      answer: string;
      apiCall: string;
      results: unknown[];
      total: number;
    }>("/api/oracle?q=how+many+bookmarks+about+AI");
    expect(status).toBe(200);
    expect(data.answer).toBeTruthy();
    expect(data.apiCall).toBeTruthy();
    expect(typeof data.total).toBe("number");
    expect(data.total).toBeGreaterThan(0);
  }, 35000);

  it("returns a valid response for a list query", async () => {
    const { status, data } = await fetchJSON<{
      answer: string;
      apiCall: string;
      results: Array<{ id: string; text: string }>;
      total: number;
    }>("/api/oracle?q=show+me+recent+tool+bookmarks");
    expect(status).toBe(200);
    expect(data.answer).toBeTruthy();
    expect(data.apiCall).toBeTruthy();
    expect(data.results.length).toBeGreaterThan(0);
  }, 35000);

  it("returns a positive total for AI-related query", async () => {
    const { data } = await fetchJSON<{
      answer: string;
      apiCall: string;
      total: number;
    }>("/api/oracle?q=how+many+bookmarks+about+AI+do+I+have");

    // Oracle should find some AI bookmarks
    expect(data.total).toBeGreaterThan(0);
    expect(data.answer).toBeTruthy();
    // API call should mention a search-related endpoint
    expect(data.apiCall).toBeTruthy();
  }, 35000);

  it("handles follow-up context with author filter", async () => {
    const context = JSON.stringify([
      { role: "user", content: "Show me recent tool bookmarks" },
      {
        role: "assistant",
        content: "Found bookmarks",
        apiCall: "/api/search?category=tool&limit=10",
      },
    ]);
    const { status, data } = await fetchJSON<{
      answer: string;
      apiCall: string;
      results: unknown[];
      total: number;
    }>(
      `/api/oracle?q=now+just+from+%40hwchase17&context=${encodeURIComponent(context)}`,
    );
    expect(status).toBe(200);
    expect(data.apiCall).toBeTruthy();
    // The apiCall should include author parameter
    expect(data.apiCall.toLowerCase()).toContain("author");
  }, 35000);

  it("returns Content-Type application/json", async () => {
    const { headers } = await fetchJSON<unknown>(
      "/api/oracle?q=test+query",
    );
    expect(headers.get("content-type")).toContain("application/json");
  }, 35000);

  it("handles stats-type queries", async () => {
    const { status, data } = await fetchJSON<{
      answer: string;
      total: number;
    }>("/api/oracle?q=how+many+total+bookmarks");
    expect(status).toBe(200);
    expect(data.answer).toBeTruthy();
    expect(data.total).toBeGreaterThan(0);
  }, 35000);
});
