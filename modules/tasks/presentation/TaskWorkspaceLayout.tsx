"use client";

import { Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { useOnlineStatus } from "@/shared/presentation";

import { TaskInspector } from "./TaskInspector";
import type { InboxReference } from "./TaskWorkspaceScreen";
import styles from "./TaskWorkspaceScreen.module.css";

export function WorkspaceLayout({
  children,
  error,
  inbox,
  loading,
  onRetry,
  showAddTask = false,
  staleMessage,
  taskCount,
  timeZone,
  title,
}: Readonly<{
  children: ReactNode;
  error: boolean;
  inbox: InboxReference;
  loading: boolean;
  onRetry: () => void;
  showAddTask?: boolean;
  staleMessage?: string;
  taskCount: number;
  timeZone: string;
  title: string;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const selectedTaskId = useSearchParams().get("task");
  const online = useOnlineStatus();

  function closeInspector() {
    const previous = selectedTaskId;
    router.replace(pathname, { scroll: false });
    if (!previous) return;
    requestAnimationFrame(() => {
      const safeId = typeof globalThis.CSS === "undefined" ? previous : CSS.escape(previous);
      const row = document.querySelector<HTMLElement>(`[data-task-id="${safeId}"] a`);
      (row ?? document.getElementById("task-workspace-heading"))?.focus();
    });
  }

  return (
    <div className={styles.workspace} data-inspector={Boolean(selectedTaskId)}>
      <section className={styles.content} aria-labelledby="task-workspace-heading">
        <div className={styles.inner}>
          <header className={styles.pageHeader}>
            <div>
              <h1 id="task-workspace-heading" tabIndex={-1} data-route-focus>
                {title}
              </h1>
              <p>
                {loading ? "Loading tasks" : `${taskCount} ${taskCount === 1 ? "task" : "tasks"}`}
                {!online ? " · offline" : ""}
              </p>
            </div>
            {showAddTask && (
              <button className="primary-button" type="button" disabled={!online} onClick={focusQuickAdd}>
                <Plus size={17} aria-hidden="true" /> Add task
              </button>
            )}
          </header>
          {error && taskCount > 0 && (
            <div className={styles.staleBanner} role="alert">
              {staleMessage ?? "Tasks could not be refreshed. Loaded rows remain available."}{" "}
              <button type="button" onClick={onRetry}>
                Try again
              </button>
            </div>
          )}
          {children}
        </div>
      </section>
      {selectedTaskId && (
        <TaskInspector
          inbox={inbox}
          taskId={selectedTaskId}
          onClose={closeInspector}
          returnHref={pathname}
          timeZone={timeZone}
        />
      )}
    </div>
  );
}

function focusQuickAdd() {
  document.querySelector<HTMLInputElement>("[data-quick-add-input]")?.focus();
}
