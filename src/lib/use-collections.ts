import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchCollections,
  createCollection as apiCreate,
  addBookmarksToCollection as apiAdd,
  removeBookmarksFromCollection as apiRemove,
  deleteCollection as apiDelete,
} from "@/lib/api";
import type { Collection } from "@/lib/types";

interface UseCollectionsReturn {
  collections: Collection[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (input: { name: string; description?: string; color?: string }) => Promise<Collection>;
  addTo: (slug: string, bookmarkIds: string[]) => Promise<void>;
  removeFrom: (slug: string, bookmarkIds: string[]) => Promise<void>;
  remove: (slug: string) => Promise<void>;
}

export function useCollections(): UseCollectionsReturn {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchCollections();
      if (!aliveRef.current) return;
      setCollections(data);
      setError(null);
    } catch (err) {
      if (!aliveRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load collections");
    } finally {
      if (aliveRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    return () => {
      aliveRef.current = false;
    };
  }, [refresh]);

  const create = useCallback(
    async (input: { name: string; description?: string; color?: string }) => {
      const created = await apiCreate(input);
      await refresh();
      return created;
    },
    [refresh],
  );

  const addTo = useCallback(
    async (slug: string, bookmarkIds: string[]) => {
      await apiAdd(slug, bookmarkIds);
      await refresh();
    },
    [refresh],
  );

  const removeFrom = useCallback(
    async (slug: string, bookmarkIds: string[]) => {
      await apiRemove(slug, bookmarkIds);
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (slug: string) => {
      await apiDelete(slug);
      await refresh();
    },
    [refresh],
  );

  return { collections, isLoading, error, refresh, create, addTo, removeFrom, remove };
}
