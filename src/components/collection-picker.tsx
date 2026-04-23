import { useEffect, useRef, useState } from "react";
import { Check, Plus, Loader2 } from "lucide-react";
import { useCollections } from "@/lib/use-collections";
import type { CollectionMembership } from "@/lib/types";

interface CollectionPickerProps {
  bookmarkId: string;
  initialMemberships: CollectionMembership[];
  onClose: () => void;
  onMembershipsChange?: (memberships: CollectionMembership[]) => void;
}

export function CollectionPicker({
  bookmarkId,
  initialMemberships,
  onClose,
  onMembershipsChange,
}: CollectionPickerProps) {
  const { collections, isLoading, create, addTo, removeFrom } = useCollections();
  const [memberships, setMemberships] = useState<CollectionMembership[]>(initialMemberships);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click / Esc
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const updateMemberships = (next: CollectionMembership[]) => {
    setMemberships(next);
    onMembershipsChange?.(next);
  };

  const markPending = (slug: string, on: boolean) => {
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(slug);
      else next.delete(slug);
      return next;
    });
  };

  const handleToggle = async (slug: string, name: string, color: string) => {
    const isMember = memberships.some((m) => m.slug === slug);
    markPending(slug, true);
    setError(null);
    try {
      if (isMember) {
        await removeFrom(slug, [bookmarkId]);
        updateMemberships(memberships.filter((m) => m.slug !== slug));
      } else {
        await addTo(slug, [bookmarkId]);
        updateMemberships([...memberships, { slug, name, color }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      markPending(slug, false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setIsCreating(true);
    setError(null);
    try {
      const created = await create({ name });
      await addTo(created.slug, [bookmarkId]);
      updateMemberships([
        ...memberships,
        { slug: created.slug, name: created.name, color: created.color || "" },
      ]);
      setNewName("");
      newInputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setIsCreating(false);
    }
  };

  const memberSlugs = new Set(memberships.map((m) => m.slug));

  return (
    <div
      ref={containerRef}
      className="absolute left-0 top-full z-40 mt-2 w-72 rounded-card border border-border bg-card shadow-lg"
      onClick={(e) => e.stopPropagation()}
      role="dialog"
    >
      <div className="border-b border-border px-3 py-2 text-xs font-medium text-muted">
        Add to collection
      </div>

      <div className="max-h-64 overflow-y-auto py-1">
        {isLoading && collections.length === 0 && (
          <div className="flex items-center justify-center py-4 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </div>
        )}
        {!isLoading && collections.length === 0 && (
          <div className="px-3 py-3 text-xs text-muted">
            No collections yet. Create one below.
          </div>
        )}
        {collections.map((c) => {
          const isMember = memberSlugs.has(c.slug);
          const isPending = pending.has(c.slug);
          return (
            <button
              key={c.slug}
              type="button"
              disabled={isPending}
              onClick={() => void handleToggle(c.slug, c.name, c.color || "")}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-surface disabled:opacity-60"
            >
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border"
                style={isMember && c.color ? { backgroundColor: c.color, borderColor: c.color } : undefined}
              >
                {isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin text-muted" />
                ) : isMember ? (
                  <Check className="h-3 w-3 text-white" />
                ) : null}
              </span>
              <span className="flex-1 truncate">{c.name}</span>
              <span className="font-mono text-[10px] text-disabled">{c.bookmark_count}</span>
            </button>
          );
        })}
      </div>

      <form onSubmit={(e) => void handleCreate(e)} className="border-t border-border p-2">
        <div className="flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5 shrink-0 text-muted" />
          <input
            ref={newInputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New collection…"
            disabled={isCreating}
            className="flex-1 rounded-button bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-disabled focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!newName.trim() || isCreating}
            className="rounded-button border border-border px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create"}
          </button>
        </div>
      </form>

      {error && (
        <div className="border-t border-border px-3 py-2 text-xs text-red-400">{error}</div>
      )}
    </div>
  );
}
