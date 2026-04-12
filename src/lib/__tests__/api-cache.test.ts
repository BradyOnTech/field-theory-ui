import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getCached, setCache, clearCache } from "../api-cache";

describe("api-cache", () => {
  beforeEach(() => {
    clearCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for uncached keys", () => {
    expect(getCached("missing-key")).toBeNull();
  });

  it("returns cached data within TTL", () => {
    const data = { totalBookmarks: 100 };
    setCache("/api/stats", data);
    expect(getCached("/api/stats")).toEqual(data);
  });

  it("returns null after TTL expires", () => {
    const data = { totalBookmarks: 100 };
    setCache("/api/stats", data);

    // Advance time past the 60-second TTL
    vi.advanceTimersByTime(60_001);

    expect(getCached("/api/stats")).toBeNull();
  });

  it("returns cached data just before TTL expires", () => {
    const data = { totalBookmarks: 100 };
    setCache("/api/stats", data);

    // Advance time to exactly the TTL boundary
    vi.advanceTimersByTime(60_000);

    expect(getCached("/api/stats")).toEqual(data);
  });

  it("stores and retrieves different keys independently", () => {
    setCache("/api/stats", { a: 1 });
    setCache("/api/categories", { b: 2 });

    expect(getCached("/api/stats")).toEqual({ a: 1 });
    expect(getCached("/api/categories")).toEqual({ b: 2 });
  });

  it("overwrites existing cache entries", () => {
    setCache("/api/stats", { old: true });
    setCache("/api/stats", { new: true });

    expect(getCached("/api/stats")).toEqual({ new: true });
  });

  it("clearCache removes all entries", () => {
    setCache("/api/stats", { a: 1 });
    setCache("/api/categories", { b: 2 });
    clearCache();

    expect(getCached("/api/stats")).toBeNull();
    expect(getCached("/api/categories")).toBeNull();
  });

  it("handles array data", () => {
    const data = [{ name: "AI", count: 50 }, { name: "Web", count: 30 }];
    setCache("/api/categories", data);
    expect(getCached("/api/categories")).toEqual(data);
  });

  it("evicts oldest entry when cache exceeds max size", () => {
    // Fill cache to the 100-entry limit
    for (let i = 0; i < 100; i++) {
      setCache(`/api/key-${i}`, { index: i });
    }

    // First entry should still be cached
    expect(getCached("/api/key-0")).toEqual({ index: 0 });

    // Adding one more should evict the oldest (key-0)
    setCache("/api/key-100", { index: 100 });

    expect(getCached("/api/key-0")).toBeNull();
    expect(getCached("/api/key-1")).toEqual({ index: 1 });
    expect(getCached("/api/key-100")).toEqual({ index: 100 });
  });

  it("does not evict when overwriting an existing key", () => {
    // Fill cache to the limit
    for (let i = 0; i < 100; i++) {
      setCache(`/api/key-${i}`, { index: i });
    }

    // Overwrite an existing key -- should NOT evict
    setCache("/api/key-50", { index: 999 });

    expect(getCached("/api/key-0")).toEqual({ index: 0 });
    expect(getCached("/api/key-50")).toEqual({ index: 999 });
  });
});
