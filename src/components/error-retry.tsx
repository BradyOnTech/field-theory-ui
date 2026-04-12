export function ErrorRetry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-lg text-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 min-h-[44px] rounded-button border border-border px-4 py-2 text-sm text-muted transition-colors hover:text-foreground hover:border-[#333]"
      >
        Retry
      </button>
    </div>
  );
}
