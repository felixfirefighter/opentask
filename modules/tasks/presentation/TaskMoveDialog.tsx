"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useId, useMemo, useRef, useState, type FormEvent } from "react";

import { useOnlineStatus } from "@/shared/presentation";

import type { TaskDetailDto, TaskListItemDto } from "../application/contracts";
import { useRegularListsQuery, useSectionsQuery } from "./data/use-organizer-queries";
import { useMoveTaskMutation } from "./data/use-task-organization-mutations";
import { confirmTaskDraftNavigation, useTaskDraftGuard } from "./task-draft-guard";
import { useTaskConflictRecovery } from "./use-task-conflict-recovery";
import styles from "./TaskMoveDialog.module.css";

type InboxOption = Readonly<{ id: string; name: string }>;

export function TaskMoveDialog({
  inbox,
  onOpenChange,
  open,
  task,
}: Readonly<{
  inbox: InboxOption;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  task: TaskListItemDto | TaskDetailDto;
}>) {
  const listInputId = useId();
  const sectionInputId = useId();
  const [listId, setListId] = useState(task.listId);
  const [sectionId, setSectionId] = useState(task.sectionId ?? "");
  const listsQuery = useRegularListsQuery();
  const sectionsQuery = useSectionsQuery(listId, listId !== inbox.id);
  const move = useMoveTaskMutation();
  const online = useOnlineStatus();
  const listRef = useRef<HTMLSelectElement>(null);
  const recovery = useTaskConflictRecovery(task, move.error);
  const authoritativeTask = recovery.conflict ? recovery.latestTask : task;
  const destinationChanged = listId !== task.listId || (sectionId || null) !== task.sectionId;
  useTaskDraftGuard(task.id, "move", open && (destinationChanged || move.isPending || move.isError));
  const lists = useMemo(() => {
    const options = [inbox, ...listsQuery.lists.filter((list) => list.id !== inbox.id)];
    const requiredIds = new Set([task.listId, authoritativeTask.listId]);
    for (const requiredId of requiredIds) {
      if (!options.some((list) => list.id === requiredId)) {
        options.push({ id: requiredId, name: "Current list" });
      }
    }
    return options;
  }, [authoritativeTask.listId, inbox, listsQuery.lists, task.listId]);

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && move.isPending) return;
    if (!nextOpen && !confirmTaskDraftNavigation(task.id, "move")) return;
    onOpenChange(nextOpen);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!online || move.isPending || (recovery.conflict && !recovery.latestReady)) return;
    try {
      await move.mutateAsync({
        task: authoritativeTask,
        input: {
          expectedVersion: authoritativeTask.version,
          listId,
          sectionId: sectionId || null,
          parentTaskId: null,
          placement: { kind: "end" },
        },
      });
      onOpenChange(false);
    } catch {
      // Keep the chosen destination visible and show the mutation error below.
    }
  }

  const errorMessage = move.error
    ? recovery.conflict
      ? "This task changed elsewhere. Review the latest version before moving it."
      : "The task was not moved. Your selection is unchanged."
    : null;

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content} aria-describedby="move-task-description">
          <header className={styles.header}>
            <div>
              <Dialog.Title>Move task</Dialog.Title>
              <Dialog.Description id="move-task-description">
                Choose a list and optional section for “{task.title}”.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="icon-button"
                type="button"
                disabled={move.isPending}
                aria-label="Close move task dialog"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>

          <form className={styles.form} onSubmit={submit}>
            <label htmlFor={listInputId}>List</label>
            <select
              ref={listRef}
              id={listInputId}
              value={listId}
              onChange={(event) => {
                setListId(event.target.value);
                setSectionId("");
              }}
              disabled={!online || move.isPending || listsQuery.isPending}
            >
              {lists.map((list) => (
                <option value={list.id} key={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
            {listsQuery.hasNextPage ? (
              <button
                className={styles.loadMore}
                type="button"
                disabled={!online || move.isPending || listsQuery.isFetchingNextPage}
                onClick={() => void listsQuery.fetchNextPage()}
              >
                {listsQuery.isFetchingNextPage ? "Loading…" : "Load more lists"}
              </button>
            ) : null}

            <label htmlFor={sectionInputId}>Section</label>
            <select
              id={sectionInputId}
              value={sectionId}
              onChange={(event) => setSectionId(event.target.value)}
              disabled={!online || move.isPending || listId === inbox.id || sectionsQuery.isPending}
            >
              <option value="">No section</option>
              {sectionId && !sectionsQuery.sections.some((section) => section.id === sectionId) ? (
                <option value={sectionId}>Current section</option>
              ) : null}
              {sectionsQuery.sections.map((section) => (
                <option value={section.id} key={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
            {sectionsQuery.hasNextPage ? (
              <button
                className={styles.loadMore}
                type="button"
                disabled={!online || move.isPending || sectionsQuery.isFetchingNextPage}
                onClick={() => void sectionsQuery.fetchNextPage()}
              >
                {sectionsQuery.isFetchingNextPage ? "Loading…" : "Load more sections"}
              </button>
            ) : null}

            {!online && <p className={styles.explanation}>Reconnect to move this task.</p>}
            {listsQuery.isError ? (
              <p className={styles.error} role="alert">
                Lists could not be loaded. Close this dialog and try again.
              </p>
            ) : null}
            {sectionsQuery.isError && listId !== inbox.id ? (
              <p className={styles.error} role="alert">
                Some sections could not be loaded. Your current selection is preserved.
              </p>
            ) : null}
            {errorMessage ? (
              <div className={styles.error} role="alert">
                <p>{errorMessage}</p>
                {recovery.conflict ? (
                  <p>
                    {recovery.latestReady
                      ? `Your destination: ${locationLabel(lists, sectionsQuery.sections, listId, sectionId || null)}. Latest saved location: ${locationLabel(lists, sectionsQuery.sections, recovery.latestTask.listId, recovery.latestTask.sectionId)}.`
                      : recovery.loadingLatest
                        ? "Loading the latest saved location…"
                        : "The latest saved location could not be loaded."}
                  </p>
                ) : null}
                {recovery.conflict ? (
                  <div className={styles.recoveryActions}>
                    <button
                      className="quiet-button"
                      type="button"
                      disabled={!recovery.latestReady}
                      onClick={() => {
                        setListId(recovery.latestTask.listId);
                        setSectionId(recovery.latestTask.sectionId ?? "");
                        move.reset();
                      }}
                    >
                      Use latest
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => listRef.current?.focus()}
                    >
                      Keep editing
                    </button>
                    {recovery.latestUnavailable ? (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void recovery.refetchLatest()}
                      >
                        Refresh latest
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <footer className={styles.actions}>
              <Dialog.Close asChild>
                <button className="secondary-button" type="button" disabled={move.isPending}>
                  Cancel
                </button>
              </Dialog.Close>
              <button
                className="primary-button"
                type="submit"
                disabled={!online || move.isPending || (recovery.conflict && !recovery.latestReady)}
              >
                {move.isPending ? "Moving…" : recovery.conflict ? "Try again" : "Move task"}
              </button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function locationLabel(
  lists: readonly InboxOption[],
  sections: readonly { id: string; name: string }[],
  listId: string,
  sectionId: string | null,
) {
  const listName = lists.find((list) => list.id === listId)?.name ?? "Current list";
  const sectionName = sectionId
    ? (sections.find((section) => section.id === sectionId)?.name ?? "Current section")
    : "No section";
  return `${listName} · ${sectionName}`;
}
