import { useEffect, useState, useCallback, useRef } from "react";
import { Search, SlidersHorizontal, ChevronRight, ArrowUpDown } from "lucide-react";
import { formatNumber, tweetUrl } from "@/lib/utils";
import { useListKeyboardNav } from "@/lib/use-list-keyboard-nav";
import { useIsLg } from "@/lib/use-media-query";
import { Skeleton } from "@/components/skeleton";
import { BookmarkCard } from "@/components/stream-bookmark-card";
import { BottomSheet } from "@/components/bottom-sheet";
import { useStreamSearch } from "@/lib/use-stream-search";
import { ErrorRetry } from "@/components/error-retry";
import { UNCOLLECTED_COLLECTION_FILTER, type SortKey } from "@/lib/types";

const DATE_PRESETS = [
  { id: "7d", label: "7d", days: 7 },
  { id: "30d", label: "30d", days: 30 },
  { id: "90d", label: "90d", days: 90 },
  { id: "all", label: "All", days: null },
] as const;

function isoDaysAgo(days: number): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const SORT_OPTIONS: { value: SortKey; label: string; needsQuery?: boolean }[] = [
  { value: "posted_desc", label: "Newest posted" },
  { value: "posted_asc", label: "Oldest posted" },
  { value: "likes_desc", label: "Most liked" },
  { value: "reposts_desc", label: "Most reposted" },
  { value: "bookmark_count_desc", label: "Most bookmarked" },
  { value: "relevance", label: "Relevance", needsQuery: true },
];

export function StreamView() {
  const {
    query,
    categoryFilter,
    domainFilter,
    collectionFilter,
    authorFilter,
    afterFilter,
    beforeFilter,
    sort,
    bookmarks,
    total,
    isLoading,
    hasMore,
    error,
    categories,
    domains,
    collections,
    isLoadingRef,
    loadMore,
    updateFilters,
    retry,
    searchParams,
    setSearchParams,
  } = useStreamSearch();

  const [searchInput, setSearchInput] = useState(query);
  const [authorInput, setAuthorInput] = useState(authorFilter);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [chromeFocused, setChromeFocused] = useState(false);
  const [chromeHeight, setChromeHeight] = useState(220);
  const chromeRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef(0);
  const isLg = useIsLg();
  const keepChromeVisible = filtersOpen || chromeFocused;

  const advancedFilterCount = [categoryFilter, domainFilter, collectionFilter, authorFilter, afterFilter, beforeFilter].filter(Boolean).length;

  useEffect(() => {
    if (advancedFilterCount > 0 && isLg) setFiltersOpen(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenBookmark = useCallback(
    (index: number) => {
      const bookmark = bookmarks[index];
      if (bookmark) {
        const url = tweetUrl(bookmark.author_handle, bookmark.tweet_id);
        window.open(url, "_blank", "noopener,noreferrer");
      }
    },
    [bookmarks],
  );

  const { selectedIndex } = useListKeyboardNav({
    itemCount: bookmarks.length,
    onOpen: handleOpenBookmark,
  });

  const listContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedIndex >= 0 && listContainerRef.current) {
      const el = listContainerRef.current.querySelector(
        `[data-bookmark-index="${selectedIndex}"]`,
      );
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  useEffect(() => {
    setSearchInput(searchParams.get("q") || "");
    setAuthorInput(searchParams.get("author") || "");
  }, [searchParams]);

  const applyDatePreset = (days: number | null) => {
    if (days === null) {
      updateFilters({ after: "", before: "" });
      return;
    }
    updateFilters({ after: isoDaysAgo(days), before: "" });
  };

  const activeDatePreset = (() => {
    if (beforeFilter) return null;
    if (!afterFilter) return "all";
    const match = DATE_PRESETS.find((preset) => preset.days !== null && isoDaysAgo(preset.days) === afterFilter);
    return match?.id ?? null;
  })();

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ q: searchInput });
  };

  const commitAuthor = () => {
    if (authorInput !== authorFilter) {
      updateFilters({ author: authorInput });
    }
  };

  const handleClearFilters = () => {
    setSearchInput("");
    setAuthorInput("");
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const hasActiveFilters =
    query || categoryFilter || domainFilter || collectionFilter || authorFilter || afterFilter || beforeFilter;

  useEffect(() => {
    const chrome = chromeRef.current;
    if (!chrome || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const height = entry?.contentRect.height;
      if (height && height > 0) setChromeHeight(height);
    });
    observer.observe(chrome);
    setChromeHeight(chrome.getBoundingClientRect().height);
    return () => observer.disconnect();
  }, [isLg, filtersOpen]);

  const handleListScroll = useCallback(() => {
    const list = listContainerRef.current;
    if (!list) return;
    const scrollTop = list.scrollTop;
    const delta = scrollTop - lastScrollTopRef.current;
    lastScrollTopRef.current = scrollTop;
    if (scrollTop <= 16) {
      setChromeHidden(false);
      return;
    }
    if (delta > 8) setChromeHidden(true);
    else if (delta < -8) setChromeHidden(false);
  }, []);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoadingRef.current) {
          void loadMore();
        }
      },
      { root: listContainerRef.current, rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, bookmarks.length, isLoadingRef]);

  const filterFields = (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex flex-col gap-1">
        <label htmlFor="category-filter" className="text-xs text-muted">
          Category
        </label>
        <select
          id="category-filter"
          value={categoryFilter}
          onChange={(e) => updateFilters({ category: e.target.value })}
          className="min-h-[44px] rounded-button border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All categories</option>
          {categories.map((cat) => (
            <option key={cat.name} value={cat.name}>
              {cat.name} ({cat.count})
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="domain-filter" className="text-xs text-muted">
          Domain
        </label>
        <select
          id="domain-filter"
          value={domainFilter}
          onChange={(e) => updateFilters({ domain: e.target.value })}
          className="min-h-[44px] rounded-button border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All domains</option>
          {domains.map((dom) => (
            <option key={dom.name} value={dom.name}>
              {dom.name} ({dom.count})
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="collection-filter" className="text-xs text-muted">
          Collection
        </label>
        <select
          id="collection-filter"
          value={collectionFilter}
          onChange={(e) => updateFilters({ collection: e.target.value })}
          className="min-h-[44px] rounded-button border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All collections</option>
          <option value={UNCOLLECTED_COLLECTION_FILTER}>Not in a collection</option>
          {collections.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name} ({c.bookmark_count})
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="author-filter" className="text-xs text-muted">
          Author
        </label>
        <input
          id="author-filter"
          type="text"
          value={authorInput}
          onChange={(e) => setAuthorInput(e.target.value)}
          onBlur={commitAuthor}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitAuthor();
            }
          }}
          placeholder="Author handle"
          className="min-h-[44px] rounded-button border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-disabled focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="after-filter" className="text-xs text-muted">
          From
        </label>
        <input
          id="after-filter"
          type="date"
          value={afterFilter}
          onChange={(e) => updateFilters({ after: e.target.value })}
          className="min-h-[44px] rounded-button border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="before-filter" className="text-xs text-muted">
          To
        </label>
        <input
          id="before-filter"
          type="date"
          value={beforeFilter}
          onChange={(e) => updateFilters({ before: e.target.value })}
          className="min-h-[44px] rounded-button border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    </div>
  );

  const hideChrome = chromeHidden && !keepChromeVisible;

  return (
    <div className="relative flex h-full flex-col">
      <div
        ref={chromeRef}
        onFocusCapture={() => setChromeFocused(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setChromeFocused(false);
          }
        }}
        data-testid="stream-chrome"
        className={`absolute inset-x-0 top-0 z-20 border-b border-border bg-background/95 p-4 pb-4 backdrop-blur-sm transition-transform duration-200 ease-out md:p-6 md:pb-4 ${
          hideChrome ? "pointer-events-none -translate-y-full" : "translate-y-0"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Stream</h1>
            <p className="mt-1 text-sm text-muted">
              {total > 0
                ? `${formatNumber(total)} bookmarks`
                : isLoading
                  ? "Loading..."
                  : "No bookmarks found"}
            </p>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="min-h-[44px] rounded-button border border-border px-3 py-2 text-xs text-muted hover:text-foreground hover:border-[#333] transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <form onSubmit={handleSearchSubmit} className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                id="stream-search"
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search bookmarks..."
                className="w-full rounded-button border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-disabled focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-ring min-h-[44px]"
              />
            </div>
          </form>
          <div className="relative flex items-center sm:w-56">
            <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <select
              aria-label="Sort bookmarks"
              value={sort}
              onChange={(e) => updateFilters({ sort: e.target.value })}
              className="min-h-[44px] w-full appearance-none rounded-button border border-border bg-background py-2.5 pl-9 pr-8 text-sm text-foreground focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.needsQuery && !query}>
                  {opt.label}
                  {opt.needsQuery && !query ? " (needs query)" : ""}
                </option>
              ))}
            </select>
            <ChevronRight className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-90 text-muted" />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyDatePreset(preset.days)}
              className={`min-h-[36px] rounded-button border px-3 text-xs transition-colors ${
                activeDatePreset === preset.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className="flex min-h-[36px] items-center gap-2 rounded-button border border-border px-3 text-xs text-muted transition-colors hover:text-foreground"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>{isLg ? "Advanced" : "Filters"}</span>
            {advancedFilterCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-badge bg-surface px-1 text-[10px] font-semibold text-foreground">
                {advancedFilterCount}
              </span>
            )}
          </button>
        </div>

        {isLg && (
          <div className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${filtersOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
            <div className="overflow-hidden">
              <div className="pt-3">{filterFields}</div>
            </div>
          </div>
        )}
      </div>

      {!isLg && filtersOpen && (
        <BottomSheet title="Filters" onClose={() => setFiltersOpen(false)}>
          {filterFields}
        </BottomSheet>
      )}

      <div
        ref={listContainerRef}
        data-testid="stream-list"
        onScroll={handleListScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 md:px-6 md:pb-6"
      >
        <div aria-hidden="true" style={{ height: chromeHeight + 16 }} />
        {error && (
          <ErrorRetry message={error} onRetry={retry} />
        )}

        {!error && isLoading && bookmarks.length === 0 && (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="rounded-card border border-border bg-card p-5"
              >
                <div className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <Skeleton className="h-4 w-2/3" />
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-20 rounded-badge" />
                      <Skeleton className="h-5 w-16 rounded-badge" />
                    </div>
                    <div className="flex gap-4">
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="h-4 w-12" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!error && bookmarks.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="mb-4 h-12 w-12 text-disabled" />
            <p className="text-lg text-muted">No bookmarks found</p>
            <p className="mt-1 text-sm text-disabled">
              Try adjusting your search or filters
            </p>
          </div>
        )}

        {bookmarks.length > 0 && (
          <div className="flex flex-col gap-4">
            {bookmarks.map((bookmark, index) => (
              <div key={bookmark.id} data-bookmark-index={index}>
                <BookmarkCard
                  bookmark={bookmark}
                  isExpanded={false}
                  isSelected={index === selectedIndex}
                  onToggle={() => undefined}
                />
              </div>
            ))}
            <div ref={sentinelRef} className="h-1" />
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && bookmarks.length > 0 && (
          <div className="py-4 text-center text-sm text-muted">
            Loading more...
          </div>
        )}
      </div>
    </div>
  );
}
