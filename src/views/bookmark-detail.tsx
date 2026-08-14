import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Braces } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BookmarkCard } from "@/components/stream-bookmark-card";
import { ErrorRetry } from "@/components/error-retry";
import { Skeleton } from "@/components/skeleton";
import { fetchBookmark } from "@/lib/api";
import type { Bookmark } from "@/lib/types";

export function BookmarkDetailView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [bookmark, setBookmark] = useState<Bookmark | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBookmark = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    void fetchBookmark(id)
      .then((result) => {
        setBookmark(result);
        setLoading(false);
        document.title = `@${result.author_handle} bookmark · Field Theory`;
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load bookmark");
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    loadBookmark();
    return () => {
      document.title = "Field Theory";
    };
  }, [loadBookmark]);

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex min-h-[44px] items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        {id && (
          <a
            href={`/api/bookmark/${encodeURIComponent(id)}`}
            className="flex min-h-[44px] items-center gap-2 text-sm text-muted transition-colors hover:text-foreground"
          >
            <Braces className="h-4 w-4" />
            JSON
          </a>
        )}
      </div>

      {loading && <Skeleton className="h-72 w-full rounded-card" />}
      {!loading && error && <ErrorRetry message={error} onRetry={loadBookmark} />}
      {!loading && !error && bookmark && (
        <BookmarkCard bookmark={bookmark} isExpanded onToggle={() => undefined} />
      )}
      {!loading && !error && !bookmark && (
        <div className="py-20 text-center text-muted">
          Bookmark not found. <Link to="/stream" className="text-foreground hover:underline">Return to Stream</Link>
        </div>
      )}
    </div>
  );
}
