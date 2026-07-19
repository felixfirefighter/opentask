"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { listFolders, listRegularLists, listSections } from "./organizer-api-client";
import {
  flattenFolderPages,
  flattenRegularListPages,
  flattenSectionPages,
  flattenTagPages,
} from "./organizer-page-view";
import { listTags } from "./tag-api-client";
import { taskQueryKeys } from "./task-query-keys";

export function useFoldersQuery() {
  const query = useInfiniteQuery({
    queryKey: taskQueryKeys.folders(),
    queryFn: ({ pageParam }) => listFolders(pageParam ?? undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const folders = useMemo(() => flattenFolderPages(query.data?.pages), [query.data?.pages]);

  return { ...query, folders };
}

export function useRegularListsQuery() {
  const query = useInfiniteQuery({
    queryKey: taskQueryKeys.lists(),
    queryFn: ({ pageParam }) => listRegularLists(pageParam ?? undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const lists = useMemo(() => flattenRegularListPages(query.data?.pages), [query.data?.pages]);

  return { ...query, lists };
}

export function useSectionsQuery(listId: string, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: taskQueryKeys.sections(listId),
    queryFn: ({ pageParam }) => listSections(listId, pageParam ?? undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
  });
  const sections = useMemo(() => flattenSectionPages(query.data?.pages), [query.data?.pages]);

  return { ...query, sections };
}

export function useTagsQuery() {
  const query = useInfiniteQuery({
    queryKey: taskQueryKeys.tags(),
    queryFn: ({ pageParam }) => listTags(pageParam ?? undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const tags = useMemo(() => flattenTagPages(query.data?.pages), [query.data?.pages]);

  return { ...query, tags };
}
