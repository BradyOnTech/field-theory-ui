import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Search, Users } from "lucide-react";
import { fetchTopAuthors } from "@/lib/api";
import type { Author } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { AuthorProfileView } from "./author-profile";
import { useListKeyboardNav } from "@/lib/use-list-keyboard-nav";
import { AvatarImage } from "@/components/avatar-image";
import { Skeleton } from "@/components/skeleton";
import { SimplePagination } from "@/components/simple-pagination";
import { ErrorRetry } from "@/components/error-retry";

const PAGE_SIZE = 48;

function AuthorCard({
  author,
  isSelected,
  onClick,
  onDomainClick,
  onViewBookmarks,
}: {
  author: Author;
  isSelected?: boolean;
  onClick: () => void;
  onDomainClick?: (domain: string) => void;
  onViewBookmarks?: () => void;
}) {
  return (
    <div
      data-testid="author-card"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`flex cursor-pointer flex-col items-center gap-3 rounded-card border bg-card p-3 sm:p-5 text-center transition-colors hover:border-[#333] hover:bg-card/80 ${
        isSelected
          ? "border-foreground/30 bg-foreground/5 ring-2 ring-foreground/20"
          : "border-border"
      }`}
    >
      <AvatarImage
        src={author.author_profile_image_url}
        name={author.author_name || author.author_handle}
        className="h-10 w-10 sm:h-14 sm:w-14"
      />
      <div className="flex flex-col items-center gap-1 min-w-0 w-full">
        <span className="text-sm font-semibold text-foreground truncate w-full">
          @{author.author_handle}
        </span>
        {author.author_name && author.author_name !== author.author_handle && (
          <span className="text-xs text-muted truncate w-full">
            {author.author_name}
          </span>
        )}
        <span className="font-mono text-lg font-bold text-foreground">
          {author.count}
        </span>
        <span className="text-xs text-disabled">bookmarks</span>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {author.primary_domain && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDomainClick?.(author.primary_domain);
            }}
            className="rounded-badge border border-border bg-card px-2 py-0.5 text-xs text-muted hover:border-[#333] hover:text-foreground transition-colors"
          >
            {author.primary_domain}
          </button>
        )}
        <button
          type="button"
          data-testid="view-bookmarks-btn"
          onClick={(e) => {
            e.stopPropagation();
            onViewBookmarks?.();
          }}
          className="min-h-[44px] rounded-button border border-border bg-card px-3 py-2 text-xs text-muted hover:border-[#333] hover:text-foreground transition-colors"
        >
          View bookmarks
        </button>
      </div>
    </div>
  );
}



function AuthorCardSkeleton() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-card p-3 sm:p-5">
      {/* Avatar */}
      <Skeleton className="h-10 w-10 sm:h-14 sm:w-14 rounded-full" />
      <div className="flex w-full flex-col items-center gap-1">
        {/* Handle */}
        <Skeleton className="h-4 w-24" />
        {/* Name */}
        <Skeleton className="h-3 w-20" />
        {/* Count */}
        <Skeleton className="h-6 w-10" />
        {/* "bookmarks" label */}
        <Skeleton className="h-3 w-16" />
      </div>
      <div className="flex items-center gap-2">
        {/* Domain badge */}
        <Skeleton className="h-5 w-12 rounded-badge" />
        {/* View bookmarks button */}
        <Skeleton className="h-[44px] w-28 rounded-button" />
      </div>
    </div>
  );
}

export function PeopleView() {
  const navigate = useNavigate();
  const { handle } = useParams<{ handle?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [authors, setAuthors] = useState<Author[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Persist search and page in URL params so back navigation restores state
  const searchQuery = searchParams.get("q") || "";
  const currentPage = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);

  const setSearchQuery = useCallback(
    (query: string) => {
      const next = new URLSearchParams(searchParams);
      if (query) {
        next.set("q", query);
      } else {
        next.delete("q");
      }
      next.delete("page"); // reset to page 1 on search change
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const loadAuthors = useCallback(() => {
    setIsLoading(true);
    setError(null);
    void fetchTopAuthors(10000)
      .then((data) => {
        setAuthors(data);
        setError(null);
      })
      .catch(() => {
        setError("Failed to load data. Is the server running?");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    loadAuthors();
  }, [loadAuthors]);

  // Client-side filtering by name or handle
  const filteredAuthors = useMemo(() => {
    if (!searchQuery.trim()) return authors;
    const query = searchQuery.toLowerCase().trim();
    return authors.filter(
      (a) =>
        a.author_handle.toLowerCase().includes(query) ||
        (a.author_name && a.author_name.toLowerCase().includes(query)),
    );
  }, [authors, searchQuery]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredAuthors.length / PAGE_SIZE));
  const paginatedAuthors = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredAuthors.slice(start, start + PAGE_SIZE);
  }, [filteredAuthors, currentPage]);

  const handlePageChange = useCallback(
    (page: number) => {
      const safePage = Math.max(1, Math.min(page, totalPages));
      const next = new URLSearchParams(searchParams);
      if (safePage > 1) {
        next.set("page", String(safePage));
      } else {
        next.delete("page");
      }
      setSearchParams(next, { replace: true });
      // Scroll to top of grid
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [totalPages, searchParams, setSearchParams],
  );

  const handleAuthorClick = useCallback(
    (authorHandle: string) => {
      navigate(`/people/${encodeURIComponent(authorHandle)}`);
    },
    [navigate],
  );

  const handleDomainClick = useCallback(
    (domain: string) => {
      navigate(`/stream?domain=${encodeURIComponent(domain)}`);
    },
    [navigate],
  );

  const handleViewBookmarks = useCallback(
    (authorHandle: string) => {
      navigate(`/stream?author=${encodeURIComponent(authorHandle)}`);
    },
    [navigate],
  );

  // Keyboard list navigation (j/k/o) for the author grid
  const handleOpenAuthor = useCallback(
    (index: number) => {
      const author = paginatedAuthors[index];
      if (author) {
        navigate(`/people/${encodeURIComponent(author.author_handle)}`);
      }
    },
    [paginatedAuthors, navigate],
  );

  const { selectedIndex } = useListKeyboardNav({
    itemCount: handle ? 0 : paginatedAuthors.length,
    onOpen: handleOpenAuthor,
  });

  // If there's a handle param, render the profile page
  if (handle) {
    return <AuthorProfileView />;
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">People</h1>
          <p className="mt-1 text-sm text-muted">
            {filteredAuthors.length} authors
            {searchQuery && ` matching "${searchQuery}"`}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-disabled">
          <Users className="h-4 w-4" />
          <span className="font-mono">{formatNumber(authors.length)} total</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-disabled" />
        <input
          type="text"
          placeholder="Search authors by name or handle..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="min-h-[44px] w-full rounded-button border border-border bg-card py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-disabled focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Loading Skeleton State */}
      {isLoading && authors.length === 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <AuthorCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error State */}
      {error && (
        <ErrorRetry message={error} onRetry={() => { setError(null); loadAuthors(); }} />
      )}

      {/* Author Grid */}
      {!error && paginatedAuthors.length > 0 ? (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
            {paginatedAuthors.map((author, index) => (
              <AuthorCard
                key={author.author_handle}
                author={author}
                isSelected={index === selectedIndex}
                onClick={() => handleAuthorClick(author.author_handle)}
                onDomainClick={handleDomainClick}
                onViewBookmarks={() => handleViewBookmarks(author.author_handle)}
              />
            ))}
          </div>

          {/* Pagination */}
          <SimplePagination
            page={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            variant="numbered"
          />

          {/* Page info */}
          {totalPages > 1 && (
            <div className="mt-3 text-center text-xs text-disabled">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–
              {Math.min(currentPage * PAGE_SIZE, filteredAuthors.length)} of{" "}
              {filteredAuthors.length} authors
            </div>
          )}
        </>
      ) : !error && authors.length > 0 ? (
        /* Empty state for search with no results */
        <div className="flex flex-col items-center justify-center py-20">
          <Users className="mb-4 h-12 w-12 text-disabled" />
          <h3 className="text-lg font-semibold text-foreground">No authors found</h3>
          <p className="mt-1 text-sm text-muted">
            Try adjusting your search query
          </p>
        </div>
      ) : null}
    </div>
  );
}
