interface SparklineTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  /** "default" uses muted date + bold count; "observatory" uses foreground date + regular count */
  variant?: "default" | "observatory";
}

export function SparklineTooltip({
  active,
  payload,
  label,
  variant = "default",
}: SparklineTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const value = payload[0]?.value;
  if (value == null) return null;

  const isObservatory = variant === "observatory";

  return (
    <div className="rounded-card border border-border bg-card px-3 py-2 shadow-lg">
      <p className={isObservatory ? "text-sm text-foreground" : "text-xs text-muted"}>
        {label}
      </p>
      <p
        className={
          isObservatory
            ? "font-mono text-sm text-foreground"
            : "font-mono text-sm font-bold text-foreground"
        }
      >
        {value} bookmarks
      </p>
    </div>
  );
}
