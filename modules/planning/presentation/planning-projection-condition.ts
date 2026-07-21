import type { PlanningProjectionTruncationReason } from "../application/public";
import type { PlanningRecoverableCondition, PlanningScreenCondition } from "./planning-screen-model";

type ProjectionTruncation = Readonly<{
  truncated: boolean;
  truncationReasons: readonly PlanningProjectionTruncationReason[];
}>;

export function resolvePlanningProjectionCondition(
  baseCondition: PlanningScreenCondition,
  projection: ProjectionTruncation,
  transientCondition?: PlanningScreenCondition | null,
): PlanningScreenCondition {
  if (!projection.truncated) {
    if (baseCondition.kind !== "ready") return baseCondition;
    return transientCondition && transientCondition.kind !== "ready" ? transientCondition : baseCondition;
  }
  if (
    baseCondition.kind === "loading" ||
    baseCondition.kind === "permission" ||
    baseCondition.kind === "partial"
  ) {
    return baseCondition;
  }

  const runtimeCondition =
    baseCondition.kind !== "ready" ? baseCondition : recoverableCondition(transientCondition);

  return {
    kind: "partial",
    message: partialProjectionMessage(projection.truncationReasons),
    reasons: projection.truncationReasons,
    runtimeCondition,
  };
}

function recoverableCondition(
  condition: PlanningScreenCondition | null | undefined,
): PlanningRecoverableCondition | null {
  if (
    !condition ||
    condition.kind === "ready" ||
    condition.kind === "loading" ||
    condition.kind === "partial" ||
    condition.kind === "permission"
  ) {
    return null;
  }
  return condition;
}

function partialProjectionMessage(reasons: readonly PlanningProjectionTruncationReason[]) {
  const areas: string[] = [];
  if (reasons.includes("task_source_limit")) areas.push("task loading");
  if (reasons.includes("recurrence_source_limit") || reasons.includes("recurrence_event_source_limit")) {
    areas.push("recurrence history loading");
  }
  if (
    reasons.includes("recurrence_series_candidate_limit") ||
    reasons.includes("recurrence_request_candidate_limit")
  ) {
    areas.push("recurrence calculation");
  }
  if (reasons.includes("recurrence_output_limit") || reasons.includes("projection_output_limit")) {
    areas.push("result loading");
  }

  const detail = areas.length > 0 ? ` during ${joinAreas(areas)}` : "";
  return `A safety limit was reached${detail}. Some tasks or occurrences may be missing. Loaded results are read-only; retry to refresh.`;
}

function joinAreas(areas: readonly string[]) {
  const unique = [...new Set(areas)];
  if (unique.length < 2) return unique[0] ?? "loading";
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique.slice(0, -1).join(", ")}, and ${unique.at(-1)}`;
}
