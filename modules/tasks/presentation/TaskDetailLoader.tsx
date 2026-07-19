"use client";

import { useEffect, useRef } from "react";

import { useTaskDetailQuery } from "./data/use-task-queries";
import { TaskDetailScreen } from "./TaskDetailScreen";
import styles from "./TaskDetailLoader.module.css";

export function TaskDetailLoader({
  inbox,
  onClose,
  returnHref,
  taskId,
}: Readonly<{
  inbox: { id: string; name: string };
  onClose: () => void;
  returnHref: string;
  taskId: string;
}>) {
  const focusRef = useRef<HTMLDivElement>(null);
  const query = useTaskDetailQuery(taskId);

  const loaded = Boolean(query.data);
  useEffect(() => {
    if (!loaded) focusRef.current?.focus();
    else document.getElementById(`task-title-${taskId}`)?.focus();
  }, [loaded, taskId]);

  return (
    <div className={styles.loader} ref={focusRef} tabIndex={-1}>
      {query.isPending ? (
        <TaskDetailLoading onClose={onClose} />
      ) : !query.data ? (
        <TaskDetailUnavailable onClose={onClose} onRetry={() => void query.refetch()} />
      ) : (
        <>
          {query.isError ? (
            <div className={styles.stale} role="status">
              <span>Showing saved task details. A fresh copy could not be loaded.</span>
              <button className="secondary-button" type="button" onClick={() => void query.refetch()}>
                Try again
              </button>
            </div>
          ) : null}
          <TaskDetailScreen
            task={query.data}
            mode="inspector"
            inbox={inbox}
            onClose={onClose}
            returnHref={returnHref}
            showRefreshError={false}
          />
        </>
      )}
    </div>
  );
}

export function TaskDetailLoading({ onClose }: Readonly<{ onClose: () => void }>) {
  return (
    <div className={styles.state} aria-busy="true">
      <header>
        <button className="quiet-button" type="button" onClick={onClose}>
          Close
        </button>
      </header>
      <p role="status">Loading task details…</p>
      <div className={styles.skeleton} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export function TaskDetailUnavailable({
  onClose,
  onRetry,
}: Readonly<{ onClose: () => void; onRetry: () => void }>) {
  return (
    <div className={styles.state}>
      <header>
        <button className="quiet-button" type="button" onClick={onClose}>
          Close
        </button>
      </header>
      <div className={styles.message} role="alert">
        <h2>Task unavailable</h2>
        <p>This task could not be found or you may not have access.</p>
        <button className="secondary-button" type="button" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}
