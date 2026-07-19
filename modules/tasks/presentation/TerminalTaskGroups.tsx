"use client";

import type { TaskListItemDto, TaskStatus } from "../application/contracts";
import { WorkspaceTaskList } from "./TaskWorkspaceContent";
import type { InboxReference } from "./TaskWorkspaceScreen";
import styles from "./TaskWorkspaceScreen.module.css";

export function TerminalTaskGroups({
  inbox,
  tasks,
  timeZone,
}: Readonly<{ inbox: InboxReference; tasks: TaskListItemDto[]; timeZone: string }>) {
  return (
    <div className={styles.groups}>
      {terminalTaskGroups(tasks, timeZone).map((group) => (
        <section className={styles.group} key={group.id} aria-labelledby={`terminal-group-${group.id}`}>
          <header>
            <h2 id={`terminal-group-${group.id}`}>{group.name}</h2>
            <span>{group.tasks.length}</span>
          </header>
          <WorkspaceTaskList
            dndId={`terminal-${group.id}`}
            tasks={group.tasks}
            inbox={inbox}
            terminal
            timeZone={timeZone}
          />
        </section>
      ))}
    </div>
  );
}

export function terminalTaskGroups(tasks: TaskListItemDto[], timeZone: string) {
  const groups = new Map<string, { id: string; name: string; tasks: TaskListItemDto[] }>();
  for (const status of ["completed", "cancelled"] as const) {
    for (const task of tasks.filter((candidate) => candidate.status === status)) {
      const dateKey = localDateKey(task.statusChangedAt, timeZone);
      const id = `${status}-${dateKey}`;
      const existing = groups.get(id);
      if (existing) existing.tasks.push(task);
      else
        groups.set(id, {
          id,
          name: terminalGroupName(status, task.statusChangedAt, timeZone),
          tasks: [task],
        });
    }
  }
  return [...groups.values()];
}

function terminalGroupName(status: Exclude<TaskStatus, "open">, instant: string, timeZone: string) {
  const statusLabel = status === "completed" ? "Completed" : "Cancelled";
  const date = new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeZone }).format(new Date(instant));
  return `${statusLabel} · ${date}`;
}

function localDateKey(instant: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
