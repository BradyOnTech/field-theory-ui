import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  ExternalLink,
  Heart,
  Repeat2,
  Users,
  BarChart3,
  Globe,
  TrendingUp,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { fetchAuthor } from "@/lib/api";
import type { AuthorProfile } from "@/lib/types";
import { formatNumber, parseTwitterDate, tweetUrl, buildSearchSnippet, formatDate } from "@/lib/utils";
import { formatTweetText } from "@/lib/tweet-text";
import { AvatarImage } from "@/components/avatar-image";
import { Skeleton } from "@/components/skeleton";
import { SparklineTooltip } from "@/components/sparkline-tooltip";
import { HorizontalBarRow } from "@/components/horizontal-bar-row";





export function AuthorProfileView() {
  const { handle } = useParams<{ handle: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AuthorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!handle) return;

    setLoading(true);
    setError(null);

    void fetchAuthor(handle)
      .then((data) => {
        setProfile(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load profile");
        setLoading(false);
      });
  }, [handle]);

  const handleBack = () => {
    navigate(-1);
  };

  if (loading) {
    return (
      <div className="p-6">
        <button
          type="button"
          onClick={handleBack}
          className="mb-6 flex min-h-[44px] items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to People
        </button>

        {/* Author Header Skeleton */}
        <div className="mb-8 flex items-center gap-5 rounded-card border border-border bg-card p-6">
          <Skeleton className="h-20 w-20 shrink-0 rounded-full" />
          <div className="flex flex-col gap-1">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
            <div className="mt-1 flex items-center gap-4">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="ml-2 h-[44px] w-28 rounded-button" />
            </div>
            <div className="mt-2 flex items-center gap-4">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
        </div>

        {/* Content grid skeleton */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Activity Sparkline Skeleton */}
          <div className="col-span-1 rounded-card border border-border bg-card p-5 lg:col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-[200px] w-full" />
          </div>

          {/* Category Breakdown Skeleton */}
          <div className="rounded-card border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-28 shrink-0" />
                  <Skeleton className="h-5 flex-1" />
                  <Skeleton className="h-3 w-10 shrink-0" />
                </div>
              ))}
            </div>
          </div>

          {/* Domain Breakdown Skeleton */}
          <div className="rounded-card border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="flex flex-col gap-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-28 shrink-0" />
                  <Skeleton className="h-5 flex-1" />
                  <Skeleton className="h-3 w-10 shrink-0" />
                </div>
              ))}
            </div>
          </div>

          {/* Top Posts Skeleton */}
          <div className="col-span-1 rounded-card border border-border bg-card p-5 lg:col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="flex flex-col divide-y divide-border">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-start gap-4 py-3">
                  <div className="flex-1">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="mt-1 h-4 w-3/4" />
                    <div className="mt-1 flex items-center gap-3">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Connected Authors Skeleton */}
          <div className="col-span-1 rounded-card border border-border bg-card p-5 lg:col-span-2">
            <div className="mb-4 flex items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-36" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center gap-2 rounded-card border border-border bg-background p-3"
                >
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-5 w-16 rounded-badge" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="p-6">
        <button
          type="button"
          onClick={handleBack}
          className="mb-4 flex min-h-[44px] items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to People
        </button>
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-lg font-semibold text-foreground">Author not found</p>
          <p className="mt-2 text-sm text-muted">
            {error || `No profile data for @${handle}`}
          </p>
        </div>
      </div>
    );
  }

  const maxCategoryCount = profile.categories[0]?.count ?? 0;
  const maxDomainCount = profile.domains[0]?.count ?? 0;

  return (
    <div className="p-6">
      {/* Back navigation */}
      <button
        type="button"
        data-testid="back-button"
        onClick={handleBack}
        className="mb-6 flex min-h-[44px] items-center gap-2 text-sm text-muted transition-colors hover:text-foreground active:text-accent/80"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to People
      </button>

      {/* Author Header */}
      <div
        data-testid="author-header"
        className="mb-8 flex items-center gap-5 rounded-card border border-border bg-card p-6"
      >
        <AvatarImage
          src={profile.author_profile_image_url}
          name={profile.author_name || profile.author_handle}
          className="h-20 w-20"
        />
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-foreground">
            {profile.author_name || profile.author_handle}
          </h1>
          <span className="text-sm text-foreground">@{profile.author_handle}</span>
          <div className="mt-1 flex items-center gap-4">
            <span className="font-mono text-lg font-bold text-foreground">
              {formatNumber(profile.bookmarkCount)}
            </span>
            <span className="text-sm text-muted">bookmarks</span>
            <Link
              to={`/stream?author=${encodeURIComponent(profile.author_handle)}`}
              className="ml-2 min-h-[44px] inline-flex items-center rounded-button border border-border px-3 py-1.5 text-xs text-muted hover:border-[#333] hover:text-foreground transition-colors"
            >
              View in Stream →
            </Link>
          </div>
          {/* First/Last bookmark dates */}
          <div
            data-testid="bookmark-dates"
            className="mt-2 flex items-center gap-4 text-xs text-muted"
          >
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>First: {formatDate(profile.firstBookmark)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>Last: {formatDate(profile.lastBookmark)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Activity Sparkline */}
        <div
          data-testid="activity-sparkline"
          className="col-span-1 rounded-card border border-border bg-card p-5 lg:col-span-2"
        >
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted" />
            <h2 className="text-sm font-semibold text-foreground">
              Bookmark Activity
            </h2>
          </div>
          {profile.timeline.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={profile.timeline}>
                <defs>
                  <linearGradient id="sparklineGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 14, fill: "#71717a" }}
                  tickLine={false}
                  axisLine={{ stroke: "#1c1c1e" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 14, fill: "#71717a" }}
                  tickLine={false}
                  axisLine={false}
                  width={30}
                />
                <Tooltip content={<SparklineTooltip />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#a855f7"
                  strokeWidth={2}
                  fill="url(#sparklineGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-muted">
              No activity data available
            </p>
          )}
        </div>

        {/* Category Breakdown */}
        <div
          data-testid="category-breakdown"
          className="rounded-card border border-border bg-card p-5"
        >
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted" />
            <h2 className="text-sm font-semibold text-foreground">Categories</h2>
          </div>
          {profile.categories.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {profile.categories.slice(0, 10).map((cat) => (
                <HorizontalBarRow
                  key={cat.name}
                  label={cat.name}
                  value={cat.count}
                  maxValue={maxCategoryCount}
                  gradient="linear-gradient(90deg, #6366f1, #818cf8)"
                  variant="profile"
                  onClick={() => navigate(`/stream?category=${encodeURIComponent(cat.name)}`)}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted">No categories</p>
          )}
        </div>

        {/* Domain Breakdown */}
        <div
          data-testid="domain-breakdown"
          className="rounded-card border border-border bg-card p-5"
        >
          <div className="mb-4 flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted" />
            <h2 className="text-sm font-semibold text-foreground">Domains</h2>
          </div>
          {profile.domains.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {profile.domains.slice(0, 10).map((dom) => (
                <HorizontalBarRow
                  key={dom.name}
                  label={dom.name}
                  value={dom.count}
                  maxValue={maxDomainCount}
                  gradient="linear-gradient(90deg, #818cf8, #a5b4fc)"
                  variant="profile"
                  onClick={() => navigate(`/stream?domain=${encodeURIComponent(dom.name)}`)}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted">No domains</p>
          )}
        </div>

        {/* Top Posts */}
        <div
          data-testid="top-posts"
          className="col-span-1 rounded-card border border-border bg-card p-5 lg:col-span-2"
        >
          <div className="mb-4 flex items-center gap-2">
            <Heart className="h-4 w-4 text-muted" />
            <h2 className="text-sm font-semibold text-foreground">
              Top Posts by Engagement
            </h2>
          </div>
          {profile.topPosts.length > 0 ? (
            <div className="flex flex-col divide-y divide-border">
              {profile.topPosts.map((post) => {
                const engagement = post.like_count + post.repost_count;
                const postedDate = parseTwitterDate(post.posted_at);
                const dateStr = postedDate
                  ? postedDate.toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : "";
                const xUrl = post.tweet_id && post.author_handle
                  ? tweetUrl(post.author_handle, post.tweet_id)
                  : null;
                // Build a stream search query from the first few words of the post
                const searchWords = buildSearchSnippet(post.text);
                const streamUrl = `/stream?q=${encodeURIComponent(searchWords)}`;
                return (
                  <div
                    key={post.id}
                    data-testid="top-post-item"
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <Link
                        to={streamUrl}
                        data-testid="top-post-link"
                        className="block text-sm text-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        {formatTweetText(post.text, { maxLength: 200 })}
                      </Link>
                      <div className="mt-1 flex items-center gap-3">
                        {dateStr && (
                          <span className="text-xs text-disabled">{dateStr}</span>
                        )}
                        <Link
                          to={streamUrl}
                          className="inline-flex min-h-[44px] items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
                        >
                          View in Stream →
                        </Link>
                        {xUrl && (
                          <a
                            href={xUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[44px] items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
                          >
                            Open in X <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted sm:shrink-0">
                      <span className="flex items-center gap-1" title="Likes">
                        <Heart className="h-3 w-3" />
                        <span className="font-mono">
                          {formatNumber(post.like_count)}
                        </span>
                      </span>
                      <span className="flex items-center gap-1" title="Reposts">
                        <Repeat2 className="h-3 w-3" />
                        <span className="font-mono">
                          {formatNumber(post.repost_count)}
                        </span>
                      </span>
                      <span
                        className="font-mono font-bold text-foreground"
                        title="Total engagement"
                      >
                        {formatNumber(engagement)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted">No posts found</p>
          )}
        </div>

        {/* Connected Authors */}
        <div
          data-testid="connected-authors"
          className="col-span-1 rounded-card border border-border bg-card p-5 lg:col-span-2"
        >
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-muted" />
            <h2 className="text-sm font-semibold text-foreground">
              Connected Authors
            </h2>
            <span className="text-xs text-disabled">
              Authors frequently bookmarked on the same days
            </span>
          </div>
          {profile.connectedAuthors.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {profile.connectedAuthors.map((ca) => (
                <Link
                  key={ca.author_handle}
                  to={`/people/${encodeURIComponent(ca.author_handle)}`}
                  data-testid="connected-author"
                  className="flex min-h-[44px] flex-col items-center gap-2 rounded-card border border-border bg-background p-3 transition-colors hover:border-[#333] active:bg-card"
                >
                  <span className="text-sm font-semibold text-foreground truncate w-full text-center">
                    @{ca.author_handle}
                  </span>
                  {ca.author_name && ca.author_name !== ca.author_handle && (
                    <span className="text-xs text-muted truncate w-full text-center">
                      {ca.author_name}
                    </span>
                  )}
                  <span className="rounded-badge bg-surface px-2 py-0.5 font-mono text-xs text-foreground">
                    {ca.co_occurrence_count} days
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-muted">
              No connected authors found
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
