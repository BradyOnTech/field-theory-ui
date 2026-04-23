import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Folder, FolderOpen, Plus, Trash2, Loader2, ArrowLeft } from "lucide-react";
import { BookmarkCard } from "@/components/stream-bookmark-card";
import { useCollections } from "@/lib/use-collections";
import { fetchCollection } from "@/lib/api";
import type { CollectionDetail } from "@/lib/types";
import { formatNumber, tweetUrl } from "@/lib/utils";
import { useListKeyboardNav } from "@/lib/use-list-keyboard-nav";
import { ErrorRetry } from "@/components/error-retry";

export function CollectionsView() {
  const { slug } = useParams<{ slug?: string }>();
  if (slug) return <CollectionDetailView slug={slug} />;
  return <CollectionsIndex />;
}

function CollectionsIndex() {
  const { collections, isLoading, error, create, remove } = useCollections();
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      await create({ name: trimmed });
      setName("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (targetSlug: string, displayName: string) => {
    if (!window.confirm(`Delete "${displayName}"? Bookmarks will stay, but their membership is removed.`)) {
      return;
    }
    try {
      await remove(targetSlug);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border bg-background p-6 pb-4">
        <h1 className="text-2xl font-bold text-foreground">Collections</h1>
        <p className="mt-1 text-sm text-muted">
          Group bookmarks across categories and domains for a specific project or theme.
        </p>

        <form onSubmit={(e) => void handleCreate(e)} className="mt-4 flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Plus className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="New collection name…"
              className="min-h-[44px] w-full rounded-button border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-disabled focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            disabled={!name.trim() || isCreating}
            className="min-h-[44px] rounded-button border border-border bg-surface px-4 py-2 text-sm text-foreground transition-colors hover:bg-[#252528] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
          </button>
        </form>
        {createError && <p className="mt-2 text-xs text-red-400">{createError}</p>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {error && <ErrorRetry message={error} onRetry={() => window.location.reload()} />}

        {!error && isLoading && collections.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {!error && !isLoading && collections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Folder className="mb-4 h-12 w-12 text-disabled" />
            <p className="text-lg text-muted">No collections yet</p>
            <p className="mt-1 text-sm text-disabled">
              Create one above, or expand any bookmark and add it to a new collection.
            </p>
          </div>
        )}

        {collections.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {collections.map((c) => (
              <div
                key={c.slug}
                className="group relative rounded-card border border-border bg-card p-4 transition-colors hover:border-[#333]"
              >
                <Link
                  to={`/collections/${encodeURIComponent(c.slug)}`}
                  className="flex items-start gap-3"
                >
                  <div
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-button border border-border"
                    style={c.color ? { backgroundColor: `${c.color}22`, borderColor: `${c.color}55` } : undefined}
                  >
                    <FolderOpen className="h-4 w-4 text-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-foreground">{c.name}</h3>
                      <span className="font-mono text-[11px] text-disabled">
                        {formatNumber(c.bookmark_count)}
                      </span>
                    </div>
                    {c.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted">{c.description}</p>
                    )}
                    <p className="mt-2 font-mono text-[10px] text-disabled">{c.slug}</p>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => void handleDelete(c.slug, c.name)}
                  className="absolute right-2 top-2 rounded-button p-1.5 text-disabled opacity-0 transition-opacity hover:bg-surface hover:text-red-400 group-hover:opacity-100"
                  title="Delete collection"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const PAGE_SIZE = 50;

function CollectionDetailView({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<CollectionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expandedCardRef = useRef<HTMLDivElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchCollection(slug, PAGE_SIZE, 0);
      setDetail(data);
    } catch (err) {
      if (err instanceof Error && err.message.toLowerCase().includes("not found")) {
        setError("Collection not found");
      } else {
        setError(err instanceof Error ? err.message : "Failed to load");
      }
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const bookmarks = detail?.bookmarks ?? [];
  const handleOpen = useCallback(
    (index: number) => {
      const b = bookmarks[index];
      if (b) window.open(tweetUrl(b.author_handle, b.tweet_id), "_blank", "noopener,noreferrer");
    },
    [bookmarks],
  );
  const { selectedIndex } = useListKeyboardNav({ itemCount: bookmarks.length, onOpen: handleOpen });

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border bg-background p-6 pb-4">
        <button
          type="button"
          onClick={() => navigate("/collections")}
          className="mb-3 flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> All collections
        </button>
        <h1 className="text-2xl font-bold text-foreground">
          {detail?.name || (isLoading ? "…" : slug)}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {detail
            ? `${formatNumber(detail.total)} bookmark${detail.total === 1 ? "" : "s"}`
            : isLoading
              ? "Loading…"
              : ""}
        </p>
        {detail?.description && (
          <p className="mt-2 max-w-2xl text-sm text-body">{detail.description}</p>
        )}
      </div>

      <div ref={listContainerRef} className="min-h-0 flex-1 overflow-y-auto p-6">
        {error && <ErrorRetry message={error} onRetry={() => void load()} />}
        {!error && isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {!error && !isLoading && bookmarks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Folder className="mb-4 h-12 w-12 text-disabled" />
            <p className="text-lg text-muted">No bookmarks in this collection</p>
            <p className="mt-1 text-sm text-disabled">
              Open any bookmark and use "Add to collection" to fill it up.
            </p>
          </div>
        )}
        {bookmarks.length > 0 && (
          <div className="flex flex-col gap-4">
            {bookmarks.map((bookmark, index) => {
              const idStr = String(bookmark.id);
              return (
                <div key={idStr} data-bookmark-index={index}>
                  <BookmarkCard
                    bookmark={bookmark}
                    isExpanded={expandedId === idStr}
                    isSelected={index === selectedIndex}
                    expandedRef={expandedId === idStr ? expandedCardRef : undefined}
                    onToggle={() => setExpandedId((prev) => (prev === idStr ? null : idStr))}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
