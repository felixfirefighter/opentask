"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { Placement, SectionDto } from "../../application/contracts";
import { createSection, deleteSection, positionSection, updateSection } from "./organizer-api-client";
import { taskQueryKeys } from "./task-query-keys";

type RenameSectionVariables = Readonly<{
  name: string;
  section: SectionDto;
}>;

type PositionSectionVariables = Readonly<{
  placement: Placement;
  section: SectionDto;
}>;

export function useSectionMutations(listId: string) {
  const queryClient = useQueryClient();
  const refreshSections = () => queryClient.invalidateQueries({ queryKey: taskQueryKeys.sections(listId) });

  const createMutation = useMutation({
    mutationFn: ({ name, resourceId }: { name: string; resourceId: string }) =>
      createSection(listId, resourceId, { name, placement: { kind: "end" } }),
    onSettled: refreshSections,
  });
  const renameMutation = useMutation({
    mutationFn: ({ name, section }: RenameSectionVariables) =>
      updateSection(listId, section.id, {
        expectedVersion: section.version,
        patch: { name },
      }),
    onSettled: refreshSections,
  });
  const positionMutation = useMutation({
    mutationFn: ({ placement, section }: PositionSectionVariables) =>
      positionSection(listId, section.id, {
        expectedVersion: section.version,
        placement,
      }),
    onSettled: refreshSections,
  });
  const deleteMutation = useMutation({
    mutationFn: (section: SectionDto) => deleteSection(listId, section.id, section.version),
    onSettled: async () => {
      await refreshSections();
      await queryClient.invalidateQueries({ queryKey: taskQueryKeys.list(listId) });
    },
  });

  return {
    create: createMutation,
    rename: renameMutation,
    position: positionMutation,
    remove: deleteMutation,
  };
}
