"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { ColorToken, TagDto } from "../../application/contracts";
import { expectedVersionForRetry } from "./expected-version-for-retry";
import { createTag, deleteTag, getTag, restoreTag, updateTag } from "./tag-api-client";
import { taskQueryKeys } from "./task-query-keys";

export function useCreateTagMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      resourceId,
      name,
      colorToken,
    }: {
      resourceId: string;
      name: string;
      colorToken: ColorToken;
    }) => createTag(resourceId, { name, colorToken }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: taskQueryKeys.tags() }),
  });
}

export function useUpdateTagMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tag, name, colorToken }: { tag: TagDto; name: string; colorToken: ColorToken }) =>
      updateTag(tag.id, {
        expectedVersion: tag.version,
        patch: { name, colorToken },
      }),
    onSettled: () => invalidateTags(queryClient),
  });
}

export function useDeleteTagMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tag: TagDto) => deleteTag(tag.id, tag.version),
    onSuccess: (deleted) => {
      void invalidateTags(queryClient);
      toast.success("Tag deleted", {
        action: {
          label: "Undo",
          onClick: () => void restoreDeletedTag(queryClient, deleted, deleted.version),
        },
      });
    },
  });
}

async function restoreDeletedTag(
  queryClient: ReturnType<typeof useQueryClient>,
  tag: Awaited<ReturnType<typeof deleteTag>>,
  expectedVersion: number,
) {
  try {
    await restoreTag(tag.id, expectedVersion);
  } catch (error) {
    const activeTag = await getTag(tag.id).catch(() => null);
    await invalidateTags(queryClient).catch(() => undefined);
    if (activeTag) {
      toast.success("Tag restored");
      return;
    }
    const retryVersion = expectedVersionForRetry(error, expectedVersion);
    toast.error("Tag could not be restored", {
      description: "The tag list was refreshed. You can retry the restore safely.",
      action: {
        label: "Retry",
        onClick: () => void restoreDeletedTag(queryClient, tag, retryVersion),
      },
    });
    return;
  }
  await invalidateTags(queryClient).catch(() => undefined);
  toast.success("Tag restored");
}

async function invalidateTags(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: taskQueryKeys.tags() }),
    queryClient.invalidateQueries({ queryKey: taskQueryKeys.listRoot() }),
    queryClient.invalidateQueries({ queryKey: taskQueryKeys.terminalRoot() }),
    queryClient.invalidateQueries({ queryKey: taskQueryKeys.searchRoot() }),
    queryClient.invalidateQueries({ queryKey: ["tasks", "detail"] }),
  ]);
}
