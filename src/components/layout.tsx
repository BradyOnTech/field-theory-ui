import { useState } from "react";
import { NavLink, useLocation, Outlet } from "react-router-dom";
import {
  Telescope,
  Radio,
  Users,
  MessageCircle,
  Clock,
  Hammer,
  ScanEye,
  FolderOpen,
  Github,
  Keyboard,
  RefreshCw,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useKeyboardShortcuts } from "@/lib/use-keyboard-shortcuts";
import { KeyboardHelpOverlay } from "@/components/keyboard-help-overlay";
import { SyncDialog } from "@/components/sync-dialog";
import { ErrorBoundary } from "@/components/error-boundary";
import { AppHeader } from "@/components/app-header";
import { BottomSheet } from "@/components/bottom-sheet";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Observatory", icon: Telescope, shortcut: "1" },
  { to: "/stream", label: "Stream", icon: Radio, shortcut: "2" },
  { to: "/people", label: "People", icon: Users, shortcut: "3" },
  { to: "/oracle", label: "Chat", icon: MessageCircle, shortcut: "4" },
  { to: "/chronos", label: "Chronos", icon: Clock, shortcut: "5" },
  { to: "/forge", label: "Forge", icon: Hammer, shortcut: "6" },
  { to: "/mirror", label: "Mirror", icon: ScanEye, shortcut: "7" },
  { to: "/collections", label: "Collections", icon: FolderOpen, shortcut: "8" },
];

const PRIMARY_TABS = NAV_ITEMS.filter((item) =>
  ["/stream", "/oracle", "/people", "/collections"].includes(item.to),
);

const MORE_ITEMS = NAV_ITEMS.filter((item) =>
  ["/", "/chronos", "/forge", "/mirror"].includes(item.to),
);

function isMoreRoute(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/chronos") ||
    pathname.startsWith("/forge") ||
    pathname.startsWith("/mirror")
  );
}

export function Layout() {
  const { isHelpOpen, setIsHelpOpen } = useKeyboardShortcuts();
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const location = useLocation();
  const moreActive = isMoreRoute(location.pathname);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <AppHeader onSync={() => setIsSyncOpen(true)} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Sidebar — visible on lg+ (1024px+) */}
      <nav className="hidden w-56 flex-col border-r border-border bg-card lg:flex">
        <div className="flex flex-1 flex-col gap-1 p-2">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex min-h-[44px] items-center gap-3 rounded-button px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-surface text-foreground"
                    : "text-muted hover:bg-surface hover:text-foreground",
                )
              }
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
              <kbd className="ml-auto flex h-5 w-5 items-center justify-center rounded border border-border font-mono text-[11px] text-disabled">
                {item.shortcut}
              </kbd>
            </NavLink>
          ))}
        </div>
        <div className="flex flex-col gap-1.5 px-4 pb-2">
          <button
            type="button"
            onClick={() => setIsSyncOpen(true)}
            className="flex w-full items-center gap-2 text-[11px] text-disabled transition-colors hover:text-muted"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Sync bookmarks</span>
          </button>
          <button
            type="button"
            onClick={() => setIsHelpOpen(true)}
            className="flex w-full items-center gap-2 text-[11px] text-disabled transition-colors hover:text-muted"
          >
            <Keyboard className="h-3 w-3" />
            <span>Keyboard shortcuts</span>
            <kbd className="ml-auto flex h-4 w-4 items-center justify-center rounded border border-border font-mono text-[10px]">
              ?
            </kbd>
          </button>
        </div>
        <div className="border-t border-border px-4 py-3">
          <p className="text-xs text-disabled">Built by @GitMaxd</p>
          <div className="mt-1.5 flex items-center gap-3">
            <a
              href="https://x.com/GitMaxd"
              target="_blank"
              rel="noopener noreferrer"
              className="text-disabled transition-colors hover:text-foreground"
              title="@GitMaxd on X"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a
              href="https://github.com/GitMaxd"
              target="_blank"
              rel="noopener noreferrer"
              className="text-disabled transition-colors hover:text-foreground"
              title="GitMaxd on GitHub"
            >
              <Github className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-background pb-[env(safe-area-inset-bottom)] lg:hidden">
        {PRIMARY_TABS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] leading-tight transition-colors",
                isActive
                  ? "text-foreground"
                  : "text-muted",
              )
            }
          >
            <item.icon className="h-5 w-5" />
            <span className="truncate px-0.5">{item.label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          onClick={() => setIsMoreOpen(true)}
          className={cn(
            "flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] leading-tight transition-colors",
            moreActive ? "text-foreground" : "text-muted",
          )}
          aria-label="More"
        >
          <MoreHorizontal className="h-5 w-5" />
          <span>More</span>
        </button>
      </nav>

      {isMoreOpen && (
        <BottomSheet title="More" onClose={() => setIsMoreOpen(false)}>
          <div className="flex flex-col gap-1 pb-2">
            {MORE_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setIsMoreOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-[48px] items-center gap-3 rounded-button px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-surface text-foreground"
                      : "text-muted hover:bg-surface hover:text-foreground",
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            ))}
            <button
              type="button"
              onClick={() => {
                setIsMoreOpen(false);
                setIsSyncOpen(true);
              }}
              className="flex min-h-[48px] items-center gap-3 rounded-button px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Sync bookmarks</span>
            </button>
          </div>
        </BottomSheet>
      )}

      {isHelpOpen && (
        <KeyboardHelpOverlay onClose={() => setIsHelpOpen(false)} />
      )}

      {isSyncOpen && (
        <SyncDialog onClose={() => setIsSyncOpen(false)} />
      )}
    </div>
  );
}
