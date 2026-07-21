"use client";

import { useQuery } from "@tanstack/react-query";

import type { FocusHistoryPage, FocusSummary, FocusTimerSnapshot } from "../../application/contracts";
import {
  getActiveFocusSession,
  getFocusSummary,
  listRecentFocusSessions,
  searchFocusLinks,
} from "./focus-api-client";
import { focusQueryKeys } from "./focus-query-keys";

export function useActiveFocusQuery(initialData?: FocusTimerSnapshot | null) {
  return useQuery({
    queryKey: focusQueryKeys.active(),
    queryFn: getActiveFocusSession,
    ...(initialData !== undefined ? { initialData } : {}),
  });
}

export function useFocusSummaryQuery(initialData?: FocusSummary) {
  return useQuery({
    queryKey: focusQueryKeys.summary(),
    queryFn: getFocusSummary,
    ...(initialData ? { initialData } : {}),
  });
}

export function useFocusHistoryQuery(initialData?: FocusHistoryPage) {
  return useQuery({
    queryKey: focusQueryKeys.history(),
    queryFn: () => listRecentFocusSessions({ limit: 20 }),
    ...(initialData ? { initialData } : {}),
  });
}

export function useFocusLinkSearchQuery(rawQuery: string) {
  const query = rawQuery.trim();
  return useQuery({
    queryKey: focusQueryKeys.links(query),
    queryFn: () => searchFocusLinks({ q: query, limit: 20 }),
    enabled: query.length > 0 && Array.from(query).length <= 120,
    staleTime: 30_000,
  });
}
