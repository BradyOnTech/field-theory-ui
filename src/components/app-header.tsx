import { Github, RefreshCw } from "lucide-react";

const GITHUB_URL = "https://github.com/Gitmaxd/field-theory-ui";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex h-8 w-9 items-end justify-center rounded-[6px] bg-foreground pb-[5px] text-background ring-1 ring-inset ring-background/20">
        <span className="text-base font-bold leading-none tracking-tight">Ft</span>
        <span className="absolute right-[5px] top-[3px] text-[7px] font-medium leading-none">ui</span>
      </div>
      <span className={compact ? "text-sm font-semibold text-foreground" : "text-lg font-semibold text-foreground"}>
        Field Theory UI
      </span>
    </div>
  );
}

export function AppHeader({ onSync }: { onSync?: () => void }) {
  return (
    <>
      <header className="hidden items-center justify-between border-b border-border bg-card px-5 py-4 lg:flex">
        <BrandMark />

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-badge bg-surface px-2.5 py-1 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Open Source
          </span>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-disabled transition-colors hover:text-foreground"
            title="View on GitHub"
          >
            <Github className="h-4 w-4" />
          </a>
        </div>
      </header>

      <header className="flex items-center justify-between border-b border-border bg-card px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] lg:hidden">
        <BrandMark compact />
        {onSync && (
          <button
            type="button"
            onClick={onSync}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-button text-muted transition-colors hover:text-foreground"
            aria-label="Sync bookmarks"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      </header>
    </>
  );
}
