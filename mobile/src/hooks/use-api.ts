import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, apiRequest } from '@/lib/api';
import { useSession } from '@/lib/session';

// One hook that every "load something from the server" screen uses.
//
//   const { data, error, loading, refreshing, reload, retry } = useApi<StudentProfile>('/api/student/profiles/me/');
//
// loading    = first load in progress (show a spinner)
// refreshing = the user pulled down to refresh (keep showing the old data)
// error      = something went wrong (show a message and a Try again button)
export function useApi<T>(path: string) {
  const { accessToken } = useSession();

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // If two loads overlap, only the newest one may write its result.
  const latest = useRef(0);

  const load = useCallback(
    async (isRefresh: boolean) => {
      const id = ++latest.current;
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const result = await apiRequest<T>(path, { token: accessToken });
        if (id === latest.current) {
          setData(result);
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

  // Load when the screen opens (and again if the path changes).
  useEffect(() => {
    load(false);
  }, [load]);

  // useCallback keeps the SAME function between renders, so a screen can safely put reload in an effect.
  const reload = useCallback(() => load(true), [load]); // for pull to refresh
  const retry = useCallback(() => load(false), [load]); // for the Try again button

  return { data, error, loading, refreshing, reload, retry };
}
