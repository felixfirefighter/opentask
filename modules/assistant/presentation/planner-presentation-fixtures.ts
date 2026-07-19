import {
  PLANNER_MODEL,
  PLANNER_PROMPT_VERSION,
  PLANNER_SCHEMA_VERSION,
  plannerInputSchema,
  plannerProposalDtoSchema,
  type PlannerInput,
  type PlannerProposalDto,
} from "../application/contracts";
import type { PlannerTaskOption } from "./planner-screen-model";

export const taskIds = {
  review: "11111111-1111-4111-8111-111111111111",
  demo: "22222222-2222-4222-8222-222222222222",
} as const;

export const actionIds = {
  schedule: "33333333-3333-4333-8333-333333333333",
  prioritize: "44444444-4444-4444-8444-444444444444",
  update: "55555555-5555-4555-8555-555555555555",
  create: "66666666-6666-4666-8666-666666666666",
  defer: "77777777-7777-4777-8777-777777777777",
} as const;

export const plannerTasksFixture: readonly PlannerTaskOption[] = [
  { id: taskIds.review, title: "Review launch checklist", priority: "high" },
  { id: taskIds.demo, title: "Prepare demo data", priority: "medium" },
];

export const plannerInputFixture: PlannerInput = plannerInputSchema.parse({
  brainDump: "Draft release notes and keep the partner handoff visible if it does not fit.",
  selectedTaskIds: [taskIds.review, taskIds.demo],
  planningDate: "2026-07-20",
  timeZone: "Asia/Singapore",
  workWindow: { start: "09:00", end: "17:00" },
  defaultDurationMinutes: 30,
  bufferMinutes: 10,
});

export const plannerProposalFixture: PlannerProposalDto = plannerProposalDtoSchema.parse({
  id: "88888888-8888-4888-8888-888888888888",
  planningDate: "2026-07-20",
  schemaVersion: PLANNER_SCHEMA_VERSION,
  proposal: {
    schemaVersion: PLANNER_SCHEMA_VERSION,
    planningDate: "2026-07-20",
    planningContext: {
      timeZone: "Asia/Singapore",
      workWindow: { start: "09:00", end: "17:00" },
      defaultDurationMinutes: 30,
      bufferMinutes: 10,
    },
    summary: "Four changes fit the work window and one item should remain visible for later.",
    subjects: [
      {
        semanticRef: "selected-1",
        title: "Review launch checklist",
        source: "selected_task",
        taskId: taskIds.review,
      },
      {
        semanticRef: "selected-2",
        title: "Prepare demo data",
        source: "selected_task",
        taskId: taskIds.demo,
      },
      {
        semanticRef: "new-1",
        title: "Draft release notes",
        source: "brain_dump",
        taskId: null,
      },
      {
        semanticRef: "new-2",
        title: "Clarify partner handoff",
        source: "brain_dump",
        taskId: null,
      },
    ],
    actions: [
      {
        actionId: actionIds.schedule,
        kind: "schedule",
        semanticRef: "selected-1",
        taskId: taskIds.review,
        before: null,
        after: {
          kind: "timed",
          startAt: "2026-07-20T01:00:00.000Z",
          endAt: "2026-07-20T01:30:00.000Z",
          timeZone: "Asia/Singapore",
        },
        rationale: "The review is ready and fits at the start of the work window.",
        uncertainties: [],
      },
      {
        actionId: actionIds.prioritize,
        kind: "prioritize",
        semanticRef: "selected-1",
        taskId: taskIds.review,
        before: "high",
        after: "medium",
        rationale: "The fixed launch work has a clearer deadline.",
        uncertainties: [],
      },
      {
        actionId: actionIds.update,
        kind: "update",
        semanticRef: "selected-2",
        taskId: taskIds.demo,
        before: { title: "Prepare demo data", descriptionMd: "" },
        after: {
          title: "Prepare deterministic demo data",
          descriptionMd: "Use the isolated demo account fixture.",
        },
        rationale: "The input clarifies what makes the demo data ready.",
        uncertainties: ["Confirm whether the friend tester needs a second account."],
      },
      {
        actionId: actionIds.create,
        kind: "create",
        semanticRef: "new-1",
        after: {
          title: "Draft release notes",
          descriptionMd: "Summarize the deadline-safe core.",
          priority: "medium",
          schedule: {
            kind: "timed",
            startAt: "2026-07-20T02:00:00.000Z",
            endAt: "2026-07-20T02:30:00.000Z",
            timeZone: "Asia/Singapore",
          },
        },
        rationale: "The brain dump contains a distinct task that fits the available time.",
        uncertainties: [],
      },
      {
        actionId: actionIds.defer,
        kind: "defer",
        semanticRef: "new-2",
        taskId: null,
        rationale: "The owner and deadline need clarification before scheduling.",
        uncertainties: [],
      },
    ],
    overflow: [{ semanticRef: "new-2", reason: "NO_FREE_INTERVAL" }],
    conflicts: [],
    uncertainties: ["Confirm the desired outcome of the partner handoff."],
  },
  contextVersions: { [taskIds.review]: 3, [taskIds.demo]: 2 },
  status: "pending",
  model: PLANNER_MODEL,
  promptVersion: PLANNER_PROMPT_VERSION,
  applyToken: "99999999-9999-4999-8999-999999999999",
  createdAt: "2026-07-19T12:00:00.000Z",
  expiresAt: "2026-07-19T12:30:00.000Z",
  appliedAt: null,
});

export function proposalWithStatus(status: "pending" | "applied" | "expired" | "rejected") {
  return plannerProposalDtoSchema.parse({
    ...plannerProposalFixture,
    status,
    appliedAt: status === "applied" ? "2026-07-19T12:10:00.000Z" : null,
  });
}

export function emptyProposalFixture() {
  return plannerProposalDtoSchema.parse({
    ...plannerProposalFixture,
    proposal: {
      ...plannerProposalFixture.proposal,
      summary: "The input did not contain an actionable planning request.",
      subjects: [],
      actions: [],
      overflow: [],
      conflicts: [],
      uncertainties: [],
    },
    contextVersions: {},
  });
}
