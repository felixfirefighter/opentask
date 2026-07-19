import type { PlannerCapability } from "./contracts/capability-contract";
import { PLANNER_MODEL, PLANNER_SCHEMA_VERSION } from "./contracts/contract-primitives";
import { isOpenAIConfigured } from "../infrastructure/openai-configuration";

export function getPlannerCapability(): PlannerCapability {
  const configured = Boolean(isOpenAIConfigured());
  return resolvePlannerCapability(configured);
}

export function resolvePlannerCapability(configured: boolean): PlannerCapability {
  if (!configured) {
    return { state: "disabled", reason: "missing_api_key" };
  }

  return {
    state: "available",
    model: PLANNER_MODEL,
    schemaVersion: PLANNER_SCHEMA_VERSION,
  };
}
