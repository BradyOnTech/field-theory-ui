const CACHE_TTL_MS = 60_000; // 60 seconds
const MAX_CACHE_SIZE = 100;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache(key: string, data: unknown): void {
  // Evict oldest entry (first key in Map = FIFO) if at capacity
  if (!cache.has(key) && cache.size >= MAX_CACHE_SIZE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, { data, timestamp: Date.now() });
}

/** Clear all cached entries. Useful for testing. */
export function clearCache(): void {
  cache.clear();
}

/** Drop any cached entry whose key contains the given substring. */
export function invalidateByPrefix(substring: string): void {
  for (const key of cache.keys()) {
    if (key.includes(substring)) cache.delete(key);
  }
}
