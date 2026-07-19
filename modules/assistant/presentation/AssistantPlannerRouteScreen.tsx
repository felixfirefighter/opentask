"use client";

import type { PlannerCapability, PlannerInput } from "../application/contracts";
import { useOnlineStatus } from "@/shared/presentation";

import { AssistantPlannerScreen } from "./AssistantPlannerScreen";
import type { PlannerTaskOption } from "./planner-screen-model";
import { useAssistantPlannerController } from "./use-assistant-planner-controller";

export type AssistantPlannerRouteScreenProps = Readonly<{
  capability: PlannerCapability;
  initialInput: PlannerInput;
  tasks: readonly PlannerTaskOption[];
  todayHref?: string;
  calendarHref?: string;
}>;

export function AssistantPlannerRouteScreen({
  capability,
  initialInput,
  tasks,
  todayHref = "/today",
  calendarHref = "/calendar",
}: AssistantPlannerRouteScreenProps) {
  const online = useOnlineStatus();
  const controller = useAssistantPlannerController(initialInput, online);

  return (
    <AssistantPlannerScreen
      capability={capability}
      initialInput={initialInput}
      tasks={tasks}
      state={controller.state}
      online={online}
      todayHref={todayHref}
      calendarHref={calendarHref}
      onCreateProposal={controller.createProposal}
      onApply={controller.applyProposal}
      onReject={controller.rejectProposal}
      onRetry={controller.retry}
      onEditInput={controller.editInput}
    />
  );
}
