import { useEffect, useState, useCallback, useRef } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useNavigate } from "react-router-dom";
import {
  fetchStats,
  fetchTimeline,
  fetchCategories,
  fetchDomains,
  fetchRecent,
} from "@/lib/api";
import type {
  Stats,
  TimelineEntry,
  CategoryCount,
  DomainCount,
  Bookmark,
} from "@/lib/types";
import { Heart, Repeat2, Bookmark as BookmarkIcon, Info, RefreshCw } from "lucide-react";
import { formatNumber, parseTwitterDate, timeAgo, tweetUrl } from "@/lib/utils";
import { formatTweetText } from "@/lib/tweet-text";
import { AvatarImage } from "@/components/avatar-image";
import { Skeleton } from "@/components/skeleton";
import { SparklineTooltip } from "@/components/sparkline-tooltip";
import { HorizontalBarRow } from "@/components/horizontal-bar-row";
import { ErrorRetry } from "@/components/error-retry";
import { SyncDialog } from "@/components/sync-dialog";

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

interface KpiData {
  label: string;
  value: string;
  subLabel: string;
  tooltip?: string;
  hideOnMobile?: boolean;
}

function computeKpis(
  stats: Stats | null,
  categories: CategoryCount[],
  domains: DomainCount[],
): KpiData[] {
  if (!stats) return [];

  const total = stats.totalBookmarks;

  // Top Domain Focus: percentage of bookmarks in the most common domain
  const topDomain = [...domains].sort((a, b) => b.count - a.count)[0];
  const topDomainCount = topDomain ? topDomain.count : 0;
  const topDomainName = topDomain ? (topDomain.name.length <= 3 ? topDomain.name.toUpperCase() : topDomain.name.charAt(0).toUpperCase() + topDomain.name.slice(1)) : "N/A";
  const topDomainFocus = total > 0 ? Math.round((topDomainCount / total) * 100) : 0;

  // Builder Ratio: percentage of bookmarks with category in technique + tool
  const techniqueCount = categories.find((c) => c.name === "technique")?.count ?? 0;
  const toolCount = categories.find((c) => c.name === "tool")?.count ?? 0;
  const builderRatio = total > 0 ? Math.round(((techniqueCount + toolCount) / total) * 100) : 0;

  // Classification Coverage: classifiedCount / totalBookmarks
  const coverage = total > 0 ? Math.floor((stats.classifiedCount / total) * 100) : 0;

  return [
    {
      label: "Total Bookmarks",
      value: formatNumber(total),
      subLabel: `${formatNumber(stats.thisWeekCount)} this week`,
    },
    {
      label: "Unique Authors",
      value: formatNumber(stats.uniqueAuthors),
      subLabel: "distinct voices",
    },
    {
      label: `${topDomainName} Focus %`,
      value: `${topDomainFocus}%`,
      subLabel: `${formatNumber(topDomainCount)} ${topDomain?.name ?? ""} bookmarks`,
    },
    {
      label: "Builder Ratio",
      value: `${builderRatio}%`,
      subLabel: "technique + tool",
      hideOnMobile: true,
    },
    {
      label: "Classification",
      value: `${coverage}%`,
      subLabel: `${formatNumber(stats.classifiedCount)} classified`,
      tooltip: coverage < 100 ? "Some bookmarks are marked 'unclassified' by the CLI when they lack enough context to categorize (e.g., bare links)." : undefined,
    },
  ];
}

function KpiCard({ label, value, subLabel, tooltip, hideOnMobile }: KpiData) {
  const [showTip, setShowTip] = useState(false);
  const iconRef = useRef<HTMLSpanElement>(null);

  return (
    <div
      data-testid="kpi-card"
      className={`flex flex-col gap-1 rounded-card border border-border bg-card px-5 py-4${hideOnMobile ? " hidden lg:flex" : ""}`}
    >
      <span className="text-sm text-muted">{label}</span>
      <span className="font-mono text-2xl font-bold text-foreground">{value}</span>
      <span className="flex items-center gap-1.5 text-xs text-disabled">
        {subLabel}
        {tooltip && (
          <span
            ref={iconRef}
            onMouseEnter={() => setShowTip(true)}
            onMouseLeave={() => setShowTip(false)}
            className="cursor-help text-disabled transition-colors hover:text-muted"
          >
            <Info className="h-3 w-3" />
          </span>
        )}
      </span>
      {showTip && iconRef.current && (() => {
        const rect = iconRef.current.getBoundingClientRect();
        const tipWidth = 224;
        let left = rect.left + rect.width / 2 - tipWidth / 2;
        if (left + tipWidth > window.innerWidth - 8) left = window.innerWidth - tipWidth - 8;
        if (left < 8) left = 8;
        return (
          <div
            className="pointer-events-none fixed z-50 w-56 rounded-card border border-border bg-card p-3 text-xs leading-relaxed text-muted shadow-lg"
            style={{
              left,
              top: rect.top - 8,
              transform: "translateY(-100%)",
            }}
          >
            {tooltip}
          </div>
        );
      })()}
    </div>
  );
}





export function ObservatoryView() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [domains, setDomains] = useState<DomainCount[]>([]);
  const [recent, setRecent] = useState<Bookmark[]>([]);
  const [lastSynced, setLastSynced] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSyncOpen, setIsSyncOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [statsData, timelineData, categoriesData, domainsData, recentData] =
        await Promise.all([
          fetchStats(),
          fetchTimeline(90),
          fetchCategories(),
          fetchDomains(),
          fetchRecent(5),
        ]);

      if (statsData) setStats(statsData);
      setTimeline(timelineData);
      setCategories(categoriesData);
      setDomains(domainsData);
      setRecent(recentData);
      setError(null);
      // Use the synced_at from the most recent bookmark
      const syncedAt = recentData[0]?.synced_at;
      if (syncedAt) setLastSynced(syncedAt);
    } catch {
      setError("Failed to load data. Is the server running?");
    }
  }, []);

  useEffect(() => {
    void loadData();
    const interval = setInterval(() => {
      void loadData();
    }, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  const kpis = computeKpis(stats, categories, domains);
  const topCategories = categories.slice(0, 7);
  const topDomains = domains.slice(0, 7);
  const maxCategoryCount = topCategories[0]?.count ?? 0;
  const maxDomainCount = topDomains[0]?.count ?? 0;

  const handleCategoryClick = (name: string) => {
    navigate(`/stream?category=${encodeURIComponent(name)}`);
  };

  const handleDomainClick = (name: string) => {
    navigate(`/stream?domain=${encodeURIComponent(name)}`);
  };

  return (
    <div className="p-6">
      {/* Header with Last Synced */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Observatory</h1>
          <p className="mt-1 text-sm text-muted">
            Bookmark intelligence at a glance
          </p>
        </div>
        {lastSynced && (
          <>
            <span className="hidden text-xs text-disabled lg:inline">
              Last synced: {new Date(lastSynced).toLocaleString()}
            </span>
            <button
              type="button"
              onClick={() => setIsSyncOpen(true)}
              className="flex items-center gap-1.5 rounded-button border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-[#333] hover:text-foreground lg:hidden"
            >
              <RefreshCw className="h-3 w-3" />
              Sync
              <span className="text-disabled">· {timeAgo(new Date(lastSynced))}</span>
            </button>
          </>
        )}
      </div>

      {/* Error State */}
      {error && (
        <ErrorRetry message={error} onRetry={() => { setError(null); void loadData(); }} />
      )}

      {/* Hero Metrics Row — always render container, show placeholders until data arrives */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {kpis.length > 0
          ? kpis.map((kpi) => (
              <KpiCard key={kpi.label} {...kpi} />
            ))
          : Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                data-testid="kpi-card"
                className="flex flex-col gap-3 rounded-card border border-border bg-card px-5 py-4"
              >
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
      </div>

      {/* Activity Sparkline — always render container */}
      <div className="mb-8 rounded-card border border-border bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Activity (90 days)
        </h2>
        <div className="h-48">
          {timeline.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline}>
                <defs>
                  <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#71717a", fontSize: 14 }}
                  tickLine={false}
                  axisLine={{ stroke: "#1c1c1e" }}
                  tickFormatter={(value: string) => {
                    const parts = value.split("-");
                    return `${parts[1]}/${parts[2]}`;
                  }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "#71717a", fontSize: 14 }}
                  tickLine={false}
                  axisLine={{ stroke: "#1c1c1e" }}
                  width={40}
                />
                <Tooltip content={<SparklineTooltip variant="observatory" />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#a855f7"
                  strokeWidth={2}
                  fill="url(#sparklineGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <Skeleton className="h-full w-full" />
          )}
        </div>
      </div>

      {/* Category + Domain Distribution — always render containers */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Category Distribution */}
        <div className="rounded-card border border-border bg-card p-5">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Top Categories
          </h2>
          {topCategories.length > 0 ? (
            <div className="flex flex-col gap-2">
              {topCategories.map((item) => (
                <HorizontalBarRow
                  key={item.name}
                  label={item.name}
                  value={item.count}
                  maxValue={maxCategoryCount}
                  onClick={() => handleCategoryClick(item.name)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 flex-1" />
                  <Skeleton className="h-5 w-12" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Domain Distribution */}
        <div className="rounded-card border border-border bg-card p-5">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Top Domains
          </h2>
          {topDomains.length > 0 ? (
            <div className="flex flex-col gap-2">
              {topDomains.map((item) => (
                <HorizontalBarRow
                  key={item.name}
                  label={item.name}
                  value={item.count}
                  maxValue={maxDomainCount}
                  onClick={() => handleDomainClick(item.name)}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 flex-1" />
                  <Skeleton className="h-5 w-12" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Bookmarks Feed — always render container */}
      <div className="rounded-card border border-border bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Recent Bookmarks
        </h2>
        {recent.length > 0 ? (
          <div className="flex flex-col gap-4">
            {recent.map((bookmark) => {
              const date = parseTwitterDate(bookmark.posted_at);
              const relativeTime = date ? timeAgo(date) : "";
              return (
                <a
                  key={bookmark.id}
                  href={tweetUrl(bookmark.author_handle, bookmark.tweet_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-3 border-b border-border pb-4 last:border-0 last:pb-0 transition-colors hover:bg-[#0d0d0d] rounded-button -mx-2 px-2 pt-2"
                >
                  <AvatarImage
                    src={bookmark.author_profile_image_url}
                    name={bookmark.author_name}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          navigate(`/people/${encodeURIComponent(bookmark.author_handle)}`);
                        }}
                        className="min-h-[44px] text-sm font-semibold text-foreground hover:underline active:opacity-70"
                      >
                        @{bookmark.author_handle}
                      </button>
                      <span className="text-xs text-disabled">{relativeTime}</span>
                    </div>
                    <p className="mt-1 text-sm text-foreground leading-relaxed">
                      {formatTweetText(bookmark.text, { maxLength: 200 })}
                    </p>
                    <div className="mt-2 flex gap-2">
                      {bookmark.primary_category && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/stream?category=${encodeURIComponent(bookmark.primary_category)}`);
                          }}
                          className="rounded-badge bg-surface px-2 py-0.5 text-xs text-foreground hover:bg-[#252528] transition-colors"
                        >
                          {bookmark.primary_category}
                        </button>
                      )}
                      {bookmark.primary_domain && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/stream?domain=${encodeURIComponent(bookmark.primary_domain)}`);
                          }}
                          className="rounded-badge bg-card border border-border px-2 py-0.5 text-xs text-muted hover:border-[#333] hover:text-foreground transition-colors"
                        >
                          {bookmark.primary_domain}
                        </button>
                      )}
                    </div>
                    {/* Engagement stats */}
                    <div className="mt-3 flex items-center gap-4">
                      <span className="flex items-center gap-1 text-xs text-muted" title="Likes">
                        <Heart className="h-3.5 w-3.5" />
                        <span className="font-mono">{formatNumber(bookmark.like_count)}</span>
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted" title="Reposts">
                        <Repeat2 className="h-3.5 w-3.5" />
                        <span className="font-mono">{formatNumber(bookmark.repost_count)}</span>
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted" title="Bookmarks">
                        <BookmarkIcon className="h-3.5 w-3.5" />
                        <span className="font-mono">{formatNumber(bookmark.bookmark_count)}</span>
                      </span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3 border-b border-border pb-4 last:border-0 last:pb-0">
                <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex gap-2">
                    <Skeleton className="h-5 w-16 rounded-badge" />
                    <Skeleton className="h-5 w-16 rounded-badge" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isSyncOpen && (
        <SyncDialog onClose={() => setIsSyncOpen(false)} />
      )}
    </div>
  );
}
