export type TaskListKind = "inbox" | "regular";
export type TaskListCreationSource = "account-bootstrap" | "ordinary-command";
export type TaskListMutation = "update" | "move" | "reorder" | "soft-delete" | "restore";

export class InboxPolicyError extends Error {
  readonly reason: "INBOX_CREATION_FORBIDDEN" | "INBOX_IMMUTABLE";

  constructor(reason: InboxPolicyError["reason"], mutation?: TaskListMutation) {
    super(
      reason === "INBOX_CREATION_FORBIDDEN"
        ? "The personal Inbox can only be created during account bootstrap."
        : `The personal Inbox cannot be changed by the ${mutation ?? "ordinary"} list command.`,
    );
    this.name = "InboxPolicyError";
    this.reason = reason;
  }
}

export function assertTaskListCreationAllowed(kind: TaskListKind, source: TaskListCreationSource): void {
  if (kind === "inbox" && source !== "account-bootstrap") {
    throw new InboxPolicyError("INBOX_CREATION_FORBIDDEN");
  }
}

export function assertTaskListMutationAllowed(kind: TaskListKind, mutation: TaskListMutation): void {
  if (kind === "inbox") throw new InboxPolicyError("INBOX_IMMUTABLE", mutation);
}
