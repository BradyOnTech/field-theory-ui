import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchSearch, fetchCategories, fetchDomains, fetchCollections } from "@/lib/api";
import type { Bookmark, CategoryCount, Collection, DomainCount, SortKey } from "@/lib/types";

const DEFAULT_SORT: SortKey = "posted_desc";
const VALID_SORTS: ReadonlySet<SortKey> = new Set<SortKey>([
  "posted_desc",
  "posted_asc",
  "likes_desc",
  "reposts_desc",
  "bookmark_count_desc",
  "relevance",
]);
// ft bookmark exports do not populate bookmarked_at, so keep old URLs working by
// mapping the removed bookmark-date sorts onto the equivalent posted-date sorts.
const LEGACY_SORT_ALIASES: Readonly<Record<string, SortKey>> = {
  bookmarked_desc: "posted_desc",
  bookmarked_asc: "posted_asc",
};

function normalizeSortParam(sort: string | null): SortKey {
  if (!sort) return DEFAULT_SORT;

  const mapped = LEGACY_SORT_ALIASES[sort] ?? sort;
  return VALID_SORTS.has(mapped as SortKey) ? (mapped as SortKey) : DEFAULT_SORT;
}

const PAGE_SIZE = 20;

interface UseStreamSearchReturn {
  // URL-derived filter state
  query: string;
  categoryFilter: string;
  domainFilter: string;
  collectionFilter: string;
  authorFilter: string;
  afterFilter: string;
  beforeFilter: string;
  sort: SortKey;

  // Result state
  bookmarks: Bookmark[];
  total: number;
  isLoading: boolean;
  hasMore: boolean;
  error: string | null;

  // Dropdown data
  categories: CategoryCount[];
  domains: DomainCount[];
  collections: Collection[];

  // Refs
  offsetRef: React.RefObject<number>;
  isLoadingRef: React.RefObject<boolean>;

  // Actions
  loadMore: () => Promise<void>;
  updateFilters: (updates: Record<string, string>) => void;
  retry: () => void;

  // URL param utilities
  searchParams: URLSearchParams;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
  buildSearchParams: (offset: number) => {
    q: string | undefined;
    category: string | undefined;
    domain: string | undefined;
    collection: string | undefined;
    author: string | undefined;
    after: string | undefined;
    before: string | undefined;
    sort: SortKey;
    limit: number;
    offset: number;
  };
}

export function useStreamSearch(): UseStreamSearchReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  // Filter state derived from URL
  const query = searchParams.get("q") || "";
  const categoryFilter = searchParams.get("category") || "";
  const domainFilter = searchParams.get("domain") || "";
  const collectionFilter = searchParams.get("collection") || "";
  const authorFilter = searchParams.get("author") || "";
  const afterFilter = searchParams.get("after") || "";
  const beforeFilter = searchParams.get("before") || "";
  const sortRaw = searchParams.get("sort");
  const sort = normalizeSortParam(sortRaw);

  // Data state
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dropdown data
  const [categories, setCategories] = useState<CategoryCount[]>([]);
  const [domains, setDomains] = useState<DomainCount[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);

  // Refs
  const offsetRef = useRef(0);
  const isLoadingRef = useRef(false);
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const retryControllerRef = useRef<AbortController | null>(null);

  // Load categories, domains and collections for filter dropdowns
  useEffect(() => {
    void fetchCategories()
      .then(setCategories)
      .catch((err) => {
        console.warn("Failed to load categories for filter dropdown:", err);
      });
    void fetchDomains()
      .then(setDomains)
      .catch((err) => {
        console.warn("Failed to load domains for filter dropdown:", err);
      });
    void fetchCollections()
      .then(setCollections)
      .catch((err) => {
        console.warn("Failed to load collections for filter dropdown:", err);
      });
  }, []);

  useEffect(() => {
    if (!sortRaw) return;
    if (sortRaw === sort) return;

    const newParams = new URLSearchParams(searchParams);
    newParams.set("sort", sort);
    setSearchParams(newParams, { replace: true });
  }, [searchParams, setSearchParams, sort, sortRaw]);

  // Build search params from current filters
  const buildSearchParams = useCallback(
    (offset: number) => ({
      q: query || undefined,
      category: categoryFilter || undefined,
      domain: domainFilter || undefined,
      collection: collectionFilter || undefined,
      author: authorFilter || undefined,
      after: afterFilter || undefined,
      before: beforeFilter || undefined,
      sort,
      limit: PAGE_SIZE,
      offset,
    }),
    [query, categoryFilter, domainFilter, collectionFilter, authorFilter, afterFilter, beforeFilter, sort],
  );

  // Load initial results when filters change
  useEffect(() => {
    const controller = new AbortController();

    offsetRef.current = 0;
    setBookmarks([]);
    setHasMore(true);

    const loadInitial = async () => {
      setIsLoading(true);
      isLoadingRef.current = true;
      try {
        const result = await fetchSearch(buildSearchParams(0), controller.signal);
        setBookmarks(result.results);
        setTotal(result.total);
        offsetRef.current = result.results.length;
        setHasMore(result.results.length < result.total);
        setError(null);
      } catch {
        if (controller.signal.aborted) return;
        setBookmarks([]);
        setTotal(0);
        setHasMore(false);
        setError("Failed to load data. Is the server running?");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          isLoadingRef.current = false;
        }
      }
    };

    void loadInitial();

    return () => {
      controller.abort();
      // Also abort any in-flight loadMore or retry requests to prevent stale data
      loadMoreControllerRef.current?.abort();
      loadMoreControllerRef.current = null;
      retryControllerRef.current?.abort();
      retryControllerRef.current = null;
    };
  }, [buildSearchParams]);

  // Load more results (for infinite scroll)
  const loadMore = useCallback(async () => {
    if (isLoadingRef.current || !hasMore) return;

    // Abort any previous in-flight loadMore request
    loadMoreControllerRef.current?.abort();
    const controller = new AbortController();
    loadMoreControllerRef.current = controller;

    isLoadingRef.current = true;
    setIsLoading(true);
    try {
      const result = await fetchSearch(buildSearchParams(offsetRef.current), controller.signal);
      // Guard against stale results: only update state if this controller is still current
      if (controller.signal.aborted || loadMoreControllerRef.current !== controller) return;
      setBookmarks((prev) => [...prev, ...result.results]);
      offsetRef.current += result.results.length;
      setHasMore(offsetRef.current < result.total);
    } catch {
      if (controller.signal.aborted) return;
      setError("Failed to load more bookmarks. Please try again.");
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
        isLoadingRef.current = false;
      }
    }
  }, [buildSearchParams, hasMore]);

  // Update URL params
  const updateFilters = useCallback(
    (updates: Record<string, string>) => {
      const newParams = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          newParams.set(key, value);
        } else {
          newParams.delete(key);
        }
      }
      setSearchParams(newParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // Retry: re-run the initial fetch with current filters
  const retry = useCallback(() => {
    // Abort any previous retry request
    retryControllerRef.current?.abort();
    const controller = new AbortController();
    retryControllerRef.current = controller;

    setError(null);
    offsetRef.current = 0;
    setBookmarks([]);
    setHasMore(true);
    setIsLoading(true);
    isLoadingRef.current = true;
    void fetchSearch(buildSearchParams(0), controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setBookmarks(result.results);
        setTotal(result.total);
        offsetRef.current = result.results.length;
        setHasMore(result.results.length < result.total);
        setError(null);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError("Failed to load data. Is the server running?");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          isLoadingRef.current = false;
        }
      });
  }, [buildSearchParams]);

  return {
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
    offsetRef,
    isLoadingRef,
    loadMore,
    updateFilters,
    retry,
    searchParams,
    setSearchParams,
    buildSearchParams,
  };
}
