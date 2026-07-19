import { type Page, type Route } from "@playwright/test";

import {
  PLANNER_MODEL,
  PLANNER_PROMPT_VERSION,
  PLANNER_SCHEMA_VERSION,
  plannerInputSchema,
  plannerProposalDtoSchema,
  plannerSelectionSchema,
  type PlannerInput,
  type PlannerProposalDto,
  type PlannerSelection,
} from "../../../modules/assistant/application/contracts";
import type { TaskWireRecord } from "./wp03-tasks";
import { singaporeInstant } from "./golden-path-planning";

const ids = {
  proposal: "80000000-0000-4000-8000-000000000001",
  applyToken: "80000000-0000-4000-8000-000000000002",
  update: "80000000-0000-4000-8000-000000000003",
  schedule: "80000000-0000-4000-8000-000000000004",
  create: "80000000-0000-4000-8000-000000000005",
  defer: "80000000-0000-4000-8000-000000000006",
} as const;

export const g3ActionIds = ids;

export type PlannerRouteHarness = Readonly<{
  createInputs: PlannerInput[];
  applySelections: PlannerSelection[];
  applyIdempotencyKeys: string[];
  rejectCount(): number;
  unexpectedRequests: string[];
}>;

export function createG3Proposal(
  task: Pick<TaskWireRecord, "id" | "title" | "version">,
  planningDate: string,
  timeZone = "Asia/Singapore",
): PlannerProposalDto {
  return plannerProposalDtoSchema.parse({
    id: ids.proposal,
    planningDate,
    schemaVersion: PLANNER_SCHEMA_VERSION,
    proposal: {
      schemaVersion: PLANNER_SCHEMA_VERSION,
      planningDate,
      planningContext: {
        timeZone,
        workWindow: { start: "09:00", end: "17:00" },
        defaultDurationMinutes: 30,
        bufferMinutes: 10,
      },
      summary: "Three reviewable changes fit, while one uncertain item remains deferred.",
      subjects: [
        {
          semanticRef: "selected-1",
          title: task.title,
          source: "selected_task",
          taskId: task.id,
        },
        {
          semanticRef: "new-1",
          title: "Draft release summary",
          source: "brain_dump",
          taskId: null,
        },
        {
          semanticRef: "new-2",
          title: "Clarify friend feedback",
          source: "brain_dump",
          taskId: null,
        },
      ],
      actions: [
        {
          actionId: ids.update,
          kind: "update",
          semanticRef: "selected-1",
          taskId: task.id,
          before: { title: task.title, descriptionMd: "" },
          after: { title: `Refine ${task.title}`, descriptionMd: "Add the verified demo outcome." },
          rationale: "The brain dump adds a concrete completion condition.",
          uncertainties: ["Confirm the final reviewer before publishing."],
        },
        {
          actionId: ids.schedule,
          kind: "schedule",
          semanticRef: "selected-1",
          taskId: task.id,
          before: null,
          after: {
            kind: "timed",
            startAt: singaporeInstant(planningDate, "09:00"),
            endAt: singaporeInstant(planningDate, "09:30"),
            timeZone,
          },
          rationale: "The selected task fits at the start of the work window.",
          uncertainties: [],
        },
        {
          actionId: ids.create,
          kind: "create",
          semanticRef: "new-1",
          after: {
            title: "Draft release summary",
            descriptionMd: "Capture the deadline-safe core and known limitations.",
            priority: "medium",
            schedule: {
              kind: "timed",
              startAt: singaporeInstant(planningDate, "10:00"),
              endAt: singaporeInstant(planningDate, "10:30"),
              timeZone,
            },
          },
          rationale: "This is a distinct deliverable with a clear half-hour slot.",
          uncertainties: [],
        },
        {
          actionId: ids.defer,
          kind: "defer",
          semanticRef: "new-2",
          taskId: null,
          rationale: "The owner and desired outcome need clarification before scheduling.",
          uncertainties: [],
        },
      ],
      overflow: [{ semanticRef: "new-2", reason: "NO_FREE_INTERVAL" }],
      conflicts: [],
      uncertainties: ["Confirm whether friend feedback is required before recording."],
    },
    contextVersions: { [task.id]: task.version },
    status: "pending",
    model: PLANNER_MODEL,
    promptVersion: PLANNER_PROMPT_VERSION,
    applyToken: ids.applyToken,
    createdAt: "2026-07-19T00:00:00.000Z",
    expiresAt: "2099-07-19T00:30:00.000Z",
    appliedAt: null,
  });
}

export async function installPlannerRouteFixtures(
  page: Page,
  proposal: PlannerProposalDto,
  options: Readonly<{
    failFirstCreate?: boolean;
  }> = {},
): Promise<PlannerRouteHarness> {
  const createInputs: PlannerInput[] = [];
  const applySelections: PlannerSelection[] = [];
  const applyIdempotencyKeys: string[] = [];
  const unexpectedRequests: string[] = [];
  let rejectCount = 0;

  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === `/api/v1/planner/proposals/${proposal.id}/apply` && request.method() === "POST") {
      const selection = plannerSelectionSchema.safeParse(request.postDataJSON());
      if (!selection.success) {
        unexpectedRequests.push("POST apply with an invalid selection");
        return;
      }
      applySelections.push(selection.data);
      applyIdempotencyKeys.push(request.headers()["idempotency-key"] ?? "");
    }
    if (path === `/api/v1/planner/proposals/${proposal.id}/reject` && request.method() === "POST") {
      rejectCount += 1;
    }
  });

  await page.route("**/api/v1/planner/proposals", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/v1/planner/proposals" && request.method() === "POST") {
      const input = plannerInputSchema.parse(request.postDataJSON());
      createInputs.push(input);
      if (options.failFirstCreate && createInputs.length === 1) {
        await fulfillProblem(route, "PROVIDER_UNAVAILABLE", 503);
      } else {
        await fulfillJson(route, proposal, 201);
      }
      return;
    }
    unexpectedRequests.push(`${request.method()} ${path}`);
    await route.continue();
  });

  return {
    createInputs,
    applySelections,
    applyIdempotencyKeys,
    rejectCount: () => rejectCount,
    unexpectedRequests,
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function fulfillProblem(route: Route, code: "PROVIDER_UNAVAILABLE", status: number) {
  await route.fulfill({
    status,
    contentType: "application/problem+json",
    body: JSON.stringify({
      type: `urn:opentask:problem:${code.toLowerCase().replaceAll("_", "-")}`,
      title: "Service unavailable",
      status,
      code,
      detail: "The intercepted planner request failed safely.",
      correlationId: `g3-${code.toLowerCase()}`,
    }),
  });
}
