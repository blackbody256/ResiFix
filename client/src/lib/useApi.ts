// Small data-loading hook for screens: const { data, error, loading, reload } = useApi(path)
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';

export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get<T>(path)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  const reload = useCallback(() => {
    setLoading(true);
    setVersion((v) => v + 1);
  }, []);
  return { data, error, loading, reload };
}
