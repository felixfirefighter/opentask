"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

import type { SectionDto, TaskListItemDto } from "../application/contracts";
import { SortableTaskSection } from "./SortableTaskSection";
import { TaskList } from "./TaskList";
import { SectionActions } from "./TaskSectionControls";
import sectionStyles from "./TaskSectionControls.module.css";
import { TaskSectionSortContext } from "./TaskSectionSortContext";
import type { InboxReference } from "./TaskWorkspaceScreen";
import styles from "./TaskWorkspaceScreen.module.css";

export function WorkspaceTaskList({
  dndId,
  inbox,
  tasks,
  terminal = false,
  reorderable = false,
  timeZone,
}: Readonly<{
  dndId?: string;
  inbox: InboxReference;
  tasks: TaskListItemDto[];
  terminal?: boolean;
  reorderable?: boolean;
  timeZone?: string;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const selectedTaskId = useSearchParams().get("task");
  function openTask(task: TaskListItemDto, event: MouseEvent<HTMLAnchorElement>) {
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    event.preventDefault();
    router.replace(`${pathname}?task=${task.id}`, { scroll: false });
  }
  return (
    <TaskList
      tasks={tasks}
      dndId={dndId}
      inbox={inbox}
      terminal={terminal}
      timeZone={timeZone}
      reorderable={reorderable}
      selectedTaskId={selectedTaskId}
      onOpenTask={openTask}
    />
  );
}

export function TaskGroups({
  groups,
  inbox,
}: Readonly<{ groups: ReturnType<typeof taskGroups>; inbox: InboxReference }>) {
  const sections = groups.flatMap((group) => (group.section ? [group.section] : []));
  const content = (
    <div className={styles.groups}>
      {groups.map((group) => {
        const sectionIndex = group.section ? sections.indexOf(group.section) : -1;
        const previousSection = sections[sectionIndex - 1];
        const nextSection = sections[sectionIndex + 1];
        const labelledBy = `task-group-${group.id}`;
        const groupContent = (dragHandle?: ReactNode) => (
          <>
            <header>
              <h2 id={labelledBy}>{group.name}</h2>
              {group.section ? (
                <div className={sectionStyles.sectionMeta}>
                  <span>{group.tasks.length}</span>
                  {dragHandle}
                  <SectionActions
                    listId={group.section.listId}
                    section={group.section}
                    taskCount={group.tasks.length}
                    {...(previousSection ? { previousSection } : {})}
                    {...(nextSection ? { nextSection } : {})}
                  />
                </div>
              ) : (
                <span>{group.tasks.length}</span>
              )}
            </header>
            <WorkspaceTaskList
              dndId={group.id}
              tasks={group.tasks}
              inbox={inbox}
              reorderable={group.reorderable}
            />
          </>
        );
        return group.section ? (
          <SortableTaskSection
            className={styles.group}
            key={group.id}
            labelledBy={labelledBy}
            section={group.section}
          >
            {groupContent}
          </SortableTaskSection>
        ) : (
          <section className={styles.group} key={group.id} aria-labelledby={labelledBy}>
            {groupContent()}
          </section>
        );
      })}
    </div>
  );
  if (sections.length === 0) return content;
  return (
    <TaskSectionSortContext listId={sections[0]!.listId} sections={sections}>
      {content}
    </TaskSectionSortContext>
  );
}

type TaskGroup = Readonly<{
  id: string;
  name: string;
  reorderable: boolean;
  section: SectionDto | null;
  tasks: TaskListItemDto[];
}>;

export function sectionFallbackTaskGroups(tasks: TaskListItemDto[]): TaskGroup[] {
  return [
    {
      id: "section-metadata-unavailable",
      name: "Section grouping unavailable",
      reorderable: false,
      section: null,
      tasks,
    },
  ];
}

export function taskGroups(tasks: TaskListItemDto[], sections: readonly SectionDto[]): TaskGroup[] {
  if (sections.length === 0) return [{ id: "all", name: "Tasks", reorderable: true, section: null, tasks }];
  const groups: TaskGroup[] = sections.map((section) => ({
    id: section.id,
    name: section.name,
    reorderable: true,
    section,
    tasks: tasks.filter((task) => task.sectionId === section.id),
  }));
  const unsectioned = tasks.filter((task) => task.sectionId === null);
  const knownSectionIds = new Set(sections.map((section) => section.id));
  const unmatched = tasks.filter((task) => task.sectionId !== null && !knownSectionIds.has(task.sectionId));
  return [
    ...(unsectioned.length > 0
      ? [{ id: "unsectioned", name: "No section", reorderable: true, section: null, tasks: unsectioned }]
      : []),
    ...groups,
    ...(unmatched.length > 0
      ? [
          {
            id: "other-sections",
            name: "Other sections",
            reorderable: false,
            section: null,
            tasks: unmatched,
          },
        ]
      : []),
  ];
}

export function TaskEmpty({
  title,
  action = true,
  disabled = false,
}: Readonly<{ title: string; action?: boolean; disabled?: boolean }>) {
  return (
    <div className={styles.empty}>
      <h2>{title}</h2>
      <p>
        {action
          ? disabled
            ? "Reconnect to add a task."
            : "Add a task when you are ready to capture the next step."
          : "Completed and cancelled work will appear here."}
      </p>
      {action && (
        <button
          className="secondary-button"
          type="button"
          disabled={disabled}
          title={disabled ? "Reconnect to add a task" : undefined}
          onClick={focusQuickAdd}
        >
          Add a task
        </button>
      )}
    </div>
  );
}

export function TaskLoadError({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return (
    <div className={styles.empty} data-state="error" role="alert">
      <h2>Tasks could not be loaded</h2>
      <p>Your data was not changed. Try loading this view again.</p>
      <button className="secondary-button" type="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function TaskListSkeleton() {
  return (
    <div className={styles.skeleton} aria-busy="true">
      <p role="status">Loading tasks…</p>
      {[0, 1, 2, 3].map((row) => (
        <span key={row} aria-hidden="true" />
      ))}
    </div>
  );
}

function focusQuickAdd() {
  document.querySelector<HTMLInputElement>("[data-quick-add-input]")?.focus();
}
