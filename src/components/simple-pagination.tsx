import { ChevronLeft, ChevronRight } from "lucide-react";

interface SimplePaginationProps {
  /** Current page (1-indexed) */
  page: number;
  /** Total number of pages */
  totalPages: number;
  /** Called when the page changes (receives 1-indexed page number) */
  onPageChange: (page: number) => void;
  /**
   * "simple" renders Previous/Next buttons with a page indicator (default).
   * "numbered" renders Previous/Next with clickable numbered page buttons.
   */
  variant?: "numbered" | "simple";
}

function NumberedPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  // Compute visible page numbers
  const pages: number[] = [];
  const maxVisible = 7;
  let start = Math.max(1, page - Math.floor(maxVisible / 2));
  const end = Math.min(totalPages, start + maxVisible - 1);
  start = Math.max(1, end - maxVisible + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="flex min-h-[44px] items-center gap-1 rounded-button border border-border bg-card px-3 py-2 text-sm text-muted transition-colors hover:bg-card/80 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPageChange(p)}
          className={`flex h-11 w-11 items-center justify-center rounded-button text-sm font-mono transition-colors ${
            p === page
              ? "bg-foreground text-background font-bold"
              : "border border-border bg-card text-muted hover:bg-card/80"
          }`}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className="flex min-h-[44px] items-center gap-1 rounded-button border border-border bg-card px-3 py-2 text-sm text-muted transition-colors hover:bg-card/80 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function SimpleNavPagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="min-h-[36px] rounded-button border border-border px-3 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="min-h-[36px] rounded-button border border-border px-3 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function SimplePagination({
  page,
  totalPages,
  onPageChange,
  variant = "simple",
}: SimplePaginationProps) {
  if (totalPages <= 1) return null;

  if (variant === "numbered") {
    return (
      <div className="mt-4">
        <NumberedPagination
          page={page}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      </div>
    );
  }

  return (
    <div className="mt-4">
      <SimpleNavPagination
        page={page}
        totalPages={totalPages}
        onPageChange={onPageChange}
      />
    </div>
  );
}
