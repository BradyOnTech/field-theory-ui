import { formatNumber } from "@/lib/utils";

interface HorizontalBarRowProps {
  label: string;
  value: number;
  maxValue: number;
  onClick?: () => void;
  gradient?: string;
  colorClass?: string;
  variant?: "observatory" | "profile";
}

export function HorizontalBarRow({
  label,
  value,
  maxValue,
  onClick,
  gradient,
  colorClass,
  variant = "observatory",
}: HorizontalBarRowProps) {
  const width = maxValue > 0 ? (value / maxValue) * 100 : 0;

  if (variant === "profile") {
    return (
      <div className="flex items-center gap-3">
        {onClick ? (
          <button
            type="button"
            onClick={onClick}
            className="w-28 shrink-0 cursor-pointer truncate text-left text-sm text-muted transition-colors hover:text-foreground"
          >
            {label}
          </button>
        ) : (
          <span className="w-28 shrink-0 truncate text-sm text-muted">{label}</span>
        )}
        <div className="flex flex-1 items-center gap-2">
          <div className="h-5 flex-1 rounded bg-border/30">
            <div
              className={`h-5 rounded [width:var(--bar-w)] ${gradient ? "" : colorClass}`}
              style={{ "--bar-w": `${width}%`, ...(gradient ? { background: gradient } : {}) } as React.CSSProperties}
            />
          </div>
          <span className="w-10 shrink-0 text-right font-mono text-xs text-muted">
            {value}
          </span>
        </div>
      </div>
    );
  }

  // Observatory variant (default)
  return (
    <button
      type="button"
      onClick={() => onClick?.()}
      className="flex min-h-[44px] items-center gap-3 text-left hover:opacity-80 active:opacity-70 transition-opacity"
    >
      <span className="w-24 shrink-0 truncate text-sm text-foreground">
        {label}
      </span>
      <div className="flex-1">
        <div
          className="h-5 rounded-badge [width:var(--bar-w)]"
          style={{
            "--bar-w": `${Math.max(width, 2)}%`,
            background: gradient || "linear-gradient(90deg, #6366f1, #818cf8)",
          } as React.CSSProperties}
        />
      </div>
      <span className="w-16 shrink-0 text-right font-mono text-sm text-muted">
        {formatNumber(value)}
      </span>
    </button>
  );
}
