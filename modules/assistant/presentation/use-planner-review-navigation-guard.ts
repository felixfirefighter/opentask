"use client";

import { useUnsavedNavigationGuard } from "@/shared/presentation";

const discardMessage =
  "Discard review edits? Your persisted proposal will remain available, but local edits and selections will be lost.";

export function usePlannerReviewNavigationGuard(dirty: boolean, onDiscard: () => void): void {
  useUnsavedNavigationGuard(dirty, discardMessage, onDiscard);
}
