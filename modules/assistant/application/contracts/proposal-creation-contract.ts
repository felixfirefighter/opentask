import { z } from "zod";

import type { AuthenticatedActor } from "@/shared/auth/actor";

import {
  entityIdSchema,
  taskDescriptionSchema,
  taskPrioritySchema,
  taskTitleSchema,
  versionSchema,
} from "./contract-primitives";
import type { PlannerProposal, PlannerProposalDto, ProposalContextVersions } from "./proposal-contract";

export const plannerSelectedTaskSnapshotSchema = z.strictObject({
  id: entityIdSchema,
  title: taskTitleSchema,
  descriptionMd: taskDescriptionSchema,
  priority: taskPrioritySchema,
  version: versionSchema,
});

export type PlannerSelectedTaskSnapshot = z.infer<typeof plannerSelectedTaskSnapshotSchema>;

export type PlannerSelectedTaskReader = Readonly<{
  loadOpenUnscheduled(
    actor: AuthenticatedActor,
    taskIds: readonly string[],
  ): Promise<readonly PlannerSelectedTaskSnapshot[]>;
}>;

export type PlannerBusyScheduleQuery = Readonly<{
  rangeStartDate: string;
  rangeEndDate: string;
  rangeStartAt: string;
  rangeEndAt: string;
  limit: 500;
}>;

export type PlannerBusySchedule =
  Readonly<{ kind: "all_day" }> | Readonly<{ kind: "timed"; startAt: string; endAt: string }>;

export type PlannerBusyScheduleReader = Readonly<{
  listRange(
    actor: AuthenticatedActor,
    query: PlannerBusyScheduleQuery,
  ): Promise<
    Readonly<{
      items: readonly Readonly<{ schedule: PlannerBusySchedule }>[];
      truncated: boolean;
    }>
  >;
}>;

export type PlannerProposalWriter = Readonly<{
  persist(
    actor: AuthenticatedActor,
    input: Readonly<{
      proposal: PlannerProposal;
      contextVersions: ProposalContextVersions;
      model: string;
      promptVersion: string;
    }>,
  ): Promise<PlannerProposalDto>;
}>;
