import { useState } from "react";

interface AvatarImageProps {
  src: string;
  name: string;
  className?: string;
}

export function AvatarImage({ src, name, className }: AvatarImageProps) {
  const [hasError, setHasError] = useState(false);
  const initial = name.charAt(0).toUpperCase() || "?";

  // Determine text size based on avatar size class
  // h-20 → text-2xl, h-14 → text-lg, default (h-10) → text-sm
  const sizeClass = className ?? "h-10 w-10";
  const textSize = sizeClass.includes("h-20")
    ? "text-2xl"
    : sizeClass.includes("h-14")
      ? "text-lg"
      : "text-sm";

  if (!src || hasError) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-full bg-surface font-bold text-muted ${textSize} ${sizeClass}`}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      className={`shrink-0 rounded-full object-cover ${sizeClass}`}
      onError={() => setHasError(true)}
    />
  );
}
