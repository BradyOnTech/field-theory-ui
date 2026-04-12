import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { User, Edit3, TrendingUp, Layers, Heart, Repeat2 } from "lucide-react";
import { fetchSelfBookmarks, fetchSearch } from "@/lib/api";
import type { Bookmark, CategoryCount, TimelineEntry } from "@/lib/types";
import { formatNumber, parseTwitterDate, tweetUrl } from "@/lib/utils";
import { formatTweetText } from "@/lib/tweet-text";
import { ErrorRetry } from "@/components/error-retry";

const HANDLE_STORAGE_KEY = "mirror-handle";

// --- Helper types ---

interface OverlapItem {
  topic: string;
  selfCount: number;
  othersCount: number;
}

// --- Handle prompt component ---

function HandlePrompt({ onSave }: { onSave: (handle: string) => void }) {
  const [value, setValue] = useState("");

  const handleSubmit = () => {
    const cleaned = value.trim().replace(/^@/, "");
    if (cleaned) {
      onSave(cleaned);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface mb-6">
        <User className="h-8 w-8 text-muted" />
      </div>
      <h2 className="text-xl font-bold text-foreground mb-2">
        Set your handle
      </h2>
      <p className="text-sm text-muted mb-6 max-w-md text-center">
        Enter your X/Twitter handle to see your self-bookmark analysis.
        Mirror shows insights about the posts you bookmarked that you authored.
      </p>
      <div className="flex gap-3 w-full max-w-sm">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-disabled">@</span>
          <input
            type="text"
            placeholder="your handle"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-button border border-border bg-card py-2.5 pl-8 pr-4 text-sm text-foreground placeholder:text-disabled focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!value.trim().replace(/^@/, "")}
          className="min-h-[44px] rounded-button bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-colors hover:bg-foreground/90 active:bg-foreground/80 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Go
        </button>
      </div>
    </div>
  );
}

// --- Timeline tooltip ---

interface TimelineTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: TimelineEntry }>;
}

function TimelineTooltip({ active, payload }: TimelineTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="rounded-card border border-border bg-card px-3 py-2 shadow-lg">
      <p className="text-sm text-foreground">{data.date}</p>
      <p className="font-mono text-sm text-foreground">{data.count} bookmarks</p>
    </div>
  );
}

// --- Category bar chart tooltip ---

interface BarChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: CategoryCount }>;
}

function BarChartTooltip({ active, payload }: BarChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="rounded-card border border-border bg-card px-3 py-2 shadow-lg">
      <p className="text-sm text-foreground">{data.name}</p>
      <p className="font-mono text-sm text-foreground">{data.count} posts</p>
    </div>
  );
}

// --- Main Mirror view ---

export function MirrorView() {
  const navigate = useNavigate();
  const [handle, setHandle] = useState<string | null>(() => {
    return localStorage.getItem(HANDLE_STORAGE_KEY);
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [selfBookmarks, setSelfBookmarks] = useState<Bookmark[]>([]);
  const [otherCategories, setOtherCategories] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);

  // Save handle to localStorage
  const saveHandle = useCallback((newHandle: string) => {
    const cleaned = newHandle.trim().replace(/^@/, "");
    if (cleaned) {
      localStorage.setItem(HANDLE_STORAGE_KEY, cleaned);
      setHandle(cleaned);
      setIsEditing(false);
    }
  }, []);

  // Load data when handle changes
  const loadMirrorData = useCallback(async () => {
    if (!handle) return;

    try {
      const bookmarks = await fetchSelfBookmarks(handle);

      setSelfBookmarks(bookmarks);
      setError(null);

      // Get categories of self-bookmarks to find overlaps with other authors' bookmarks
      const selfCats = new Set<string>();
      for (const b of bookmarks) {
        if (b.primary_category) selfCats.add(b.primary_category);
        if (b.categories) {
          for (const cat of b.categories.split(",")) {
            const trimmed = cat.trim();
            if (trimmed) selfCats.add(trimmed);
          }
        }
      }

      // For cross-reference: fetch other authors' bookmarks in tool/technique categories
      // that overlap with user's own post categories
      const overlappingCats = ["tool", "technique"];
      const otherCatCounts = new Map<string, number>();

      for (const cat of overlappingCats) {
        if (selfCats.has(cat)) {
          try {
            const result = await fetchSearch({ category: cat, limit: 1 });
            // The total tells us how many bookmarks are in this category overall
            otherCatCounts.set(cat, result.total);
          } catch {
            // ignore cross-reference errors
          }
        }
      }

      setOtherCategories(otherCatCounts);
    } catch {
      setError("Failed to load data. Is the server running?");
    }
  }, [handle]);

  useEffect(() => {
    void loadMirrorData();
  }, [loadMirrorData]);

  // Compute topic breakdown from self-bookmarks using split categories (matches People profile)
  const topicBreakdown = useMemo((): CategoryCount[] => {
    const counts = new Map<string, number>();
    for (const b of selfBookmarks) {
      if (b.categories) {
        for (const cat of b.categories.split(",")) {
          const trimmed = cat.trim();
          if (trimmed) {
            counts.set(trimmed, (counts.get(trimmed) || 0) + 1);
          }
        }
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [selfBookmarks]);

  // Compute domain breakdown from self-bookmarks using split domains (matches People profile)
  const domainBreakdown = useMemo((): CategoryCount[] => {
    const counts = new Map<string, number>();
    for (const b of selfBookmarks) {
      if (b.domains) {
        for (const dom of b.domains.split(",")) {
          const trimmed = dom.trim();
          if (trimmed) {
            counts.set(trimmed, (counts.get(trimmed) || 0) + 1);
          }
        }
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [selfBookmarks]);

  // Compute timeline buckets from self-bookmarks by month
  const timelineBuckets = useMemo((): TimelineEntry[] => {
    const buckets = new Map<string, number>();
    for (const b of selfBookmarks) {
      const date = parseTwitterDate(b.posted_at);
      if (date) {
        const month = date.toISOString().slice(0, 7); // YYYY-MM
        buckets.set(month, (buckets.get(month) || 0) + 1);
      }
    }
    return Array.from(buckets.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [selfBookmarks]);

  // Compute top posts by engagement (like_count + repost_count)
  const topPosts = useMemo((): Bookmark[] => {
    return [...selfBookmarks]
      .sort((a, b) => {
        const engA = (a.like_count || 0) + (a.repost_count || 0);
        const engB = (b.like_count || 0) + (b.repost_count || 0);
        return engB - engA;
      })
      .slice(0, 10);
  }, [selfBookmarks]);

  // Compute cross-reference overlaps
  const crossReferenceOverlaps = useMemo((): OverlapItem[] => {
    // Categories the user posted about (using split categories to match People profile)
    const selfCatCounts = new Map<string, number>();
    for (const b of selfBookmarks) {
      if (b.categories) {
        for (const cat of b.categories.split(",")) {
          const trimmed = cat.trim();
          if (trimmed) {
            selfCatCounts.set(trimmed, (selfCatCounts.get(trimmed) || 0) + 1);
          }
        }
      }
    }

    const overlaps: OverlapItem[] = [];
    for (const [cat, othersCount] of otherCategories) {
      const selfCount = selfCatCounts.get(cat) || 0;
      if (selfCount > 0 && othersCount > 0) {
        overlaps.push({
          topic: cat,
          selfCount,
          othersCount,
        });
      }
    }

    return overlaps.sort((a, b) => b.selfCount - a.selfCount);
  }, [selfBookmarks, otherCategories]);

  // If no handle configured, show the first-run prompt
  if (!handle && !isEditing) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-foreground">Mirror</h1>
        <p className="mt-1 text-sm text-muted">
          Self-analysis — your own bookmark patterns.
        </p>
        <HandlePrompt onSave={saveHandle} />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mirror</h1>
          <p className="mt-1 text-sm text-muted">
            Self-analysis — your own bookmark patterns.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isEditing ? (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="your handle"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveHandle(editValue);
                  if (e.key === "Escape") setIsEditing(false);
                }}
                className="rounded-button border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-disabled focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-ring"
                autoFocus
              />
              <button
                type="button"
                onClick={() => saveHandle(editValue)}
                className="min-h-[44px] rounded-button bg-foreground px-3 py-2 text-sm font-semibold text-background"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="min-h-[44px] rounded-button border border-border bg-card px-3 py-2 text-sm text-muted"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditValue(handle || "");
                setIsEditing(true);
              }}
              className="flex min-h-[44px] items-center gap-2 rounded-button border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors hover:border-[#333] active:bg-card/80"
            >
              <span>@{handle}</span>
              <Edit3 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <ErrorRetry message={error} onRetry={() => { setError(null); void loadMirrorData(); }} />
      )}

      {/* Summary Stats Row */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-card border border-border bg-card px-5 py-4">
          <span className="text-sm text-muted">Self-Bookmarks</span>
          <span className="font-mono text-2xl font-bold text-foreground">
            {selfBookmarks.length}
          </span>
          <span className="text-xs text-disabled">posts by @{handle}</span>
        </div>
        <div className="flex flex-col gap-1 rounded-card border border-border bg-card px-5 py-4">
          <span className="text-sm text-muted">Categories</span>
          <span className="font-mono text-2xl font-bold text-foreground">
            {topicBreakdown.length}
          </span>
          <span className="text-xs text-disabled">distinct topics</span>
        </div>
        <div className="flex flex-col gap-1 rounded-card border border-border bg-card px-5 py-4">
          <span className="text-sm text-muted">Domains</span>
          <span className="font-mono text-2xl font-bold text-foreground">
            {domainBreakdown.length}
          </span>
          <span className="text-xs text-disabled">knowledge areas</span>
        </div>
        <div className="flex flex-col gap-1 rounded-card border border-border bg-card px-5 py-4">
          <span className="text-sm text-muted">Top Engagement</span>
          <span className="font-mono text-2xl font-bold text-foreground">
            {topPosts.length > 0
              ? formatNumber((topPosts[0]!.like_count || 0) + (topPosts[0]!.repost_count || 0))
              : "0"}
          </span>
          <span className="text-xs text-disabled">likes + reposts</span>
        </div>
      </div>

      {/* Self-Bookmark Timeline */}
      <div className="mb-8 rounded-card border border-border bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-muted" />
          <h2 className="text-lg font-semibold text-foreground">
            Self-Bookmark Timeline
          </h2>
        </div>
        <div className="h-48">
          {timelineBuckets.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineBuckets}>
                <defs>
                  <linearGradient id="mirrorTimelineGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#71717a", fontSize: 14 }}
                  tickLine={false}
                  axisLine={{ stroke: "#1c1c1e" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "#71717a", fontSize: 14 }}
                  tickLine={false}
                  axisLine={{ stroke: "#1c1c1e" }}
                  width={40}
                />
                <Tooltip content={<TimelineTooltip />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#a855f7"
                  strokeWidth={2}
                  fill="url(#mirrorTimelineGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-sm text-disabled">Loading timeline data…</span>
            </div>
          )}
        </div>
      </div>

      {/* Topic Breakdown + Domain Breakdown */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Category Breakdown */}
        <div className="rounded-card border border-border bg-card p-5">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Topic Breakdown
          </h2>
          {topicBreakdown.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topicBreakdown.slice(0, 10)} layout="vertical">
                  <defs>
                    <linearGradient id="mirrorCategoryGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#818cf8" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#71717a", fontSize: 14 }} axisLine={{ stroke: "#1c1c1e" }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "#ffffff", fontSize: 14 }}
                    axisLine={{ stroke: "#1c1c1e" }}
                    width={100}
                  />
                  <Tooltip content={<BarChartTooltip />} />
                  <Bar dataKey="count" fill="url(#mirrorCategoryGradient)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center">
              <span className="text-sm text-disabled">Loading topics…</span>
            </div>
          )}
        </div>

        {/* Domain Breakdown */}
        <div className="rounded-card border border-border bg-card p-5">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Domain Breakdown
          </h2>
          {domainBreakdown.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={domainBreakdown.slice(0, 10)} layout="vertical">
                  <defs>
                    <linearGradient id="mirrorDomainGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#818cf8" />
                      <stop offset="100%" stopColor="#a5b4fc" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#71717a", fontSize: 14 }} axisLine={{ stroke: "#1c1c1e" }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "#ffffff", fontSize: 14 }}
                    axisLine={{ stroke: "#1c1c1e" }}
                    width={100}
                  />
                  <Tooltip content={<BarChartTooltip />} />
                  <Bar dataKey="count" fill="url(#mirrorDomainGradient)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center">
              <span className="text-sm text-disabled">Loading domains…</span>
            </div>
          )}
        </div>
      </div>

      {/* Most-Bookmarked Own Posts */}
      <div className="mb-8 rounded-card border border-border bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Top Posts by Engagement
        </h2>
        {topPosts.length > 0 ? (
          <div className="flex flex-col gap-3">
            {topPosts.map((post) => {
              const engagement = (post.like_count || 0) + (post.repost_count || 0);
              return (
                <a
                  key={post.id}
                  href={tweetUrl(handle!, post.tweet_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="top-post-item"
                  className="flex items-start gap-4 rounded-button border border-border bg-background p-4 transition-colors hover:border-[#333]"
                >
                  <div className="flex flex-col items-center gap-1 shrink-0 w-16">
                    <span className="font-mono text-lg font-bold text-foreground">
                      {formatNumber(engagement)}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-disabled">
                      <span className="flex items-center gap-0.5">
                        <Heart className="h-3 w-3" />
                        {post.like_count}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Repeat2 className="h-3 w-3" />
                        {post.repost_count}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground leading-relaxed">
                      {formatTweetText(post.text, { maxLength: 200 })}
                    </p>
                    <div className="mt-2 flex gap-2">
                      {post.primary_category && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/stream?category=${encodeURIComponent(post.primary_category)}`); }}
                          className="rounded-badge bg-surface px-2 py-0.5 text-xs text-foreground hover:bg-[#252528] transition-colors"
                        >
                          {post.primary_category}
                        </button>
                      )}
                      {post.primary_domain && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(`/stream?domain=${encodeURIComponent(post.primary_domain)}`); }}
                          className="rounded-badge border border-border bg-card px-2 py-0.5 text-xs text-muted hover:border-[#333] hover:text-foreground transition-colors"
                        >
                          {post.primary_domain}
                        </button>
                      )}
                    </div>
                  </div>
                  <span
                    className="shrink-0 min-h-[44px] hidden lg:inline-flex items-center rounded-button border border-border bg-card px-3 py-2 text-xs text-muted transition-colors hover:border-[#333] hover:text-foreground active:bg-card/80"
                  >
                    Open in X
                  </span>
                </a>
              );
            })}
          </div>
        ) : (
          <div className="flex h-24 items-center justify-center">
            <span className="text-sm text-disabled">Loading top posts…</span>
          </div>
        )}
      </div>

      {/* Cross-Reference Section */}
      <div className="mb-8 rounded-card border border-border bg-card p-5" data-testid="cross-reference-section">
        <div className="mb-4 flex items-center gap-2">
          <Layers className="h-5 w-5 text-muted" />
          <h2 className="text-lg font-semibold text-foreground">
            Cross-Reference
          </h2>
        </div>
        <p className="mb-4 text-sm text-muted">
          Topics you posted about that overlap with tools/techniques you later bookmarked from other authors.
        </p>
        {crossReferenceOverlaps.length > 0 ? (
          <div className="flex flex-col gap-3">
            {crossReferenceOverlaps.map((overlap) => (
              <div
                key={overlap.topic}
                data-testid="overlap-item"
                className="flex items-center justify-between rounded-button border border-border bg-background p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-badge bg-surface px-3 py-1 text-sm font-semibold text-foreground">
                    {overlap.topic}
                  </span>
                  <span className="text-sm text-muted">
                    You posted about this topic
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted">
                    <span className="font-mono text-foreground">{overlap.selfCount}</span> own posts
                  </span>
                  <span className="text-disabled">|</span>
                  <span className="text-muted">
                    <span className="font-mono text-foreground">{formatNumber(overlap.othersCount)}</span> total in category
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : selfBookmarks.length > 0 ? (
          <div className="flex h-20 items-center justify-center">
            <span className="text-sm text-disabled">No overlaps found between your posts and bookmarked tools/techniques.</span>
          </div>
        ) : (
          <div className="flex h-20 items-center justify-center">
            <span className="text-sm text-disabled">Loading cross-reference data…</span>
          </div>
        )}
      </div>
    </div>
  );
}
