import { useEffect } from "react";
import { Keyboard } from "lucide-react";

interface ShortcutItem {
  keys: string[];
  description: string;
}

const SHORTCUT_GROUPS: { title: string; shortcuts: ShortcutItem[] }[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["1–7"], description: "Switch between views" },
      { keys: ["/"], description: "Focus search input" },
      { keys: ["Esc"], description: "Close overlay / go back" },
    ],
  },
  {
    title: "List Navigation",
    shortcuts: [
      { keys: ["j"], description: "Move down in list" },
      { keys: ["k"], description: "Move up in list" },
      { keys: ["o"], description: "Open selected bookmark in X" },
    ],
  },
  {
    title: "General",
    shortcuts: [
      { keys: ["?"], description: "Toggle this help overlay" },
    ],
  },
];

const VIEW_MAP = [
  { key: "1", name: "Observatory" },
  { key: "2", name: "Stream" },
  { key: "3", name: "People" },
  { key: "4", name: "Chat" },
  { key: "5", name: "Chronos" },
  { key: "6", name: "Forge" },
  { key: "7", name: "Mirror" },
];

export function KeyboardHelpOverlay({
  onClose,
}: {
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        data-testid="help-overlay-backdrop"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Content */}
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        className="relative z-10 mx-4 w-full max-w-lg rounded-card border border-border bg-card p-6 shadow-2xl"
      >
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Keyboard className="h-5 w-5 text-muted" />
          <h2 className="text-lg font-bold text-foreground">
            Keyboard Shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-button text-muted hover:bg-background hover:text-foreground transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Shortcut groups */}
        <div className="space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-sm text-foreground">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key) => (
                        <kbd
                          key={key}
                          className="inline-flex min-w-[28px] items-center justify-center rounded-[4px] border border-border bg-background px-2 py-0.5 font-mono text-xs text-foreground"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* View mapping */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              View Shortcuts
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              {VIEW_MAP.map((view) => (
                <div
                  key={view.key}
                  className="flex items-center justify-between py-1"
                >
                  <span className="text-sm text-foreground">{view.name}</span>
                  <kbd className="inline-flex min-w-[28px] items-center justify-center rounded-[4px] border border-border bg-background px-2 py-0.5 font-mono text-xs text-foreground">
                    {view.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 border-t border-border pt-4 text-center text-xs text-disabled">
          Shortcuts are disabled when typing in input fields
        </div>
      </div>
    </div>
  );
}
