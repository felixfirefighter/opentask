export type ChecklistCompletionDecision = Readonly<{
  isCompleted: boolean;
  changed: boolean;
  parentTaskTransition: null;
}>;

export function decideChecklistCompletion(
  currentCompletion: boolean,
  requestedCompletion: boolean,
): ChecklistCompletionDecision {
  return {
    isCompleted: requestedCompletion,
    changed: currentCompletion !== requestedCompletion,
    parentTaskTransition: null,
  };
}
