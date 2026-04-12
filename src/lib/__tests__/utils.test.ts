import { describe, it, expect } from "vitest";
import { parseTwitterDate, timeAgo, truncateText, formatNumber, cn } from "../utils";

describe("parseTwitterDate", () => {
  it("parses standard Twitter date format", () => {
    const result = parseTwitterDate("Mon Apr 06 15:40:46 +0000 2026");
    expect(result).toBeInstanceOf(Date);
    expect(result).not.toBeNull();
    expect(result!.getUTCFullYear()).toBe(2026);
    expect(result!.getUTCMonth()).toBe(3); // April is 3 (zero-indexed)
    expect(result!.getUTCDate()).toBe(6);
    expect(result!.getUTCHours()).toBe(15);
    expect(result!.getUTCMinutes()).toBe(40);
    expect(result!.getUTCSeconds()).toBe(46);
  });

  it("handles different months correctly", () => {
    const result = parseTwitterDate("Wed Oct 10 20:19:24 +0000 2018");
    expect(result).toBeInstanceOf(Date);
    expect(result!.getUTCMonth()).toBe(9); // October
    expect(result!.getUTCFullYear()).toBe(2018);
  });

  it("handles timezone offsets", () => {
    const utcResult = parseTwitterDate("Mon Apr 06 12:00:00 +0000 2026");
    const offsetResult = parseTwitterDate("Mon Apr 06 12:00:00 -0500 2026");
    expect(utcResult).not.toBeNull();
    expect(offsetResult).not.toBeNull();
    // -0500 means local time is 5 hours behind UTC, so the UTC time should be 17:00
    expect(offsetResult!.getUTCHours()).toBe(17);
  });

  it("returns null for empty string", () => {
    expect(parseTwitterDate("")).toBeNull();
  });

  it("returns null for null-like input", () => {
    expect(parseTwitterDate(null as unknown as string)).toBeNull();
    expect(parseTwitterDate(undefined as unknown as string)).toBeNull();
  });

  it("returns null for invalid format", () => {
    expect(parseTwitterDate("not a date")).toBeNull();
    expect(parseTwitterDate("not a date at all")).toBeNull();
  });

  it("returns null for invalid month", () => {
    expect(parseTwitterDate("Mon Xyz 06 15:40:46 +0000 2026")).toBeNull();
  });

  it("returns a valid Date object (not NaN)", () => {
    const result = parseTwitterDate("Mon Apr 06 15:40:46 +0000 2026");
    expect(result).not.toBeNull();
    expect(isNaN(result!.getTime())).toBe(false);
  });

  it("parses ISO 8601 date format", () => {
    const result = parseTwitterDate("2026-04-06T15:40:46.000Z");
    expect(result).toBeInstanceOf(Date);
    expect(result).not.toBeNull();
    expect(result!.getUTCFullYear()).toBe(2026);
    expect(result!.getUTCMonth()).toBe(3);
    expect(result!.getUTCDate()).toBe(6);
    expect(result!.getUTCHours()).toBe(15);
    expect(result!.getUTCMinutes()).toBe(40);
    expect(result!.getUTCSeconds()).toBe(46);
  });

  it("parses ISO 8601 date-only format", () => {
    const result = parseTwitterDate("2026-04-06");
    expect(result).toBeInstanceOf(Date);
    expect(result).not.toBeNull();
    expect(result!.getUTCFullYear()).toBe(2026);
    expect(result!.getUTCMonth()).toBe(3);
    expect(result!.getUTCDate()).toBe(6);
  });

  it("parses ISO 8601 with timezone offset", () => {
    const result = parseTwitterDate("2026-04-06T12:00:00-05:00");
    expect(result).toBeInstanceOf(Date);
    expect(result).not.toBeNull();
    expect(result!.getUTCHours()).toBe(17);
  });

  it("handles both formats producing equivalent results", () => {
    const twitterResult = parseTwitterDate("Mon Apr 06 15:40:46 +0000 2026");
    const isoResult = parseTwitterDate("2026-04-06T15:40:46.000Z");
    expect(twitterResult).not.toBeNull();
    expect(isoResult).not.toBeNull();
    expect(twitterResult!.getTime()).toBe(isoResult!.getTime());
  });
});

describe("truncateText", () => {
  it("returns original text if shorter than max", () => {
    expect(truncateText("hello", 10)).toBe("hello");
  });

  it("truncates and adds ellipsis", () => {
    expect(truncateText("hello world", 5)).toBe("hello…");
  });

  it("handles exact length", () => {
    expect(truncateText("hello", 5)).toBe("hello");
  });
});

describe("formatNumber", () => {
  it("formats numbers with commas", () => {
    expect(formatNumber(4221)).toBe("4,221");
    expect(formatNumber(1394)).toBe("1,394");
    expect(formatNumber(42)).toBe("42");
    expect(formatNumber(1000000)).toBe("1,000,000");
  });
});

describe("timeAgo", () => {
  it("returns 'just now' for recent dates", () => {
    const now = new Date();
    expect(timeAgo(now)).toBe("just now");
  });

  it("returns minutes ago", () => {
    const date = new Date(Date.now() - 5 * 60 * 1000);
    expect(timeAgo(date)).toBe("5m ago");
  });

  it("returns hours ago", () => {
    const date = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(timeAgo(date)).toBe("3h ago");
  });

  it("returns days ago", () => {
    const date = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    expect(timeAgo(date)).toBe("2d ago");
  });
});

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "extra")).toBe("base extra");
  });

  it("merges conflicting tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
