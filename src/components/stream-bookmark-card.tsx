import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Repeat2, Bookmark, Image, ExternalLink, X, FolderPlus } from "lucide-react";
import type { Bookmark as BookmarkType, CollectionMembership, QuotedTweetSnapshot } from "@/lib/types";
import { parseTwitterDate, timeAgo, formatNumber, tweetUrl } from "@/lib/utils";
import { formatTweetText } from "@/lib/tweet-text";
import { AvatarImage } from "@/components/avatar-image";
import { CollectionPicker } from "@/components/collection-picker";
import { fetchBookmark } from "@/lib/api";

interface LinkItem {
  url: string;
  display?: string;
  title?: string;
}

function parseLinksJson(linksJson: string): LinkItem[] {
  if (!linksJson) return [];
  try {
    const parsed: unknown = JSON.parse(linksJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: unknown): LinkItem | null => {
        if (typeof item === "string" && item.length > 0) {
          return { url: item };
        }
        if (item && typeof item === "object" && "url" in item && typeof (item as LinkItem).url === "string") {
          return item as LinkItem;
        }
        return null;
      })
      .filter((l): l is LinkItem => l !== null);
  } catch {
    return [];
  }
}

function parseQuotedTweet(json: string): QuotedTweetSnapshot | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as QuotedTweetSnapshot;
  } catch {
    return null;
  }
}

function EngagementStat({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted" title={label}>
      <Icon className="h-3.5 w-3.5" />
      <span className="font-mono">{formatNumber(value)}</span>
    </span>
  );
}

export function BookmarkCard({
  bookmark,
  isExpanded,
  isSelected,
  expandedRef,
  onToggle,
}: {
  bookmark: BookmarkType;
  isExpanded: boolean;
  isSelected?: boolean;
  expandedRef?: React.RefObject<HTMLDivElement | null>;
  onToggle: () => void;
}) {
  const [memberships, setMemberships] = useState<CollectionMembership[]>(
    bookmark.collections ?? [],
  );
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const bookmarkIdStr = String(bookmark.id);

  // Lazy-load memberships the first time the card is expanded. Cached by api-cache
  // so repeat expansions don't refetch.
  useEffect(() => {
    if (!isExpanded) return;
    if (bookmark.collections) return;
    let cancelled = false;
    void fetchBookmark(bookmarkIdStr)
      .then((detail) => {
        if (cancelled) return;
        if (detail.collections) setMemberships(detail.collections);
      })
      .catch(() => {
        /* non-fatal; picker still works */
      });
    return () => {
      cancelled = true;
    };
  }, [isExpanded, bookmark.collections, bookmarkIdStr]);

  const date = parseTwitterDate(bookmark.posted_at);
  const relativeTime = date ? timeAgo(date) : "";
  const formattedDate = date
    ? date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";
  const bookmarkedDate = bookmark.bookmarked_at ? new Date(bookmark.bookmarked_at) : null;
  const bookmarkedTime = bookmarkedDate && !isNaN(bookmarkedDate.getTime()) ? timeAgo(bookmarkedDate) : "";
  const links = parseLinksJson(bookmark.links_json);
  const quotedTweet = parseQuotedTweet(bookmark.quoted_tweet_json);
  const openInXUrl = tweetUrl(bookmark.author_handle, bookmark.tweet_id);

  return (
    <div
      ref={expandedRef}
      data-testid="bookmark-card"
      {...(isExpanded ? { "data-expanded-card": "true" } : {})}
      className={`rounded-card border bg-card p-5 transition-all cursor-pointer hover:border-[#333] ${
        isSelected
          ? "border-foreground/30 bg-foreground/5 ring-2 ring-foreground/20"
          : "border-border"
      } ${isExpanded ? "ring-1 ring-foreground/20" : ""}`}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      {/* Header: Avatar + Handle + Time */}
      <div className="flex items-start gap-3">
        <AvatarImage
          src={bookmark.author_profile_image_url}
          name={bookmark.author_name}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Link
              to={`/people/${encodeURIComponent(bookmark.author_handle)}`}
              className="min-h-[44px] inline-flex items-center text-sm font-semibold text-foreground hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              @{bookmark.author_handle}
            </Link>
            <span className="text-xs text-disabled" title={formattedDate}>
              {relativeTime}
            </span>
            {bookmarkedTime && (
              <span className="text-xs text-disabled" title={bookmarkedDate!.toISOString()}>
                saved {bookmarkedTime}
              </span>
            )}
          </div>

          {/* Text content */}
          <p className="mt-1.5 text-sm text-body leading-relaxed whitespace-pre-wrap">
            {formatTweetText(bookmark.text)}
          </p>

          {/* Links from links_json */}
          {links.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {links.map((link, i) => (
                <a
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[44px] items-center gap-1 px-1 py-2 text-xs text-foreground hover:underline min-w-0 max-w-full"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink className="h-3 w-3 shrink-0" />
                  <span className="truncate">{link.display || link.title || link.url}</span>
                </a>
              ))}
            </div>
          )}

          {/* Quoted tweet */}
          {quotedTweet && (
            <div className="mt-5 mb-4">
              <p className="mb-1.5 text-xs text-muted">Quoted tweet</p>
              <div className="rounded-lg border border-border bg-black p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  {quotedTweet.author_profile_image_url && (
                    <img
                      src={quotedTweet.author_profile_image_url}
                      alt=""
                      className="h-4 w-4 rounded-full"
                    />
                  )}
                  <span className="text-xs text-muted-foreground">
                    {quotedTweet.author_name && (
                      <span className="text-foreground/80">{quotedTweet.author_name}</span>
                    )}
                    {quotedTweet.author_handle && (
                      <span className="ml-1">@{quotedTweet.author_handle}</span>
                    )}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {quotedTweet.text}
                </p>
              </div>
            </div>
          )}

          {/* Badges */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {bookmark.primary_category && (
              <Link
                to={`/stream?category=${encodeURIComponent(bookmark.primary_category)}`}
                onClick={(e) => e.stopPropagation()}
                className="rounded-badge bg-surface px-2 py-0.5 text-xs text-foreground hover:bg-[#252528] transition-colors"
              >
                {bookmark.primary_category}
              </Link>
            )}
            {bookmark.primary_domain && (
              <Link
                to={`/stream?domain=${encodeURIComponent(bookmark.primary_domain)}`}
                onClick={(e) => e.stopPropagation()}
                className="rounded-badge border border-border bg-card px-2 py-0.5 text-xs text-muted hover:border-[#333] hover:text-foreground transition-colors"
              >
                {bookmark.primary_domain}
              </Link>
            )}
            {bookmark.media_count > 0 && (
              <span className="flex items-center gap-1 rounded-badge border border-border bg-card px-2 py-0.5 text-xs text-muted">
                <Image className="h-3 w-3" />
                {bookmark.media_count} media
              </span>
            )}
            {bookmark.in_reply_to_status_id && (
              <span className="rounded-badge border border-border bg-card px-2 py-0.5 text-xs text-muted">
                Reply
              </span>
            )}
            {bookmark.quoted_status_id && !quotedTweet && (
              <span className="rounded-badge border border-border bg-card px-2 py-0.5 text-xs text-muted">
                Quote
              </span>
            )}
          </div>

          {/* Engagement Stats */}
          <div className="mt-3 flex items-center gap-4">
            <EngagementStat icon={Heart} value={bookmark.like_count} label="Likes" />
            <EngagementStat icon={Repeat2} value={bookmark.repost_count} label="Reposts" />
            <EngagementStat icon={Bookmark} value={bookmark.bookmark_count} label="Bookmarks" />

          </div>

          {/* Expanded section: Collections + Open in X */}
          {isExpanded && (
            <div className="mt-3 border-t border-border pt-3" onClick={(e) => e.stopPropagation()}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">Collections</span>
                {memberships.map((m) => (
                  <Link
                    key={m.slug}
                    to={`/collections/${encodeURIComponent(m.slug)}`}
                    className="rounded-badge border border-border px-2 py-0.5 text-xs text-foreground transition-colors hover:border-[#444]"
                    style={m.color ? { backgroundColor: `${m.color}22`, borderColor: `${m.color}55` } : undefined}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {m.name}
                  </Link>
                ))}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsPickerOpen((o) => !o)}
                    className="flex items-center gap-1 rounded-badge border border-dashed border-border px-2 py-0.5 text-xs text-muted transition-colors hover:border-[#444] hover:text-foreground"
                  >
                    <FolderPlus className="h-3 w-3" />
                    {memberships.length === 0 ? "Add to collection" : "Edit"}
                  </button>
                  {isPickerOpen && (
                    <CollectionPicker
                      bookmarkId={bookmarkIdStr}
                      initialMemberships={memberships}
                      onClose={() => setIsPickerOpen(false)}
                      onMembershipsChange={setMemberships}
                    />
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={openInXUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[44px] items-center gap-1.5 rounded-button border border-border px-3 py-2 text-sm text-foreground hover:bg-surface active:bg-[#252528] transition-colors"
                >
                  <X className="h-4 w-4" />
                  Open in X
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
