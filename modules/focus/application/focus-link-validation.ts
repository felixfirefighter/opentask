import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseExecutor } from "@/shared/db/client";

import type {
  FocusLinkSelection,
  FocusLinkValidators,
  FocusResolvedLink,
  FocusStartInput,
} from "./contracts";
import { focusValidationFailed } from "./focus-errors";

export async function assertSelectableStartLink(
  actor: AuthenticatedActor,
  input: FocusStartInput,
  validators: FocusLinkValidators,
  executor: DatabaseExecutor,
): Promise<FocusResolvedLink | null> {
  if (input.taskId !== null) {
    return assertSelectableLink(actor, { kind: "task", id: input.taskId }, validators, executor);
  }
  if (input.habitId !== null) {
    return assertSelectableLink(actor, { kind: "habit", id: input.habitId }, validators, executor);
  }
  return null;
}

export async function assertSelectableCorrectionLink(
  actor: AuthenticatedActor,
  link: FocusLinkSelection,
  validators: FocusLinkValidators,
  executor: DatabaseExecutor,
): Promise<FocusResolvedLink | null> {
  return link === null ? null : assertSelectableLink(actor, link, validators, executor);
}

export async function resolveFocusSessionLink(
  actor: AuthenticatedActor,
  session: Readonly<{ taskId: string | null; habitId: string | null }>,
  validators: FocusLinkValidators,
  executor?: DatabaseExecutor,
): Promise<FocusResolvedLink | null> {
  const selection = session.taskId
    ? { kind: "task" as const, id: session.taskId }
    : session.habitId
      ? { kind: "habit" as const, id: session.habitId }
      : null;
  if (selection === null) return null;

  const owned = await validators[selection.kind].readOwned(actor, selection.id, executor);
  const available =
    owned?.kind === selection.kind && owned.id === selection.id && owned.available && owned.label !== null;
  return {
    ...selection,
    label: available ? owned.label : null,
    availability: available ? "available" : "unavailable",
  };
}

export function focusLinkSelectionMatches(
  current: Readonly<{ taskId: string | null; habitId: string | null }>,
  link: FocusLinkSelection,
): boolean {
  return (
    current.taskId === (link?.kind === "task" ? link.id : null) &&
    current.habitId === (link?.kind === "habit" ? link.id : null)
  );
}

async function assertSelectableLink(
  actor: AuthenticatedActor,
  link: Exclude<FocusLinkSelection, null>,
  validators: FocusLinkValidators,
  executor: DatabaseExecutor,
): Promise<FocusResolvedLink> {
  const resolved = await resolveFocusSessionLink(
    actor,
    {
      taskId: link.kind === "task" ? link.id : null,
      habitId: link.kind === "habit" ? link.id : null,
    },
    validators,
    executor,
  );
  if (!resolved || resolved.availability !== "available") {
    throw focusValidationFailed("The selected focus link is unavailable.");
  }
  return resolved;
}
