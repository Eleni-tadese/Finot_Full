import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, apiRequest, API_URL } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Paginated } from '@/lib/types';

// Like useApi, but for LISTS that the server sends in pages of 20.
//
//   const { items, loading, loadingMore, hasMore, loadMore, reload, ... } = usePaginated<ServiceEvent>('/api/service/events/');
//
// Use it with a FlatList: onEndReached={loadMore} fetches the next page when the user scrolls to the end.
export function usePaginated<T>(path: string) {
  const { accessToken } = useSession();

  const [items, setItems] = useState<T[]>([]);
  const [nextPath, setNextPath] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const latest = useRef(0); // only the newest request may write its result

  // The server gives the next page as a full address; our apiRequest wants only the part after the host.
  function toPath(next: string | null): string | null {
    if (!next) return null;
    return next.startsWith(API_URL) ? next.slice(API_URL.length) : next;
  }

  const loadFirst = useCallback(
    async (isRefresh: boolean) => {
      const id = ++latest.current;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const page = await apiRequest<Paginated<T> | T[]>(path, { token: accessToken });
        if (id !== latest.current) return;
        // Some endpoints answer with a plain list, some with a page. Accept both.
        if (Array.isArray(page)) {
          setItems(page);
          setNextPath(null);
        } else {
          setItems(page.results);
          setNextPath(toPath(page.next));
        }
      } catch (e) {
        if (id === latest.current) {
          setError(e instanceof ApiError ? e : new ApiError(0, 'Something went wrong.'));
        }
      } finally {
        if (id === latest.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [path, accessToken],
  );

  useEffect(() => {
    loadFirst(false);
  }, [loadFirst]);

  async function loadMore() {
    if (!nextPath || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const page = await apiRequest<Paginated<T>>(nextPath, { token: accessToken });
      setItems((old) => [...old, ...page.results]); // add the new rows after the old ones
      setNextPath(toPath(page.next));
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'Something went wrong.'));
    } finally {
      setLoadingMore(false);
    }
  }

  return {
    items,
    error,
    loading,
    refreshing,
    loadingMore,
    hasMore: nextPath !== null,
    loadMore,
    reload: () => loadFirst(true),
    retry: () => loadFirst(false),
  };
}
