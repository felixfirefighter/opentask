import type { PlannerAction } from "../application/contracts";

import { priorityLabel, scheduleLabel } from "./planner-presentation-format";

export function actionSummary(action: PlannerAction): Readonly<{ before: string; after: string }> {
  if (action.kind === "create") {
    return {
      before: "No existing task",
      after: `${action.after.title} · ${priorityLabel(action.after.priority)} · ${scheduleLabel(
        action.after.schedule,
      )}`,
    };
  }
  if (action.kind === "update") {
    return {
      before: describeTaskText(action.before),
      after: describeTaskText(action.after),
    };
  }
  if (action.kind === "prioritize") {
    return { before: priorityLabel(action.before), after: priorityLabel(action.after) };
  }
  if (action.kind === "schedule") {
    return { before: scheduleLabel(action.before), after: scheduleLabel(action.after) };
  }
  return { before: "Proposed work", after: "Keep unscheduled for now" };
}

function describeTaskText(task: Readonly<{ title: string; descriptionMd: string }>): string {
  const description = task.descriptionMd.trim();
  return description.length === 0 ? task.title : `${task.title} — ${description}`;
}
