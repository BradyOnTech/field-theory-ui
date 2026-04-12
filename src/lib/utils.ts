import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const TWITTER_MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

/**
 * Parses a date string, supporting both Twitter format and ISO 8601.
 * Twitter: "Mon Apr 06 15:40:46 +0000 2026"
 * ISO:     "2026-04-06T15:40:46.000Z"
 * Returns a valid Date object or null if parsing fails.
 */
export function parseTwitterDate(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== "string") {
    return null;
  }

  const trimmed = dateStr.trim();

  // ISO 8601 detection: starts with YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) return date;
    return null;
  }

  // Twitter format: "Day Mon DD HH:MM:SS +ZZZZ YYYY"
  const parts = trimmed.split(/\s+/);
  if (parts.length < 6) {
    return null;
  }

  const [, monthStr, dayStr, timeStr, offsetStr, yearStr] = parts;

  if (!monthStr || !dayStr || !timeStr || !offsetStr || !yearStr) {
    return null;
  }

  const month = TWITTER_MONTHS[monthStr];
  if (month === undefined) {
    return null;
  }

  const day = parseInt(dayStr, 10);
  const year = parseInt(yearStr, 10);

  if (isNaN(day) || isNaN(year)) {
    return null;
  }

  const timeParts = timeStr.split(":");
  if (timeParts.length !== 3) {
    return null;
  }

  const [hoursStr, minutesStr, secondsStr] = timeParts;
  const hours = parseInt(hoursStr!, 10);
  const minutes = parseInt(minutesStr!, 10);
  const seconds = parseInt(secondsStr!, 10);

  if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
    return null;
  }

  // Parse timezone offset: "+0000" → 0, "-0500" → -300
  const offsetSign = offsetStr.startsWith("-") ? -1 : 1;
  const offsetHours = parseInt(offsetStr.slice(1, 3), 10);
  const offsetMinutes = parseInt(offsetStr.slice(3, 5), 10);

  if (isNaN(offsetHours) || isNaN(offsetMinutes)) {
    return null;
  }

  const totalOffsetMinutes = offsetSign * (offsetHours * 60 + offsetMinutes);

  // Create a UTC date and adjust for timezone
  const date = new Date(
    Date.UTC(year, month, day, hours, minutes, seconds) -
      totalOffsetMinutes * 60 * 1000,
  );

  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * Formats a date as a relative time string (e.g., "2h ago", "3d ago").
 */
export function timeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 4) return `${diffWeeks}w ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${diffYears}y ago`;
}

/**
 * Truncates text to a given length, adding ellipsis if needed.
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "…";
}

/**
 * Formats a number with commas (e.g., 4221 → "4,221").
 */
export function formatNumber(num: number): string {
  return num.toLocaleString("en-US");
}

export function formatDate(isoDate: string): string {
  if (!isoDate) return "—";
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function buildSearchSnippet(text: string, wordCount = 5): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, wordCount)
    .join(" ")
    .trim();
}

export function tweetUrl(handle: string, tweetId: string): string {
  return `https://x.com/${handle}/status/${tweetId}`;
}

export function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tagName = el.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }
  if ((el as HTMLElement).isContentEditable) {
    return true;
  }
  return false;
}
