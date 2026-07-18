export const taskStatuses = ["open", "completed", "cancelled"] as const;
export type TaskStatus = (typeof taskStatuses)[number];

export const taskStatusCommands = ["complete", "undo-completion", "cancel", "restore-cancelled"] as const;
export type TaskStatusCommand = (typeof taskStatusCommands)[number];

export type TaskStatusTransition = Readonly<{
  status: TaskStatus;
  statusChangedAt: Date;
}>;

export class StatusTransitionError extends Error {
  readonly reason = "STATUS_TRANSITION_NOT_ALLOWED";

  constructor() {
    super("The requested task status transition is not allowed.");
    this.name = "StatusTransitionError";
  }
}

const allowedTransitions: Record<TaskStatusCommand, Readonly<{ from: TaskStatus; to: TaskStatus }>> = {
  complete: { from: "open", to: "completed" },
  "undo-completion": { from: "completed", to: "open" },
  cancel: { from: "open", to: "cancelled" },
  "restore-cancelled": { from: "cancelled", to: "open" },
};

export function transitionTaskStatus(
  currentStatus: TaskStatus,
  command: TaskStatusCommand,
  changedAt: Date,
): TaskStatusTransition {
  const transition = allowedTransitions[command];
  if (currentStatus !== transition.from || !Number.isFinite(changedAt.getTime())) {
    throw new StatusTransitionError();
  }

  return { status: transition.to, statusChangedAt: new Date(changedAt) };
}
