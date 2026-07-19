import { render } from "@testing-library/react";
import { vi } from "vitest";

import { PLANNER_MODEL, PLANNER_SCHEMA_VERSION } from "../application/contracts";
import { AssistantPlannerScreen } from "./AssistantPlannerScreen";
import { plannerInputFixture, plannerTasksFixture } from "./planner-presentation-fixtures";
import type { AssistantPlannerScreenProps } from "./planner-screen-model";

export function renderPlanner(overrides: Partial<AssistantPlannerScreenProps> = {}) {
  const props: AssistantPlannerScreenProps = {
    capability: { state: "available", model: PLANNER_MODEL, schemaVersion: PLANNER_SCHEMA_VERSION },
    initialInput: plannerInputFixture,
    tasks: plannerTasksFixture,
    state: { kind: "describe" },
    online: true,
    todayHref: "/today",
    calendarHref: "/calendar",
    onCreateProposal: vi.fn(),
    onApply: vi.fn(),
    onReject: vi.fn(),
    onRetry: vi.fn(),
    onEditInput: vi.fn(),
    ...overrides,
  };
  return { ...render(<AssistantPlannerScreen {...props} />), props };
}
