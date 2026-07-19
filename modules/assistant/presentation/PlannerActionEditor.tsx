import type { PlannerAction, PlannerPlanningContext } from "../application/contracts";

import { PlannerScheduleEditor } from "./PlannerScheduleEditor";
import styles from "./PlannerProposalCard.module.css";

const priorities = ["none", "low", "medium", "high"] as const;

export function PlannerActionEditor({
  action,
  planningDate,
  planningContext,
  disabled,
  onChange,
}: Readonly<{
  action: PlannerAction;
  planningDate: string;
  planningContext: PlannerPlanningContext;
  disabled: boolean;
  onChange: (action: PlannerAction) => void;
}>) {
  const scheduleContext = {
    planningDate,
    timeZone: planningContext.timeZone,
    workWindowStart: planningContext.workWindow.start,
    defaultDurationMinutes: planningContext.defaultDurationMinutes,
  };

  if (action.kind === "defer") return null;
  if (action.kind === "prioritize") {
    return (
      <label className={styles.editorField}>
        <span>Priority after apply</span>
        <select
          value={action.after}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...action, after: event.currentTarget.value as typeof action.after })
          }
        >
          {priorities.map((priority) => (
            <option key={priority} value={priority}>
              {priority === "none" ? "No priority" : `${priority[0]!.toUpperCase()}${priority.slice(1)}`}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (action.kind === "schedule") {
    return (
      <PlannerScheduleEditor
        schedule={action.after}
        context={scheduleContext}
        allowNone={false}
        disabled={disabled}
        onChange={(schedule) => {
          if (schedule) onChange({ ...action, after: schedule });
        }}
      />
    );
  }

  if (action.kind === "update") {
    return <TaskTextEditor action={action} disabled={disabled} onChange={onChange} />;
  }

  return (
    <CreateActionEditor
      action={action}
      scheduleContext={scheduleContext}
      disabled={disabled}
      onChange={onChange}
    />
  );
}

function TaskTextEditor({
  action,
  disabled,
  onChange,
}: Readonly<{
  action: Extract<PlannerAction, { kind: "update" }>;
  disabled: boolean;
  onChange: (action: PlannerAction) => void;
}>) {
  return (
    <div className={styles.editorFields}>
      <TaskTextFields
        title={action.after.title}
        descriptionMd={action.after.descriptionMd}
        disabled={disabled}
        onTitleChange={(title) => onChange({ ...action, after: { ...action.after, title } })}
        onDescriptionChange={(descriptionMd) =>
          onChange({ ...action, after: { ...action.after, descriptionMd } })
        }
      />
    </div>
  );
}

function CreateActionEditor({
  action,
  scheduleContext,
  disabled,
  onChange,
}: Readonly<{
  action: Extract<PlannerAction, { kind: "create" }>;
  scheduleContext: Readonly<{
    planningDate: string;
    timeZone: string;
    workWindowStart: string;
    defaultDurationMinutes: number;
  }>;
  disabled: boolean;
  onChange: (action: PlannerAction) => void;
}>) {
  return (
    <div className={styles.editorFields}>
      <TaskTextFields
        title={action.after.title}
        descriptionMd={action.after.descriptionMd}
        disabled={disabled}
        onTitleChange={(title) => onChange({ ...action, after: { ...action.after, title } })}
        onDescriptionChange={(descriptionMd) =>
          onChange({ ...action, after: { ...action.after, descriptionMd } })
        }
      />
      <label className={styles.editorField}>
        <span>Priority after apply</span>
        <select
          value={action.after.priority}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...action,
              after: { ...action.after, priority: event.currentTarget.value as typeof action.after.priority },
            })
          }
        >
          {priorities.map((priority) => (
            <option key={priority} value={priority}>
              {priority === "none" ? "No priority" : `${priority[0]!.toUpperCase()}${priority.slice(1)}`}
            </option>
          ))}
        </select>
      </label>
      <PlannerScheduleEditor
        schedule={action.after.schedule}
        context={scheduleContext}
        allowNone
        disabled={disabled}
        onChange={(schedule) => onChange({ ...action, after: { ...action.after, schedule } })}
      />
    </div>
  );
}

function TaskTextFields({
  title,
  descriptionMd,
  disabled,
  onTitleChange,
  onDescriptionChange,
}: Readonly<{
  title: string;
  descriptionMd: string;
  disabled: boolean;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (descriptionMd: string) => void;
}>) {
  return (
    <>
      <label className={styles.editorField}>
        <span>Title after apply</span>
        <input
          value={title}
          maxLength={500}
          disabled={disabled}
          onChange={(event) => onTitleChange(event.currentTarget.value)}
        />
      </label>
      <label className={styles.editorField}>
        <span>Description after apply</span>
        <textarea
          rows={3}
          maxLength={20_000}
          value={descriptionMd}
          disabled={disabled}
          onChange={(event) => onDescriptionChange(event.currentTarget.value)}
        />
      </label>
    </>
  );
}
