"use client";

import { useOnlineStatus } from "@/shared/presentation";

import type { RegularListDto, TaskPage } from "../application/contracts";
import { combineTerminalTasks } from "./data/task-page-view";
import { useSectionsQuery } from "./data/use-organizer-queries";
import { useTaskListQuery, useTerminalTaskQuery } from "./data/use-task-queries";
import { FirstRunOrientation } from "./FirstRunOrientation";
import { TaskQuickAdd } from "./TaskQuickAdd";
import { CreateSectionControl } from "./TaskSectionControls";
import { TerminalTaskGroups } from "./TerminalTaskGroups";
import {
  TaskEmpty,
  TaskGroups,
  TaskListSkeleton,
  TaskLoadError,
  sectionFallbackTaskGroups,
  taskGroups,
} from "./TaskWorkspaceContent";
import { WorkspaceLayout } from "./TaskWorkspaceLayout";
import styles from "./TaskWorkspaceScreen.module.css";

export type InboxReference = Readonly<{ id: string; name: string }>;
type ListReference = Pick<RegularListDto, "id" | "name"> & Partial<Pick<RegularListDto, "colorToken">>;

export type TaskWorkspaceDestination =
  | Readonly<{
      kind: "list";
      list: ListReference;
      inbox?: InboxReference;
      immutableInbox?: boolean;
      initialTasks?: TaskPage;
      timeZone: string;
      hourCycle: "h12" | "h23";
    }>
  | Readonly<{
      kind: "terminal";
      inbox?: InboxReference;
      initialCompleted: TaskPage;
      initialCancelled: TaskPage;
      timeZone: string;
    }>;

export function TaskWorkspaceScreen({ destination }: Readonly<{ destination: TaskWorkspaceDestination }>) {
  return destination.kind === "list" ? (
    <OpenTaskWorkspace destination={destination} />
  ) : (
    <TerminalTaskWorkspace destination={destination} />
  );
}

function OpenTaskWorkspace({
  destination,
}: Readonly<{ destination: Extract<TaskWorkspaceDestination, { kind: "list" }> }>) {
  const online = useOnlineStatus();
  const query = useTaskListQuery(destination.list.id, destination.initialTasks);
  const isInbox = destination.immutableInbox || destination.inbox?.id === destination.list.id;
  const sectionsQuery = useSectionsQuery(destination.list.id, !isInbox);
  const inbox = destination.inbox ?? { id: destination.list.id, name: "Inbox" };
  const sectionsPending = !isInbox && sectionsQuery.isPending;
  const sectionsUnavailable = !isInbox && sectionsQuery.isError && sectionsQuery.sections.length === 0;
  const useSectionFallback =
    !isInbox &&
    sectionsQuery.sections.length === 0 &&
    query.tasks.length > 0 &&
    (sectionsQuery.isPending || sectionsQuery.isError);
  const groups = useSectionFallback
    ? sectionFallbackTaskGroups(query.tasks)
    : taskGroups(query.tasks, sectionsQuery.sections);
  const waitingWithoutTaskRows = sectionsPending && query.tasks.length === 0;

  return (
    <WorkspaceLayout
      title={destination.list.name}
      timeZone={destination.timeZone}
      taskCount={query.tasks.length}
      inbox={inbox}
      loading={query.isPending || waitingWithoutTaskRows}
      error={query.isError || sectionsQuery.isError}
      staleMessage={workspaceStaleMessage(query.isError, sectionsQuery.isError, sectionsUnavailable)}
      onRetry={() => {
        void query.refetch();
        if (!isInbox) void sectionsQuery.refetch();
      }}
      showAddTask
    >
      {isInbox ? <FirstRunOrientation inboxId={inbox.id} /> : null}
      <TaskQuickAdd
        hourCycle={destination.hourCycle}
        listId={destination.list.id}
        listName={destination.list.name}
        timeZone={destination.timeZone}
      />
      {!isInbox && <CreateSectionControl listId={destination.list.id} />}
      {useSectionFallback && sectionsQuery.isPending ? (
        <p className={styles.partialDataNotice} role="status">
          Sections are still loading. Tasks are temporarily shown without section grouping.
        </p>
      ) : null}
      {query.isPending || waitingWithoutTaskRows ? (
        <TaskListSkeleton />
      ) : query.isError && query.tasks.length === 0 ? (
        <TaskLoadError
          onRetry={() => {
            void query.refetch();
            if (!isInbox) void sectionsQuery.refetch();
          }}
        />
      ) : query.tasks.length === 0 && sectionsQuery.sections.length === 0 ? (
        <TaskEmpty title={isInbox ? "Inbox is empty" : "No tasks in this list"} disabled={!online} />
      ) : (
        <TaskGroups groups={groups} inbox={inbox} />
      )}
      {!isInbox && sectionsQuery.hasNextPage ? (
        <button
          className={styles.loadMore}
          type="button"
          disabled={sectionsQuery.isFetchingNextPage}
          onClick={() => void sectionsQuery.fetchNextPage()}
        >
          {sectionsQuery.isFetchingNextPage ? "Loading…" : "Load more sections"}
        </button>
      ) : null}
      {query.hasNextPage && (
        <button
          className={styles.loadMore}
          type="button"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more tasks"}
        </button>
      )}
    </WorkspaceLayout>
  );
}

function workspaceStaleMessage(tasksFailed: boolean, sectionsFailed: boolean, sectionsUnavailable: boolean) {
  if (tasksFailed && sectionsFailed)
    return "Tasks and sections could not be refreshed. Available rows remain below.";
  if (sectionsUnavailable)
    return "Sections could not be refreshed. Tasks are shown without section grouping.";
  if (sectionsFailed) return "Sections could not be refreshed. Loaded section groups remain available.";
  return "Tasks could not be refreshed. Loaded rows remain available.";
}

function TerminalTaskWorkspace({
  destination,
}: Readonly<{ destination: Extract<TaskWorkspaceDestination, { kind: "terminal" }> }>) {
  const completed = useTerminalTaskQuery("completed", destination.initialCompleted);
  const cancelled = useTerminalTaskQuery("cancelled", destination.initialCancelled);
  const tasks = combineTerminalTasks(completed.tasks, cancelled.tasks);
  const inbox = destination.inbox ?? { id: "00000000-0000-4000-8000-000000000000", name: "Inbox" };
  const pending = completed.isPending || cancelled.isPending;
  const failed = completed.isError || cancelled.isError;

  return (
    <WorkspaceLayout
      title="Completed / cancelled"
      timeZone={destination.timeZone}
      taskCount={tasks.length}
      inbox={inbox}
      loading={pending}
      error={failed}
      onRetry={() => {
        void completed.refetch();
        void cancelled.refetch();
      }}
    >
      {pending ? (
        <TaskListSkeleton />
      ) : failed && tasks.length === 0 ? (
        <TaskLoadError
          onRetry={() => {
            void completed.refetch();
            void cancelled.refetch();
          }}
        />
      ) : tasks.length === 0 ? (
        <TaskEmpty title="No completed or cancelled tasks" action={false} />
      ) : (
        <TerminalTaskGroups tasks={tasks} inbox={inbox} timeZone={destination.timeZone} />
      )}
      {(completed.hasNextPage || cancelled.hasNextPage) && (
        <button
          className={styles.loadMore}
          type="button"
          disabled={completed.isFetchingNextPage || cancelled.isFetchingNextPage}
          onClick={() => {
            if (completed.hasNextPage) void completed.fetchNextPage();
            if (cancelled.hasNextPage) void cancelled.fetchNextPage();
          }}
        >
          Load older tasks
        </button>
      )}
    </WorkspaceLayout>
  );
}
