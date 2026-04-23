import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { isInputFocused } from "@/lib/utils";

const VIEW_ROUTES: Record<string, string> = {
  "1": "/",
  "2": "/stream",
  "3": "/people",
  "4": "/oracle",
  "5": "/chronos",
  "6": "/forge",
  "7": "/mirror",
  "8": "/collections",
};

function isModalOpen(): boolean {
  // Check for help overlay or any element with role="dialog"
  const dialog = document.querySelector('[role="dialog"]');
  return dialog !== null;
}

function isOverlayOrDetailOpen(): boolean {
  // Check for any dialog/modal/overlay/expanded card that Escape should close
  if (document.querySelector('[role="dialog"]')) return true;
  if (document.querySelector('[data-overlay-open="true"]')) return true;
  if (document.querySelector('[data-expanded-card="true"]')) return true;
  return false;
}

const TOP_LEVEL_ROUTES = new Set([
  "/",
  "/stream",
  "/people",
  "/oracle",
  "/chronos",
  "/forge",
  "/mirror",
  "/collections",
]);

function isDetailRoute(pathname: string): boolean {
  // A detail route has more than 2 path segments (e.g., /people/LangChain → ["", "people", "LangChain"])
  // Top-level routes like /stream have at most 2 segments (["", "stream"])
  // Escape should navigate back on detail routes but be a no-op on top-level routes
  return !TOP_LEVEL_ROUTES.has(pathname);
}

export function useKeyboardShortcuts() {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const focusTimeoutRef = useRef<number | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const key = e.key;

      // Esc always works (even in inputs) — closes help overlay, blurs input, or goes back
      if (key === "Escape") {
        if (isHelpOpen) {
          setIsHelpOpen(false);
          e.preventDefault();
          return;
        }
        // If an input is focused, blur it
        if (isInputFocused()) {
          (document.activeElement as HTMLElement)?.blur();
          e.preventDefault();
          return;
        }
        // Go back if an overlay/modal/expanded card is open, OR if on a detail route
        // Escape is a no-op only on top-level view routes (/, /stream, /people, etc.)
        if (isOverlayOrDetailOpen() || isDetailRoute(location.pathname)) {
          window.history.back();
        }
        return;
      }

      // All other shortcuts are suppressed in input fields
      if (isInputFocused()) return;

      // ? toggles help overlay
      if (key === "?") {
        e.preventDefault();
        setIsHelpOpen((prev) => !prev);
        return;
      }

      // / focuses search input globally (not when modal is open)
      // If not on /stream, navigate there first, then focus search
      if (key === "/") {
        if (isModalOpen()) return;
        e.preventDefault();
        if (location.pathname !== "/stream") {
          navigate("/stream");
        }
        if (focusTimeoutRef.current !== null) {
          window.clearTimeout(focusTimeoutRef.current);
        }
        let attempts = 0;
        const tryFocus = () => {
          const input = document.getElementById("stream-search") as HTMLInputElement | null;
          if (input) {
            input.focus();
          } else if (attempts < 10) {
            attempts++;
            focusTimeoutRef.current = window.setTimeout(tryFocus, 50);
          }
        };
        tryFocus();
        return;
      }

      // Number keys 1-8 switch views (not when modal is open)
      if (key >= "1" && key <= "8") {
        if (isModalOpen()) return;
        const route = VIEW_ROUTES[key];
        if (route) {
          e.preventDefault();
          navigate(route);
        }
        return;
      }
    },
    [isHelpOpen, navigate, location.pathname],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (focusTimeoutRef.current !== null) {
        window.clearTimeout(focusTimeoutRef.current);
        focusTimeoutRef.current = null;
      }
    };
  }, [handleKeyDown]);

  return { isHelpOpen, setIsHelpOpen };
}
