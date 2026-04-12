import { useRef, useState, useCallback, useEffect } from "react";

const FLUSH_INTERVAL_MS = 50;

interface StreamBuffer {
  append: (text: string) => void;
  reset: () => void;
  getText: () => string;
  displayText: string;
}

export function useStreamBuffer(isActive: boolean): StreamBuffer {
  const bufferRef = useRef("");
  const pendingRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [displayText, setDisplayText] = useState("");

  const flush = useCallback(() => {
    if (pendingRef.current) {
      bufferRef.current += pendingRef.current;
      pendingRef.current = "";
    }
    setDisplayText(bufferRef.current);
    timerRef.current = null;
  }, []);

  const append = useCallback(
    (text: string) => {
      pendingRef.current += text;
      if (!timerRef.current) {
        timerRef.current = setTimeout(flush, FLUSH_INTERVAL_MS);
      }
    },
    [flush],
  );

  const reset = useCallback(() => {
    bufferRef.current = "";
    pendingRef.current = "";
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setDisplayText("");
  }, []);

  const getText = useCallback(() => {
    return bufferRef.current + pendingRef.current;
  }, []);

  useEffect(() => {
    if (!isActive && timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      if (pendingRef.current) {
        bufferRef.current += pendingRef.current;
        pendingRef.current = "";
      }
      setDisplayText(bufferRef.current);
    }
  }, [isActive]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { append, reset, getText, displayText };
}
