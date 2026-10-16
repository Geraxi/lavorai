"use client";

import { useCallback, useEffect, useMemo, useReducer } from "react";
import useSWR from "swr";

/** Each list owns its cancellation scope. SWR still isolates responses by URL;
 * an obsolete filter/page request cannot overwrite or hold up the current one. */
export function useApplicationList<T>(url: string | null, refreshInterval = 0) {
  const [, render] = useReducer((value: number) => value + 1, 0);
  const scope = useMemo(() => ({ controller: null as AbortController | null, mounted: false, settled: !url }), [url]);
  useEffect(() => {
    scope.mounted = true;
    return () => {
      scope.mounted = false;
      // Strict Mode immediately replays effects; only cancel a departed scope.
      queueMicrotask(() => { if (!scope.mounted) scope.controller?.abort(); });
    };
  }, [scope]);
  const fetcher = useCallback(async (key: string): Promise<T> => {
    const controller = new AbortController();
    scope.controller = controller;
    try {
      const response = await fetch(key, { signal: controller.signal });
      if (!response.ok) throw new Error("Unable to load applications");
      return await response.json();
    } finally {
      scope.settled = true;
      if (scope.mounted) render();
    }
  }, [scope]);
  const result = useSWR<T>(url, fetcher, {
    refreshInterval, keepPreviousData: true, dedupingInterval: 0,
    // A cached page revalidates in a later animation frame. Lock navigation
    // from the key change, including that gap, until this request settles.
    revalidateOnMount: true,
    shouldRetryOnError: (error) => error.name !== "AbortError",
  });
  return { ...result, busy: !scope.settled || result.isLoading || result.isValidating };
}
