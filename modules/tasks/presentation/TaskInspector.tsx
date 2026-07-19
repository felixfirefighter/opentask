"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { KeyboardEvent } from "react";

import { useMediaQuery } from "@/shared/presentation";

import { confirmTaskDraftNavigation } from "./task-draft-guard";
import { TaskDetailLoader } from "./TaskDetailLoader";
import type { InboxReference } from "./TaskWorkspaceScreen";
import styles from "./TaskWorkspaceScreen.module.css";

export function TaskInspector({
  inbox,
  onClose,
  returnHref,
  taskId,
}: Readonly<{
  inbox: InboxReference;
  onClose: () => void;
  returnHref: string;
  taskId: string;
}>) {
  const sheet = useMediaQuery("(max-width: 1279px)");

  function requestClose() {
    if (confirmTaskDraftNavigation(taskId)) onClose();
  }

  if (sheet) {
    return (
      <Dialog.Root open onOpenChange={(open) => !open && requestClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.inspectorOverlay} />
          <Dialog.Content className={styles.inspector} aria-describedby={`task-sheet-description-${taskId}`}>
            <Dialog.Title className="sr-only">Task details</Dialog.Title>
            <Dialog.Description className="sr-only" id={`task-sheet-description-${taskId}`}>
              Review and edit this task. Close to return to the task list.
            </Dialog.Description>
            <TaskDetailLoader inbox={inbox} taskId={taskId} onClose={onClose} returnHref={returnHref} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <aside
      className={styles.inspector}
      aria-label="Task details"
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (event.key === "Escape") requestClose();
      }}
    >
      <TaskDetailLoader inbox={inbox} taskId={taskId} onClose={onClose} returnHref={returnHref} />
    </aside>
  );
}
