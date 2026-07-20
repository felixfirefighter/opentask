import {
  PLANNING_PROJECTION_MAX_ROWS,
  buildDeterministicPlan,
  type BusyInterval,
  type PlanningBusyIntervalReader,
} from "@/modules/planning";
import type { AuthenticatedActor } from "@/shared/auth/actor";
import { createEntityId } from "@/shared/db/ids";
import { ApplicationError } from "@/shared/http/application-error";

import {
  PLANNER_PROMPT_VERSION,
  PLANNER_SCHEMA_VERSION,
  modelExtractionSchema,
  plannerExtractionRequestSchema,
  plannerInputSchema,
  validateExtractionReferences,
  type PlannerExtractionProvider,
  type PlannerExtractionRequest,
  type PlannerInput,
  type PlannerProposalDto,
} from "./contracts";
import type {
  PlannerProposalWriter,
  PlannerSelectedTaskReader,
  PlannerSelectedTaskSnapshot,
} from "./contracts/proposal-creation-contract";
import { plannerSelectedTaskSnapshotSchema } from "./contracts/proposal-creation-contract";
import { PlannerProviderError } from "../infrastructure/openai-responses-provider";
import { resolvePlannerWorkWindow } from "./planner-local-time";
import { buildPlannerProposal, buildSchedulingCandidates } from "./planner-proposal-builder";

type DeterministicScheduler = typeof buildDeterministicPlan;

export type PlannerProposalCreator = ReturnType<typeof createPlannerProposalCreator>;

export function createPlannerProposalCreator(dependencies: {
  provider: PlannerExtractionProvider | null;
  selectedTasks: PlannerSelectedTaskReader;
  busyIntervals: PlanningBusyIntervalReader;
  proposals: PlannerProposalWriter;
  schedule?: DeterministicScheduler;
  createActionId?: () => string;
}) {
  const schedule = dependencies.schedule ?? buildDeterministicPlan;
  const createActionId = dependencies.createActionId ?? createEntityId;

  return {
    async create(actor: AuthenticatedActor, rawInput: PlannerInput): Promise<PlannerProposalDto> {
      const input = plannerInputSchema.parse(rawInput);
      if (!dependencies.provider) {
        throw new ApplicationError(
          "PROVIDER_UNAVAILABLE",
          "AI planning is disabled until an OpenAI API key is configured.",
        );
      }

      const snapshots =
        input.selectedTaskIds.length === 0
          ? []
          : await dependencies.selectedTasks.loadOpenUnscheduled(actor, input.selectedTaskIds);
      const selectedTasksByReference = validateSelectedSnapshots(input, snapshots);
      const extractionRequest = toExtractionRequest(input, selectedTasksByReference);
      const providerResult = await extractRecoverably(dependencies.provider, extractionRequest);
      const extraction = modelExtractionSchema.safeParse(providerResult.extraction);
      if (!extraction.success || !validateExtractionReferences(extractionRequest, extraction.data)) {
        throw new ApplicationError(
          "VALIDATION_FAILED",
          "The planner returned an invalid proposal. Try again.",
        );
      }

      const window = resolvePlannerWorkWindow(input);
      const busyIntervals = window
        ? await loadBusyIntervals(dependencies.busyIntervals, actor, input, window)
        : [];
      const scheduling = schedule({
        timeZone: input.timeZone,
        workWindows: [
          {
            localDate: input.planningDate,
            startTime: input.workWindow.start,
            endTime: input.workWindow.end,
          },
        ],
        busyIntervals,
        bufferMinutes: input.bufferMinutes,
        candidates: buildSchedulingCandidates(extraction.data, input.timeZone),
      });
      const built = buildPlannerProposal({
        input,
        extraction: extraction.data,
        selectedTasksByReference,
        scheduling,
        createActionId,
      });

      return dependencies.proposals.persist(actor, {
        ...built,
        model: providerResult.model,
        promptVersion: PLANNER_PROMPT_VERSION,
      });
    },
  } as const;
}

function validateSelectedSnapshots(
  input: PlannerInput,
  snapshots: readonly PlannerSelectedTaskSnapshot[],
): ReadonlyMap<string, PlannerSelectedTaskSnapshot> {
  const parsed = plannerSelectedTaskSnapshotSchema.array().max(50).safeParse(snapshots);
  if (!parsed.success) {
    throw new ApplicationError("INTERNAL", "Selected task context could not be read safely.");
  }
  snapshots = parsed.data;
  const requested = new Set(input.selectedTaskIds);
  const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  if (
    snapshots.length !== input.selectedTaskIds.length ||
    byId.size !== snapshots.length ||
    snapshots.some(({ id }) => !requested.has(id)) ||
    input.selectedTaskIds.some((id) => !byId.has(id))
  ) {
    throw new ApplicationError("NOT_FOUND", "A selected task was not found.");
  }

  return new Map(
    input.selectedTaskIds.map((id, index) => {
      const snapshot = byId.get(id);
      if (!snapshot) throw new ApplicationError("NOT_FOUND", "A selected task was not found.");
      return [`selected-${index + 1}`, snapshot];
    }),
  );
}

function toExtractionRequest(
  input: PlannerInput,
  selectedTasksByReference: ReadonlyMap<string, PlannerSelectedTaskSnapshot>,
): PlannerExtractionRequest {
  return plannerExtractionRequestSchema.parse({
    schemaVersion: PLANNER_SCHEMA_VERSION,
    brainDump: input.brainDump,
    planningDate: input.planningDate,
    timeZone: input.timeZone,
    workWindow: input.workWindow,
    defaultDurationMinutes: input.defaultDurationMinutes,
    bufferMinutes: input.bufferMinutes,
    selectedTasks: [...selectedTasksByReference].map(([semanticRef, task]) => ({
      semanticRef: semanticRef as `selected-${number}`,
      title: task.title,
      priority: task.priority,
    })),
  });
}

async function extractRecoverably(provider: PlannerExtractionProvider, request: PlannerExtractionRequest) {
  try {
    return await provider.extract(request);
  } catch (error) {
    if (error instanceof PlannerProviderError) {
      if (error.kind === "timeout" || error.kind === "unavailable") {
        throw new ApplicationError("PROVIDER_UNAVAILABLE", error.message);
      }
      throw new ApplicationError("VALIDATION_FAILED", error.message);
    }
    throw new ApplicationError("PROVIDER_UNAVAILABLE", "The planner is temporarily unavailable. Try again.");
  }
}

async function loadBusyIntervals(
  reader: PlanningBusyIntervalReader,
  actor: AuthenticatedActor,
  input: PlannerInput,
  window: Readonly<{ startAt: string; endAt: string; nextLocalDate: string }>,
): Promise<readonly BusyInterval[]> {
  const page = await reader.readBusyIntervals(actor, {
    timeZone: input.timeZone,
    rangeStartDate: input.planningDate,
    rangeEndDate: window.nextLocalDate,
    rangeStartAt: window.startAt,
    rangeEndAt: window.endAt,
    limit: PLANNING_PROJECTION_MAX_ROWS,
  });
  if (page.truncation.truncated) {
    throw new ApplicationError(
      "VALIDATION_FAILED",
      "The recurring occurrence context was truncated by a safety limit. Use a narrower work window and try again.",
    );
  }
  return page.items;
}
