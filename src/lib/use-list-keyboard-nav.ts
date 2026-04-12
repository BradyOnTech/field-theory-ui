import { useEffect, useState, useCallback } from "react";
import { isInputFocused } from "@/lib/utils";

interface UseListKeyboardNavOptions {
  itemCount: number;
  onOpen?: (index: number) => void;
}

export function useListKeyboardNav({
  itemCount,
  onOpen,
}: UseListKeyboardNavOptions) {
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Reset selection when item count changes (e.g., filter changes)
  useEffect(() => {
    setSelectedIndex(-1);
  }, [itemCount]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Suppress j/k/o in input fields
      if (isInputFocused()) return;

      const key = e.key;

      if (key === "j") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          if (itemCount === 0) return -1;
          if (prev === -1) return 0;
          return Math.min(prev + 1, itemCount - 1);
        });
        return;
      }

      if (key === "k") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          if (itemCount === 0) return -1;
          if (prev <= 0) return 0;
          return prev - 1;
        });
        return;
      }

      if (key === "o") {
        if (selectedIndex >= 0 && onOpen) {
          e.preventDefault();
          onOpen(selectedIndex);
        }
        return;
      }
    },
    [itemCount, selectedIndex, onOpen],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { selectedIndex, setSelectedIndex };
}
