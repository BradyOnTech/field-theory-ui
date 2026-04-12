import { Fragment, useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchGithubRepos,
  fetchGithubMetadata,
  fetchTechniqueBacklog,
} from "@/lib/api";
import type {
  GithubRepo,
  GitHubMetadataMap,
  GitHubMetadataEntry,
  TechniqueGroup,
  TechniqueBookmark,
} from "@/lib/types";
import { formatNumber, buildSearchSnippet } from "@/lib/utils";
import { formatTweetText } from "@/lib/tweet-text";
import { ExternalLink, AlertTriangle, Inbox } from "lucide-react";
import { SimplePagination } from "@/components/simple-pagination";
import { ErrorRetry } from "@/components/error-retry";

function repoKey(url: string): string {
  return url.replace("https://github.com/", "");
}

// --- Status toggle types ---

type ItemStatus = "queued" | "in-progress" | "done";

const STATUS_CYCLE: ItemStatus[] = ["queued", "in-progress", "done"];

const STATUS_LABELS: Record<ItemStatus, string> = {
  queued: "Queued",
  "in-progress": "In Progress",
  done: "Done",
};

const STATUS_COLORS: Record<ItemStatus, string> = {
  queued: "bg-surface text-[#71717a]",
  "in-progress": "bg-[#eab308]/20 text-[#eab308]",
  done: "bg-[#22c55e]/20 text-[#22c55e]",
};

// --- localStorage helpers ---

const FORGE_STATUS_KEY = "forge-item-status";

function loadStatusMap(): Record<string, ItemStatus> {
  try {
    const stored = localStorage.getItem(FORGE_STATUS_KEY);
    if (stored) {
      return JSON.parse(stored) as Record<string, ItemStatus>;
    }
  } catch {
    // Invalid stored data
  }
  return {};
}

function saveStatusMap(statusMap: Record<string, ItemStatus>): void {
  try {
    localStorage.setItem(FORGE_STATUS_KEY, JSON.stringify(statusMap));
  } catch {
    // localStorage full or unavailable
  }
}

// --- Language color map ---

const LANGUAGE_COLORS: Record<string, string> = {
  Python: "#3572A5",
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  Ruby: "#701516",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Jupyter: "#DA5B0B",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Shell: "#89e051",
};

function getLanguageColor(language: string | null): string {
  if (!language) return "#3f3f46";
  return LANGUAGE_COLORS[language] || "#22c55e";
}

// --- Domain label map ---

const DOMAIN_LABELS: Record<string, string> = {
  ai: "AI & Machine Learning",
  "web-dev": "Web Development",
  design: "Design",
  devops: "DevOps & Infrastructure",
  security: "Security",
  data: "Data Engineering",
  mobile: "Mobile Development",
  cloud: "Cloud Computing",
  legal: "Legal & Policy",
  other: "Other Topics",
};

function getDomainLabel(domain: string): string {
  return DOMAIN_LABELS[domain] || domain.charAt(0).toUpperCase() + domain.slice(1);
}

// --- Components ---

function StatusBadge({
  status,
  onClick,
}: {
  status: ItemStatus;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-badge px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80 active:opacity-70 ${STATUS_COLORS[status]}`}
      title={`Click to change status (${STATUS_LABELS[status]})`}
    >
      {STATUS_LABELS[status]}
    </button>
  );
}

function ExpandedRepoDetail({
  repo,
  metadata,
}: {
  repo: GithubRepo;
  metadata: GitHubMetadataEntry | undefined;
}) {
  const hasMetadata = metadata && !metadata.error;
  const isNotFound = metadata?.error === "not_found";
  const isRateLimited = metadata?.error === "rate_limited";

  return (
    <td colSpan={6} className="border-t border-border bg-card/50 px-6 py-4">
      {hasMetadata && metadata.description && (
        <p className="text-sm text-muted">{metadata.description}</p>
      )}
      {isNotFound && (
        <p className="flex items-center gap-1 text-sm text-error">
          <AlertTriangle className="h-3 w-3" />
          Repository not found or deleted
        </p>
      )}
      {isRateLimited && (
        <p className="flex items-center gap-1 text-sm text-warning">
          <AlertTriangle className="h-3 w-3" />
          Rate limited -- metadata unavailable
        </p>
      )}
      <div className="mt-3">
        <a
          href={repo.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          Open on GitHub <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </td>
  );
}

function TechniqueItem({
  bookmark,
  status,
  onToggleStatus,
  onNavigate,
  onAuthorClick,
}: {
  bookmark: TechniqueBookmark;
  status: ItemStatus;
  onToggleStatus: () => void;
  onNavigate: () => void;
  onAuthorClick: (handle: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className="flex min-h-[44px] items-start justify-between gap-3 rounded-button border border-border bg-background px-3 py-3 transition-colors hover:bg-card active:bg-card cursor-pointer"
      onClick={onNavigate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onNavigate();
        }
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">
          {formatTweetText(bookmark.text, { maxLength: 140 })}
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onAuthorClick(bookmark.author_handle); }}
            className="cursor-pointer transition-colors hover:text-foreground"
          >
            @{bookmark.author_handle}
          </button>
          {(bookmark.like_count > 0 || bookmark.repost_count > 0) && (
            <span className="text-disabled">
              ♥ {formatNumber(bookmark.like_count)} · ↻ {formatNumber(bookmark.repost_count)}
            </span>
          )}
        </div>
      </div>
      <StatusBadge status={status} onClick={onToggleStatus} />
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-border bg-card px-6 py-12 text-center">
      <Inbox className="mb-3 h-10 w-10 text-disabled" />
      <h3 className="text-lg font-medium text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted">{description}</p>
    </div>
  );
}

// --- Main View ---

export function ForgeView() {
  const navigate = useNavigate();

  // Data state
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [metadata, setMetadata] = useState<GitHubMetadataMap>({});
  const [techniqueGroups, setTechniqueGroups] = useState<TechniqueGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Repo controls
  const [repoSearch, setRepoSearch] = useState("");
  const [repoSort, setRepoSort] = useState<"mentions" | "recent" | "stars" | "name">("recent");
  const [repoPage, setRepoPage] = useState(0);
  const [repoPerPage, setRepoPerPage] = useState(25);
  const [expandedRepo, setExpandedRepo] = useState<string | null>(null);

  // Status toggles (localStorage-backed)
  const [statusMap, setStatusMap] = useState<Record<string, ItemStatus>>(loadStatusMap);

  const toggleStatus = useCallback(
    (itemId: string) => {
      setStatusMap((prev) => {
        const current = prev[itemId] || "queued";
        const currentIndex = STATUS_CYCLE.indexOf(current);
        const nextStatus = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length]!;
        const updated = { ...prev, [itemId]: nextStatus };
        saveStatusMap(updated);
        return updated;
      });
    },
    [],
  );

  const getStatus = useCallback(
    (itemId: string): ItemStatus => {
      return statusMap[itemId] || "queued";
    },
    [statusMap],
  );

  // Fetch data
  const loadForgeData = useCallback(() => {
    let cancelled = false;

    setError(null);
    setLoading(true);

    async function loadData() {
      try {
        const [repoData, techniqueData] = await Promise.all([
          fetchGithubRepos(),
          fetchTechniqueBacklog(),
        ]);

        if (!cancelled) {
          setRepos(repoData);
          setTechniqueGroups(techniqueData);
          setLoading(false);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setLoading(false);
          setError("Failed to load data. Is the server running?");
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cancel = loadForgeData();
    return cancel;
  }, [loadForgeData]);

  // Fetch GitHub metadata separately (may be slower due to API calls)
  useEffect(() => {
    let cancelled = false;

    async function loadMetadata() {
      try {
        const metadataData = await fetchGithubMetadata();
        if (!cancelled) {
          setMetadata(metadataData);
          setMetadataLoading(false);
        }
      } catch {
        if (!cancelled) {
          setMetadataLoading(false);
        }
      }
    }

    loadMetadata();
    return () => {
      cancelled = true;
    };
  }, []);

  const navigateToBookmark = useCallback(
    (text: string, authorHandle: string) => {
      // Extract first few words of text for a focused search query
      const searchSnippet = buildSearchSnippet(text);
      const params = new URLSearchParams();
      if (searchSnippet) params.set("q", searchSnippet);
      if (authorHandle) params.set("author", authorHandle);
      navigate(`/stream?${params.toString()}`);
    },
    [navigate],
  );

  // Repo filtering, sorting, pagination
  const filteredRepos = useMemo(() => {
    if (!repoSearch.trim()) return repos;
    const q = repoSearch.toLowerCase();
    return repos.filter((repo) => {
      const key = repoKey(repo.url).toLowerCase();
      if (key.includes(q)) return true;
      const meta = metadata[key];
      if (meta && !meta.error) {
        if (meta.description?.toLowerCase().includes(q)) return true;
        if (meta.language?.toLowerCase().includes(q)) return true;
      }
      return false;
    });
  }, [repos, metadata, repoSearch]);

  const sortedRepos = useMemo(() => {
    const sorted = [...filteredRepos];
    switch (repoSort) {
      case "mentions":
        sorted.sort((a, b) => b.count - a.count);
        break;
      case "recent":
        sorted.sort((a, b) => (b.lastSeen || "").localeCompare(a.lastSeen || ""));
        break;
      case "stars": {
        sorted.sort((a, b) => {
          const keyA = repoKey(a.url).toLowerCase();
          const keyB = repoKey(b.url).toLowerCase();
          const starsA = metadata[keyA]?.stargazers_count ?? 0;
          const starsB = metadata[keyB]?.stargazers_count ?? 0;
          return starsB - starsA;
        });
        break;
      }
      case "name":
        sorted.sort((a, b) => a.url.localeCompare(b.url));
        break;
    }
    return sorted;
  }, [filteredRepos, repoSort, metadata]);

  const repoTotalPages = Math.max(1, Math.ceil(sortedRepos.length / repoPerPage));
  const paginatedRepos = useMemo(
    () => sortedRepos.slice(repoPage * repoPerPage, (repoPage + 1) * repoPerPage),
    [sortedRepos, repoPage, repoPerPage],
  );

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Forge</h1>
        <p className="mt-1 text-sm text-muted">
          Build queue — GitHub repos and technique backlog.
        </p>
      </div>

      {/* Error State */}
      {error && (
        <ErrorRetry message={error} onRetry={() => { setError(null); loadForgeData(); }} />
      )}

      {/* Saved Repos Section */}
      <section className="mb-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-foreground">Saved Repos</h2>
            <span className="rounded-badge bg-surface px-2 py-0.5 font-mono text-xs text-muted">
              {filteredRepos.length}{repoSearch ? ` / ${repos.length}` : ""}
            </span>
            {metadataLoading && (
              <span className="text-xs text-muted">Loading metadata…</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={repoSearch}
              onChange={(e) => { setRepoSearch(e.target.value); setRepoPage(0); }}
              placeholder="Search repos..."
              className="h-10 w-52 rounded-button border border-border bg-background px-3 text-sm text-foreground placeholder:text-disabled focus:border-[#333] focus:outline-none"
            />
            <select
              value={repoSort}
              onChange={(e) => { setRepoSort(e.target.value as typeof repoSort); setRepoPage(0); }}
              className="h-10 rounded-button border border-border bg-background px-2 text-sm text-foreground focus:outline-none"
            >
              <option value="mentions">Most mentioned</option>
              <option value="recent">Most recent</option>
              <option value="stars">Stars</option>
              <option value="name">Name</option>
            </select>
            <select
              value={repoPerPage}
              onChange={(e) => { setRepoPerPage(Number(e.target.value)); setRepoPage(0); }}
              className="h-10 rounded-button border border-border bg-background px-2 text-sm text-foreground focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="h-64 animate-pulse rounded-card border border-border bg-card" />
        ) : repos.length === 0 ? (
          <EmptyState
            title="No saved repos"
            description="Bookmark tweets containing GitHub repo links to see them here."
          />
        ) : (
          <>
            <div className="overflow-hidden rounded-card border border-border">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-card">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted">Repo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted">Stars</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted">Language</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted">Mentions</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted">Status</th>
                    <th className="w-10 px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {paginatedRepos.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted">
                        No repos match your search.
                      </td>
                    </tr>
                  ) : (
                    paginatedRepos.map((repo) => {
                      const key = repoKey(repo.url).toLowerCase();
                      const meta = metadata[key];
                      const hasMeta = meta && !meta.error;
                      const isExpanded = expandedRepo === repo.url;
                      return (
                        <Fragment key={repo.url}>
                          <tr
                            onClick={() => setExpandedRepo(isExpanded ? null : repo.url)}
                            className="cursor-pointer border-b border-border transition-colors hover:bg-surface"
                          >
                            <td className="px-4 py-3 font-mono text-sm font-medium text-foreground">
                              {repoKey(repo.url)}
                            </td>
                            <td className="px-4 py-3 font-mono text-muted">
                              {hasMeta ? formatNumber(meta.stargazers_count) : "--"}
                            </td>
                            <td className="px-4 py-3 text-muted">
                              {hasMeta && meta.language ? (
                                <span className="flex items-center gap-1.5">
                                  <span
                                    className="inline-block h-2.5 w-2.5 rounded-full"
                                    style={{ backgroundColor: getLanguageColor(meta.language) }}
                                  />
                                  {meta.language}
                                </span>
                              ) : "--"}
                            </td>
                            <td className="px-4 py-3 font-mono text-muted">{repo.count}</td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <StatusBadge
                                status={getStatus(`repo:${key}`)}
                                onClick={() => toggleStatus(`repo:${key}`)}
                              />
                            </td>
                            <td className="px-4 py-3 text-center text-disabled">{isExpanded ? "\u2212" : "+"}</td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <ExpandedRepoDetail repo={repo} metadata={meta} />
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
              </div>
            </div>
            <SimplePagination
              page={repoPage + 1}
              totalPages={repoTotalPages}
              onPageChange={(p) => setRepoPage(p - 1)}
            />
          </>
        )}
      </section>

      {/* Technique Backlog Section */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            Technique Backlog
          </h2>
          <span className="rounded-badge bg-surface px-2 py-0.5 font-mono text-xs text-foreground">
            {techniqueGroups.reduce((sum, g) => sum + g.count, 0)}
          </span>
        </div>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-card border border-border bg-card"
              />
            ))}
          </div>
        ) : techniqueGroups.length === 0 ? (
          <EmptyState
            title="No technique bookmarks"
            description="Bookmark tweets about techniques to build your backlog."
          />
        ) : (
          <div className="space-y-6">
            {techniqueGroups.map((group) => (
              <div
                key={group.domain}
                className="rounded-card border border-border bg-card p-4"
              >
                <div className="mb-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/stream?domain=${encodeURIComponent(group.domain)}`)}
                    className="cursor-pointer text-base font-semibold text-foreground transition-colors hover:text-muted"
                  >
                    {getDomainLabel(group.domain)}
                  </button>
                  <span className="rounded-badge bg-surface px-2 py-0.5 font-mono text-xs text-muted">
                    {formatNumber(group.count)} item{group.count !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="space-y-2">
                  {group.bookmarks.map((bookmark) => (
                    <TechniqueItem
                      key={bookmark.id}
                      bookmark={bookmark}
                      status={getStatus(`technique:${bookmark.id}`)}
                      onToggleStatus={() =>
                        toggleStatus(`technique:${bookmark.id}`)
                      }
                      onNavigate={() => navigateToBookmark(bookmark.text, bookmark.author_handle)}
                      onAuthorClick={(handle) => navigate(`/people/${encodeURIComponent(handle)}`)}
                    />
                  ))}
                  {group.count > group.bookmarks.length && (
                    <p className="pt-1 text-center text-xs text-disabled">
                      +{formatNumber(group.count - group.bookmarks.length)} more
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
