"use client";

import { Search } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { priorityLabel } from "./planner-presentation-format";
import type { PlannerTaskOption } from "./planner-screen-model";
import styles from "./PlannerDescribeStep.module.css";

export function PlannerTaskChecklist({
  tasks,
  selectedTaskIds,
  disabled,
  onChange,
}: Readonly<{
  tasks: readonly PlannerTaskOption[];
  selectedTaskIds: readonly string[];
  disabled: boolean;
  onChange: (taskIds: string[]) => void;
}>) {
  const searchId = useId();
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
  const visibleTasks = tasks.filter(({ title }) =>
    title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  function toggle(taskId: string) {
    const next = new Set(selected);
    if (next.has(taskId)) next.delete(taskId);
    else next.add(taskId);
    onChange(tasks.filter(({ id }) => next.has(id)).map(({ id }) => id));
  }

  return (
    <fieldset className={styles.taskFieldset}>
      <legend>
        Open unscheduled tasks <span>(optional)</span>
      </legend>
      <p id={`${searchId}-help`}>Choose only the tasks the planner may inspect. {selected.size} selected.</p>
      <label className={styles.searchField} htmlFor={searchId}>
        <span>Search tasks</span>
        <span className={styles.searchInput}>
          <Search size={17} aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            value={query}
            disabled={disabled}
            aria-describedby={`${searchId}-help`}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </span>
      </label>
      <div className={styles.taskOptions} aria-live="polite">
        {visibleTasks.length === 0 ? (
          <p className={styles.taskEmpty}>
            {tasks.length === 0 ? "No open unscheduled tasks are available." : "No tasks match this search."}
          </p>
        ) : (
          visibleTasks.map((task) => {
            const inputId = `${searchId}-${task.id}`;
            return (
              <label className={styles.taskOption} htmlFor={inputId} key={task.id}>
                <input
                  id={inputId}
                  type="checkbox"
                  checked={selected.has(task.id)}
                  disabled={disabled}
                  onChange={() => toggle(task.id)}
                />
                <span>
                  <strong>{task.title}</strong>
                  <small>{priorityLabel(task.priority)}</small>
                </span>
              </label>
            );
          })
        )}
      </div>
    </fieldset>
  );
}
