import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { clearCache } from "../lib/api-cache";

interface SyncDialogProps {
  onClose: () => void;
}

export function SyncDialog({ onClose }: SyncDialogProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const outputRef = useRef<HTMLPreElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const scrollToBottom = useCallback(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [lines, done, scrollToBottom]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const startSync = async () => {
    setLines([]);
    setDone(false);
    setExitCode(null);
    setRunning(true);

    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();

      if (data.status === "already_running") {
        setLines(["Sync is already running..."]);
      }
    } catch (err) {
      setLines([`Failed to start sync: ${err}`]);
      setRunning(false);
      return;
    }

    const es = new EventSource("/api/sync/stream");
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.done) {
          const code = data.code ?? 1;
          setDone(true);
          setExitCode(code);
          setRunning(false);
          es.close();
          if (code === 0) {
            clearCache();
          }
          return;
        }
        if (data.line) {
          setLines((prev) => [...prev, data.line]);
        }
      } catch {
        // Ignore malformed SSE data
      }
    };

    es.onerror = () => {
      setRunning(false);
      setDone(true);
      setExitCode(1);
      es.close();
    };
  };

  const handleClose = () => {
    eventSourceRef.current?.close();
    if (exitCode === 0 && window.location.pathname !== "/oracle") {
      window.location.reload();
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={!running ? handleClose : undefined}
      />
      <div
        role="dialog"
        aria-label="Sync & Classify"
        className="relative z-10 mx-4 flex w-full max-w-xl flex-col rounded-card border border-border bg-card shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-6 py-4">
          <RefreshCw className={`h-5 w-5 text-muted ${running ? "animate-spin" : ""}`} />
          <h2 className="text-lg font-bold text-foreground">Sync & Classify</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={running}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-button text-muted transition-colors hover:bg-background hover:text-foreground disabled:opacity-30"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Output area */}
        <pre
          ref={outputRef}
          className="h-64 overflow-auto whitespace-pre-wrap break-words px-6 py-4 font-mono text-xs leading-relaxed text-muted"
        >
          {lines.length === 0 && !running && !done && (
            <span className="text-disabled">
              Click "Sync Now" to sync your X bookmarks and classify any new entries.
              {"\n\n"}This runs: ft sync --classify
            </span>
          )}
          {lines.map((line, i) => (
            <div key={i} className="text-foreground">{line}</div>
          ))}
          {done && exitCode === 0 && (
            <div className="mt-2 flex items-center gap-2 text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Sync complete
            </div>
          )}
          {done && exitCode !== null && exitCode !== 0 && (
            <div className="mt-2 flex items-center gap-2 text-error">
              <XCircle className="h-3.5 w-3.5" />
              Process exited with code {exitCode}
            </div>
          )}
        </pre>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          {done && (
            <button
              type="button"
              onClick={handleClose}
              className="rounded-button border border-border px-4 py-2 text-sm text-foreground transition-colors hover:bg-surface"
            >
              Close
            </button>
          )}
          {!done && (
            <button
              type="button"
              onClick={startSync}
              disabled={running}
              className="flex items-center gap-2 rounded-button border border-border bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
              {running ? "Syncing..." : "Sync Now"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
