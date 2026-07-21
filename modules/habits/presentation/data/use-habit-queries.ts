"use client";

import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";

import type {
  HabitDetailDto,
  HabitHistoryProjection,
  HabitMonthProjection,
  HabitOverview,
  HabitOverviewPage,
  HabitTodayProjection,
} from "../../application/contracts";
import {
  getHabit,
  getHabitHistory,
  getHabitMonth,
  getHabitOverview,
  getHabitToday,
  listHabitOverviews,
} from "./habit-api-client";
import { habitQueryKeys } from "./habit-query-keys";

const HABIT_PAGE_SIZE = 50;

export function useHabitOverviewQuery(habitId: string, initialData?: HabitOverview) {
  return useQuery({
    queryKey: habitQueryKeys.overview(habitId),
    queryFn: () => getHabitOverview(habitId),
    ...(initialData ? { initialData } : {}),
  });
}

export function useHabitOverviewsInfiniteQuery(
  lifecycle: "active" | "archived",
  initialPage?: HabitOverviewPage,
) {
  const queryClient = useQueryClient();
  const queryKey = habitQueryKeys.list(lifecycle);
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      listHabitOverviews({
        lifecycle,
        limit: HABIT_PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    ...(initialPage ? { initialData: { pages: [initialPage], pageParams: [undefined] } } : {}),
  });

  return {
    ...query,
    refreshFromBeginning: () => refreshInfiniteQueryFromBeginning<HabitOverviewPage>(queryClient, queryKey),
  };
}

export function useHabitDetailQuery(habitId: string, initialData?: HabitDetailDto) {
  return useQuery({
    queryKey: habitQueryKeys.detail(habitId),
    queryFn: () => getHabit(habitId),
    ...(initialData ? { initialData } : {}),
  });
}

export function useHabitTodayInfiniteQuery(initialPage?: HabitTodayProjection) {
  const queryClient = useQueryClient();
  const queryKey = habitQueryKeys.today();
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      getHabitToday({
        limit: HABIT_PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    ...(initialPage ? { initialData: { pages: [initialPage], pageParams: [undefined] } } : {}),
  });

  return {
    ...query,
    refreshFromBeginning: () =>
      refreshInfiniteQueryFromBeginning<HabitTodayProjection>(queryClient, queryKey),
  };
}

export function useHabitMonthQuery(habitId: string, yearMonth: string, initialData?: HabitMonthProjection) {
  return useQuery({
    queryKey: habitQueryKeys.month(habitId, yearMonth),
    queryFn: () => getHabitMonth(habitId, { yearMonth }),
    ...(initialData?.yearMonth === yearMonth ? { initialData } : {}),
  });
}

export function useHabitHistoryQuery(
  habitId: string,
  startDate: string,
  endDate: string,
  initialData?: HabitHistoryProjection,
) {
  return useQuery({
    queryKey: habitQueryKeys.history(habitId, startDate, endDate),
    queryFn: () => getHabitHistory(habitId, { startDate, endDate }),
    ...(initialData?.startDate === startDate && initialData.endDate === endDate ? { initialData } : {}),
  });
}

function refreshInfiniteQueryFromBeginning<TPage>(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: readonly unknown[],
) {
  queryClient.setQueryData<InfiniteData<TPage, string | undefined>>(queryKey, (current) => {
    if (!current || current.pages.length <= 1) return current;
    return {
      pages: current.pages.slice(0, 1),
      pageParams: current.pageParams.slice(0, 1),
    };
  });
  return queryClient.refetchQueries({ queryKey, exact: true, type: "active" });
}
