"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";

import type { ColorToken, TagDto, TaskDetailDto } from "../application/contracts";
import { COLOR_TOKEN_OPTIONS } from "./color-token-options";
import { useCreateTagMutation } from "./data/use-tag-mutations";
import { useTagsQuery } from "./data/use-organizer-queries";
import { useReplaceTaskTagsMutation } from "./data/use-task-organization-mutations";
import styles from "./TaskTagDialog.module.css";
import { TaskTagSelectionList } from "./TaskTagSelectionList";
import { confirmTaskDraftNavigation, useTaskDraftGuard } from "./task-draft-guard";
import { useTaskConflictRecovery } from "./use-task-conflict-recovery";

export function TaskTagDialog({
  disabled,
  onOpenChange,
  open,
  task,
}: Readonly<{
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  task: TaskDetailDto;
}>) {
  const tagsQuery = useTagsQuery();
  const replace = useReplaceTaskTagsMutation();
  const create = useCreateTagMutation();
  const [selectedIds, setSelectedIds] = useState(() => new Set(task.tags.map((tag) => tag.id)));
  const [createdTags, setCreatedTags] = useState<TagDto[]>([]);
  const [name, setName] = useState("");
  const [colorToken, setColorToken] = useState<ColorToken>("slate");
  const draftTagId = useRef<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const recovery = useTaskConflictRecovery(task, replace.error);
  const authoritativeTask = recovery.conflict ? recovery.latestTask : task;
  const writePending = create.isPending || replace.isPending;
  const conflictReady = recovery.latestReady && tagsQuery.isSuccess && !tagsQuery.isFetching;
  const availableTags = useMemo(() => {
    const tags = new Map(task.tags.map((tag) => [tag.id, tag]));
    for (const tag of recovery.latestTask.tags) tags.set(tag.id, tag);
    for (const tag of tagsQuery.tags) tags.set(tag.id, tag);
    for (const tag of createdTags) tags.set(tag.id, tag);
    return [...tags.values()];
  }, [createdTags, recovery.latestTask.tags, tagsQuery.tags, task.tags]);
  const selectedChanged =
    selectedIds.size !== task.tags.length || task.tags.some((tag) => !selectedIds.has(tag.id));
  useTaskDraftGuard(
    task.id,
    "tags",
    open &&
      (selectedChanged || Boolean(name.trim()) || replace.isPending || replace.isError || create.isPending),
  );

  function changeOpen(nextOpen: boolean) {
    if (!nextOpen && writePending) return;
    if (!nextOpen && !confirmTaskDraftNavigation(task.id, "tags")) return;
    onOpenChange(nextOpen);
  }

  async function save(force = false) {
    if (disabled || writePending || (recovery.conflict && (!force || !conflictReady))) {
      return;
    }
    const selected = availableTags.filter((tag) => selectedIds.has(tag.id));
    try {
      await replace.mutateAsync({ task: authoritativeTask, tags: selected });
      onOpenChange(false);
    } catch {
      // Keep the selection visible for conflict recovery.
    }
  }

  async function addTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || writePending) return;
    try {
      draftTagId.current ??= crypto.randomUUID();
      const tag = await create.mutateAsync({ resourceId: draftTagId.current, name: cleanName, colorToken });
      setCreatedTags((current) => [...current, tag]);
      setSelectedIds((current) => new Set([...current, tag.id]));
      draftTagId.current = null;
      setName("");
    } catch {
      // Keep the draft and show the scoped error.
    }
  }

  const conflict = recovery.conflict;
  const selectedNames = availableTags
    .filter((tag) => selectedIds.has(tag.id))
    .map((tag) => tag.name)
    .join(", ");
  const latestNames = recovery.latestTask.tags.map((tag) => tag.name).join(", ");
  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.dialog} aria-describedby="tag-dialog-description">
          <header className={styles.header}>
            <div>
              <Dialog.Title>Tags</Dialog.Title>
              <Dialog.Description id="tag-dialog-description">
                Select tags for this task or manage your tag library.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="icon-button"
                type="button"
                disabled={writePending}
                aria-label="Close tags dialog"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>

          <div className={styles.tagList} aria-label="Available tags">
            <TaskTagSelectionList
              availableTags={availableTags}
              disabled={disabled || writePending}
              error={tagsQuery.isError}
              fetchingNextPage={tagsQuery.isFetchingNextPage}
              hasNextPage={tagsQuery.hasNextPage}
              loading={tagsQuery.isPending}
              onCheckedChange={(tag, checked) =>
                setSelectedIds((current) => {
                  const next = new Set(current);
                  if (checked) next.add(tag.id);
                  else next.delete(tag.id);
                  return next;
                })
              }
              onDeleted={(tagId) => {
                setCreatedTags((current) => current.filter((tag) => tag.id !== tagId));
                setSelectedIds((current) => {
                  const next = new Set(current);
                  next.delete(tagId);
                  return next;
                });
              }}
              onLoadMore={() => void tagsQuery.fetchNextPage()}
              selectedIds={selectedIds}
            />
          </div>

          <form className={styles.createForm} onSubmit={addTag}>
            <label htmlFor="new-tag-name">New tag</label>
            <div>
              <input
                ref={nameInputRef}
                id="new-tag-name"
                value={name}
                maxLength={120}
                placeholder="Tag name"
                onChange={(event) => {
                  if (writePending) return;
                  setName(event.target.value);
                  draftTagId.current = null;
                  create.reset();
                }}
                disabled={disabled || writePending}
              />
              <select
                aria-label="New tag color"
                value={colorToken}
                onChange={(event) => {
                  if (writePending) return;
                  setColorToken(event.target.value as ColorToken);
                  draftTagId.current = null;
                  create.reset();
                }}
                disabled={disabled || writePending}
              >
                {COLOR_TOKEN_OPTIONS.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                className="secondary-button"
                type="submit"
                disabled={disabled || writePending || !name.trim()}
              >
                <Plus size={16} aria-hidden="true" /> Add
              </button>
            </div>
          </form>

          {(replace.error || create.error) && (
            <div className={styles.error} role="alert">
              <p>
                {conflict
                  ? "This task changed elsewhere. Your tag selection is preserved."
                  : "That tag change was not saved. Your selection and text are preserved."}
              </p>
              {conflict ? (
                <p>
                  {conflictReady
                    ? `Your selection: ${selectedNames || "No tags"}. Latest saved tags: ${latestNames || "No tags"}.`
                    : recovery.loadingLatest || tagsQuery.isFetching
                      ? "Loading the latest task and tags…"
                      : "The latest task or tag library could not be loaded."}
                </p>
              ) : null}
              {conflict ? (
                <div className={styles.actions}>
                  <button
                    className="quiet-button"
                    type="button"
                    disabled={!conflictReady}
                    onClick={() => {
                      setSelectedIds(new Set(recovery.latestTask.tags.map((tag) => tag.id)));
                      replace.reset();
                    }}
                  >
                    Use latest
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => nameInputRef.current?.focus()}
                  >
                    Keep editing
                  </button>
                  {!conflictReady && !recovery.loadingLatest && !tagsQuery.isFetching ? (
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        void recovery.refetchLatest();
                        void tagsQuery.refetch();
                      }}
                    >
                      Refresh latest
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
          <footer className={styles.actions}>
            <Dialog.Close asChild>
              <button className="secondary-button" type="button" disabled={writePending}>
                Cancel
              </button>
            </Dialog.Close>
            <button
              className="primary-button"
              type="button"
              disabled={disabled || writePending || (conflict && !conflictReady)}
              onClick={() => void save(conflict)}
            >
              {replace.isPending ? "Saving…" : conflict ? "Try again" : "Save tags"}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
