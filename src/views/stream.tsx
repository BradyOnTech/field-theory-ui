import { useEffect, useState, useCallback, useRef } from "react";
import { Search, SlidersHorizontal, ChevronRight } from "lucide-react";
import { formatNumber, tweetUrl } from "@/lib/utils";
import { useListKeyboardNav } from "@/lib/use-list-keyboard-nav";
import { Skeleton } from "@/components/skeleton";
import { BookmarkCard } from "@/components/stream-bookmark-card";
import { useStreamSearch } from "@/lib/use-stream-search";
import { ErrorRetry } from "@/components/error-retry";

export function StreamView() {
  const {
    query,
    categoryFilter,
    domainFilter,
    authorFilter,
    afterFilter,
    beforeFilter,
    bookmarks,
    total,
    isLoading,
    hasMore,
    error,
    categories,
    domains,
    isLoadingRef,
    loadMore,
    updateFilters,
    retry,
    searchParams,
    setSearchParams,
    buildSearchParams,
  } = useStreamSearch();

  const [searchInput, setSearchInput] = useState(query);
  const [authorInput, setAuthorInput] = useState(authorFilter);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const advancedFilterCount = [categoryFilter, domainFilter, authorFilter, afterFilter, beforeFilter].filter(Boolean).length;

  useEffect(() => {
    if (advancedFilterCount > 0) setFiltersOpen(true);
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

  useEffect(() => {
    setExpandedId(null);
  }, [buildSearchParams]);

  const expandedCardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && expandedId !== null) {
        setExpandedId(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [expandedId]);

  useEffect(() => {
    if (expandedId === null) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        expandedCardRef.current &&
        !expandedCardRef.current.contains(e.target as Node)
      ) {
        setExpandedId(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [expandedId]);

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
    query || categoryFilter || domainFilter || authorFilter || afterFilter || beforeFilter;

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

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border bg-background p-6 pb-4">
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

        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="mt-4">
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

        {/* Advanced Filters Toggle */}
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className="mt-3 flex w-full items-center gap-2 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>Advanced</span>
          {advancedFilterCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-badge bg-surface px-1 text-[10px] font-semibold text-foreground">
              {advancedFilterCount}
            </span>
          )}
          <ChevronRight className={`ml-auto h-3.5 w-3.5 transition-transform ${filtersOpen ? "rotate-90" : ""}`} />
        </button>

        {/* Advanced Filters Panel */}
        <div className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${filtersOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="overflow-hidden">
            <div className="flex flex-wrap items-end gap-3 pt-2">
              {/* Category Dropdown */}
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

              {/* Domain Dropdown */}
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

              {/* Author Input */}
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

              {/* Date Range: After */}
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

              {/* Date Range: Before */}
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
          </div>
        </div>
      </div>

      {/* Bookmark List */}
      <div ref={listContainerRef} className="min-h-0 flex-1 overflow-y-auto px-6 pt-6">
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
                  isExpanded={expandedId === bookmark.id}
                  isSelected={index === selectedIndex}
                  expandedRef={expandedId === bookmark.id ? expandedCardRef : undefined}
                  onToggle={() =>
                    setExpandedId((prev) =>
                      prev === bookmark.id ? null : bookmark.id,
                    )
                  }
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
