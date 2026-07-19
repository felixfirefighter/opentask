import type { PlannerAction, PlannerSchedule } from "../application/contracts";
import type { PlannerFailure } from "./planner-screen-model";

const priorityLabels = {
  none: "No priority",
  low: "Low priority",
  medium: "Medium priority",
  high: "High priority",
} as const;

export function actionLabel(action: PlannerAction): string {
  if (action.kind === "prioritize") return "Prioritize";
  return `${action.kind[0]!.toUpperCase()}${action.kind.slice(1)}`;
}

export function priorityLabel(priority: keyof typeof priorityLabels): string {
  return priorityLabels[priority];
}

export function scheduleLabel(schedule: PlannerSchedule | null): string {
  if (schedule === null) return "Not scheduled";
  if (schedule.kind === "all_day") {
    return `${formatDate(schedule.startDate)} through ${formatExclusiveEndDate(schedule.endDate)}`;
  }

  try {
    const formatter = new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: schedule.timeZone,
      timeZoneName: "short",
    });
    return `${formatter.format(new Date(schedule.startAt))}–${formatter.format(new Date(schedule.endAt))}`;
  } catch {
    return "Invalid scheduled time";
  }
}

export function inputWindowLabel(input: {
  planningDate: string;
  workWindow: { start: string; end: string };
  timeZone: string;
  bufferMinutes: number;
}): string {
  return `${formatDate(input.planningDate)} · ${formatLocalTime(input.workWindow.start)}–${formatLocalTime(
    input.workWindow.end,
  )} · ${input.bufferMinutes} min buffer · ${input.timeZone}`;
}

export function failureContent(failure: PlannerFailure): Readonly<{
  title: string;
  message: string;
}> {
  const content = {
    refusal: {
      title: "No proposal was returned",
      message: "The planner declined this request. Edit the input or retry. Nothing was changed.",
    },
    timeout: {
      title: "The planner took too long",
      message: "Retry when you are ready or simplify the input. Nothing was changed.",
    },
    invalid_schema: {
      title: "The response could not be validated",
      message: "The planner returned an unusable proposal. Retry or edit the input. Nothing was changed.",
    },
    provider: {
      title: "Planning is temporarily unavailable",
      message: "The AI provider could not complete this request. Retry later. Nothing was changed.",
    },
    constraint: {
      title: "The plan could not fit the constraints",
      message: "Adjust the work window, duration, or selected tasks, then create another proposal.",
    },
    input_stale: {
      title: "The selected context changed",
      message: "Review the available tasks and create the proposal again. Nothing was changed.",
    },
    stale: {
      title: "This proposal is out of date",
      message: "One or more tasks changed elsewhere. Review the latest values or create a new proposal.",
    },
    apply: {
      title: "No changes were applied",
      message: "The atomic update failed, so the complete selection was rolled back. Review and try again.",
    },
    apply_unknown: {
      title: "The apply result could not be confirmed",
      message: "Revalidate before continuing. Retrying Apply is safe because this proposal is idempotent.",
    },
    reject_unknown: {
      title: "The rejection could not be confirmed",
      message: "Revalidate to check the proposal status. No new task changes are made by rejection.",
    },
    refresh: {
      title: "The latest proposal could not be loaded",
      message: "The loaded review remains visible. Reconnect or retry before making another decision.",
    },
    permission: {
      title: "This proposal is no longer available",
      message: "Sign in again or create a new proposal. No task details were exposed.",
    },
  } as const;

  return content[failure.kind];
}

function formatDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf())) return date;
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function formatExclusiveEndDate(date: string): string {
  const end = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(end.valueOf())) return date;
  end.setUTCDate(end.getUTCDate() - 1);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(end);
}

function formatLocalTime(time: string): string {
  const parsed = new Date(`2000-01-01T${time}:00.000Z`);
  if (Number.isNaN(parsed.valueOf())) return time;
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(parsed);
}
