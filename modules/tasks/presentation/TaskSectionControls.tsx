"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal, Plus } from "lucide-react";
import { useId, useRef, useState } from "react";

import { useOnlineStatus } from "@/shared/presentation/useOnlineStatus";

import type { SectionDto } from "../application/contracts";
import { isTaskApiError } from "./data/task-api-request";
import { useSectionMutations } from "./data/use-section-mutations";
import styles from "./TaskSectionControls.module.css";
import { SectionDeleteDialog, SectionNameDialog } from "./TaskSectionDialogs";

export function CreateSectionControl({ listId }: Readonly<{ listId: string }>) {
  const online = useOnlineStatus();
  const { create } = useSectionMutations(listId);
  const [open, setOpen] = useState(false);
  const createDraft = useRef<{ name: string; resourceId: string } | null>(null);
  const statusId = useId();
  const changeOpen = (nextOpen: boolean) => {
    if (nextOpen) create.reset();
    setOpen(nextOpen);
  };
  async function createSection(name: string) {
    if (createDraft.current?.name !== name) createDraft.current = { name, resourceId: crypto.randomUUID() };
    const created = await create.mutateAsync(createDraft.current);
    createDraft.current = null;
    return created;
  }
  return (
    <div className={styles.createControl}>
      <SectionNameDialog
        actionLabel="Create section"
        disabled={!online}
        mutationError={create.error}
        onSubmit={createSection}
        open={open}
        setOpen={changeOpen}
        title="Create section"
        trigger={
          <button
            aria-describedby={!online ? statusId : undefined}
            className={styles.createButton}
            disabled={!online || create.isPending}
            type="button"
          >
            <Plus size={16} aria-hidden="true" />
            Add section
          </button>
        }
      />
      {!online && (
        <span className={styles.offlineStatus} id={statusId} role="status">
          Reconnect to create sections.
        </span>
      )}
    </div>
  );
}

export function SectionActions({
  listId,
  nextSection,
  previousSection,
  section,
  taskCount,
}: Readonly<{
  listId: string;
  nextSection?: SectionDto;
  previousSection?: SectionDto;
  section: SectionDto;
  taskCount: number;
}>) {
  const online = useOnlineStatus();
  const { position, remove, rename } = useSectionMutations(listId);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const offlineDescriptionId = useId();
  const error = position.error;
  const pending = position.isPending || remove.isPending || rename.isPending;
  const sectionIsEmpty = taskCount === 0;

  function reorder(direction: "up" | "down") {
    const anchor = direction === "up" ? previousSection : nextSection;
    if (!anchor) return;
    position.mutate({
      section,
      placement:
        direction === "up" ? { kind: "before", anchorId: anchor.id } : { kind: "after", anchorId: anchor.id },
    });
  }

  return (
    <div className={styles.actionsRoot}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild disabled={!online || pending}>
          <button
            aria-describedby={!online ? offlineDescriptionId : undefined}
            aria-label={`Open actions for section ${section.name}`}
            className={styles.menuTrigger}
            title={`Open actions for section ${section.name}`}
            type="button"
          >
            <MoreHorizontal size={17} aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={styles.menu} align="end" sideOffset={4}>
            <DropdownMenu.Item
              className={styles.menuItem}
              disabled={!online || pending}
              onSelect={() => {
                rename.reset();
                setRenameOpen(true);
              }}
            >
              Rename section
            </DropdownMenu.Item>
            <DropdownMenu.Separator className={styles.separator} />
            <DropdownMenu.Item
              className={styles.menuItem}
              disabled={!online || pending || !previousSection}
              onSelect={() => reorder("up")}
            >
              Move section up
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={styles.menuItem}
              disabled={!online || pending || !nextSection}
              onSelect={() => reorder("down")}
            >
              Move section down
            </DropdownMenu.Item>
            <DropdownMenu.Separator className={styles.separator} />
            <DropdownMenu.Item
              className={`${styles.menuItem} ${styles.dangerItem}`}
              disabled={!online || pending || !sectionIsEmpty}
              onSelect={() => {
                remove.reset();
                setDeleteOpen(true);
              }}
            >
              Delete section…
            </DropdownMenu.Item>
            {!sectionIsEmpty && (
              <DropdownMenu.Label className={styles.menuExplanation}>
                Move its {taskCount === 1 ? "task" : `${taskCount} tasks`} before deleting.
              </DropdownMenu.Label>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      {!online && (
        <span className="sr-only" id={offlineDescriptionId}>
          Section changes are unavailable while offline.
        </span>
      )}
      {error && (
        <p className={styles.inlineError} role="alert">
          {isTaskApiError(error) && error.code === "CONFLICT"
            ? "This section changed elsewhere. The latest order was restored."
            : "The section was not moved. Its previous position was restored."}
        </p>
      )}
      <SectionNameDialog
        actionLabel="Rename section"
        disabled={!online}
        initialName={section.name}
        mutationError={rename.error}
        onSubmit={(name) => rename.mutateAsync({ name, section })}
        open={renameOpen}
        setOpen={(nextOpen) => {
          if (nextOpen) rename.reset();
          setRenameOpen(nextOpen);
        }}
        title="Rename section"
      />
      <SectionDeleteDialog
        disabled={!online}
        error={remove.error}
        name={section.name}
        onConfirm={() => remove.mutateAsync(section)}
        open={deleteOpen}
        setOpen={(nextOpen) => {
          if (nextOpen) remove.reset();
          setDeleteOpen(nextOpen);
        }}
      />
    </div>
  );
}
