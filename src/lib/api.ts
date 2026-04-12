import type {
  Stats,
  Bookmark,
  CategoryCount,
  DomainCount,
  TimelineEntry,
  Author,
  SearchParams,
  SearchResult,
  AuthorProfile,
  GithubRepo,
  OracleContext,
  OracleResponse,
  OracleStatus,
  OracleStreamEvent,
  MonthlyBreakdownEntry,
  TechniqueGroup,
  GitHubMetadataMap,
} from "./types";
import { getCached, setCache } from "./api-cache";

const API_BASE = "/api";

async function fetchJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  // Never cache Oracle requests (chat responses should never be cached)
  const shouldCache = !url.includes("/api/oracle");

  if (shouldCache) {
    const cached = getCached<T>(url);
    if (cached !== null) return cached;
  }

  const response = await fetch(url, signal ? { signal } : undefined);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error((error as { error: string }).error || `HTTP ${response.status}`);
  }
  const data = await response.json() as T;

  if (shouldCache) {
    setCache(url, data);
  }

  return data;
}

export function fetchStats(): Promise<Stats> {
  return fetchJSON<Stats>(`${API_BASE}/stats`);
}

export function fetchRecent(limit = 20): Promise<Bookmark[]> {
  return fetchJSON<Bookmark[]>(`${API_BASE}/recent?limit=${limit}`);
}

export function fetchCategories(): Promise<CategoryCount[]> {
  return fetchJSON<CategoryCount[]>(`${API_BASE}/categories`);
}

export function fetchDomains(): Promise<DomainCount[]> {
  return fetchJSON<DomainCount[]>(`${API_BASE}/domains`);
}

export function fetchTimeline(days = 90): Promise<TimelineEntry[]> {
  return fetchJSON<TimelineEntry[]>(`${API_BASE}/timeline?days=${days}`);
}

export function fetchTopAuthors(limit = 20): Promise<Author[]> {
  return fetchJSON<Author[]>(`${API_BASE}/top-authors?limit=${limit}`);
}

export function fetchSearch(params: SearchParams, signal?: AbortSignal): Promise<SearchResult> {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set("q", params.q);
  if (params.author) searchParams.set("author", params.author);
  if (params.category) searchParams.set("category", params.category);
  if (params.domain) searchParams.set("domain", params.domain);
  if (params.after) searchParams.set("after", params.after);
  if (params.before) searchParams.set("before", params.before);
  if (params.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params.offset !== undefined) searchParams.set("offset", String(params.offset));
  return fetchJSON<SearchResult>(`${API_BASE}/search?${searchParams.toString()}`, signal);
}

export function fetchAuthor(handle: string): Promise<AuthorProfile> {
  return fetchJSON<AuthorProfile>(`${API_BASE}/author/${encodeURIComponent(handle)}`);
}

export function fetchGithubRepos(): Promise<GithubRepo[]> {
  return fetchJSON<GithubRepo[]>(`${API_BASE}/github-repos`);
}

export function fetchSelfBookmarks(handle: string): Promise<Bookmark[]> {
  return fetchJSON<Bookmark[]>(
    `${API_BASE}/self-bookmarks?handle=${encodeURIComponent(handle)}`,
  );
}

export function fetchRandomBookmark(): Promise<Bookmark> {
  return fetchJSON<Bookmark>(`${API_BASE}/random-bookmark`);
}

export function fetchMonthlyBreakdown(): Promise<MonthlyBreakdownEntry[]> {
  return fetchJSON<MonthlyBreakdownEntry[]>(`${API_BASE}/monthly-breakdown`);
}

export function fetchOracleStatus(): Promise<OracleStatus> {
  return fetchJSON<OracleStatus>(`${API_BASE}/oracle/status`);
}

export function fetchOracle(
  q: string,
  context: OracleContext[] = [],
): Promise<OracleResponse> {
  const params = new URLSearchParams();
  params.set("q", q);
  if (context.length > 0) {
    params.set("context", JSON.stringify(context));
  }
  return fetchJSON<OracleResponse>(`${API_BASE}/oracle?${params.toString()}`);
}

export function fetchTechniqueBacklog(): Promise<TechniqueGroup[]> {
  return fetchJSON<TechniqueGroup[]>(`${API_BASE}/technique-backlog`);
}

export function fetchGithubMetadata(): Promise<GitHubMetadataMap> {
  return fetchJSON<GitHubMetadataMap>(`${API_BASE}/github-metadata`);
}

export function fetchOracleStream(
  q: string,
  context: OracleContext[] = [],
  onProgress: (event: OracleStreamEvent) => void,
  onDone: (response: OracleResponse) => void,
  onError: (error: Error) => void,
): { close: () => void } {
  const controller = new AbortController();

  fetch(`${API_BASE}/oracle/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q, context, mode: "pro" }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let eventEnd: number;
        while ((eventEnd = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, eventEnd);
          buffer = buffer.slice(eventEnd + 2);

          for (const line of block.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6);
            if (!json) continue;
            const data = JSON.parse(json) as OracleStreamEvent;
            if (data.step === "done") {
              onDone({ answer: data.answer, mode: "pro" });
              return;
            } else if (data.step === "error") {
              onError(new Error(data.error));
              return;
            } else {
              onProgress(data);
            }
          }
        }
      }

      // Stream ended — check remaining buffer for a final event without trailing \n\n
      if (buffer.trim()) {
        for (const line of buffer.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6);
          if (!json) continue;
          try {
            const data = JSON.parse(json) as OracleStreamEvent;
            if (data.step === "done") {
              onDone({ answer: data.answer, mode: "pro" });
              return;
            }
          } catch { /* incomplete */ }
        }
      }
    })
    .catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      onError(err instanceof Error ? err : new Error("Stream connection lost"));
    });

  return { close: () => controller.abort() };
}
