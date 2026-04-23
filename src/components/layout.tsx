import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useKeyboardShortcuts } from "@/lib/use-keyboard-shortcuts";
import { KeyboardHelpOverlay } from "@/components/keyboard-help-overlay";
import { SyncDialog } from "@/components/sync-dialog";
import { ErrorBoundary } from "@/components/error-boundary";
import { AppHeader } from "@/components/app-header";

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

export function Layout() {
  const { isHelpOpen, setIsHelpOpen } = useKeyboardShortcuts();
  const [isSyncOpen, setIsSyncOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top header — visible on lg+ */}
      <AppHeader />

      <div className="flex flex-1 overflow-hidden">
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

      {/* Main content — full width on mobile/tablet, with sidebar space on lg+ */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-16 lg:pb-0">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      </div>

      {/* Bottom navigation — visible on < lg (below 1024px) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-border bg-background lg:hidden">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-xs transition-colors",
                isActive
                  ? "text-foreground"
                  : "text-muted",
              )
            }
          >
            <item.icon className="h-5 w-5" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Keyboard shortcuts help overlay */}
      {isHelpOpen && (
        <KeyboardHelpOverlay onClose={() => setIsHelpOpen(false)} />
      )}

      {/* Sync & Classify dialog */}
      {isSyncOpen && (
        <SyncDialog onClose={() => setIsSyncOpen(false)} />
      )}
    </div>
  );
}
