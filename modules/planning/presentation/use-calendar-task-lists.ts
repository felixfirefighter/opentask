"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { listPlanningTaskLists, type PlanningListOption } from "./planning-client-api";

export function useCalendarTaskLists() {
  const [lists, setLists] = useState<readonly PlanningListOption[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestSerial = useRef(0);
  const pending = useRef(false);

  const loadPage = useCallback(async (cursor?: string) => {
    if (pending.current) return;
    pending.current = true;
    const serial = ++requestSerial.current;
    setIsLoading(true);
    setError(false);
    try {
      const page = await listPlanningTaskLists(cursor);
      if (serial !== requestSerial.current) return;
      setLists((current) => (cursor ? mergeLists(current, page.items) : page.items));
      setNextCursor(page.nextCursor);
    } catch {
      if (serial === requestSerial.current) setError(true);
    } finally {
      if (serial === requestSerial.current) {
        pending.current = false;
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    pending.current = true;
    const serial = ++requestSerial.current;
    void listPlanningTaskLists()
      .then((page) => {
        if (serial !== requestSerial.current) return;
        setLists(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch(() => {
        if (serial === requestSerial.current) setError(true);
      })
      .finally(() => {
        if (serial !== requestSerial.current) return;
        pending.current = false;
        setIsLoading(false);
      });
    return () => {
      requestSerial.current += 1;
      pending.current = false;
    };
  }, []);

  return {
    lists,
    isLoading,
    error,
    hasNextPage: nextCursor !== null,
    loadMore: () => (nextCursor ? loadPage(nextCursor) : Promise.resolve()),
    retry: () => loadPage(lists.length === 0 ? undefined : (nextCursor ?? undefined)),
  } as const;
}

function mergeLists(
  current: readonly PlanningListOption[],
  incoming: readonly PlanningListOption[],
): readonly PlanningListOption[] {
  const merged = new Map(current.map((list) => [list.id, list]));
  for (const list of incoming) merged.set(list.id, list);
  return [...merged.values()];
}
