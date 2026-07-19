import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import {
  PLANNER_MODEL,
  PLANNER_PROMPT_VERSION,
  PLANNER_SCHEMA_VERSION,
  createPlannerProposalApplier,
  createPlannerProposalLifecycle,
  type PlannerAction,
  type PlannerProposal,
  type PlannerProposalDto,
  type PlannerSelection,
} from "../../../modules/assistant/index.ts";
import { createPlannerApplyProposalAdapter } from "../../../modules/assistant/application/planner-apply-proposal-adapter.ts";
import { createPlannerApplyTaskAdapter } from "../../../modules/assistant/application/planner-apply-task-adapter.ts";
import { createPlannerProposalRepository } from "../../../modules/assistant/infrastructure/planner-proposal-repository.ts";
import { createInboxBootstrapPort } from "../../../modules/tasks/application/inbox.ts";
import { createTasksApplication } from "../../../modules/tasks/application/tasks-application.ts";
import type { AuthenticatedActor } from "../../../shared/auth/actor.ts";
import type { Database } from "../../../shared/db/client.ts";
import { schema } from "../../../shared/db/schema.ts";
import type { Clock } from "../../../shared/time/clock.ts";

import { createWp02SchemaFixture } from "../wp02-schema-support.ts";

export const BASE_NOW = new Date("2026-07-19T01:00:00.000Z");
export const OWNER_A: AuthenticatedActor = { userId: deterministicId(1) };
export const OWNER_B: AuthenticatedActor = { userId: deterministicId(2) };

export class MutableTestClock implements Clock {
  #instant = new Date(BASE_NOW);

  now(): Date {
    return new Date(this.#instant);
  }

  set(value: string | Date): void {
    this.#instant = new Date(value);
  }
}

export async function createPlannerApplyTestHarness() {
  const fixture = createWp02SchemaFixture("planner_apply_runtime");
  const pool = await fixture.setup();
  const database: Database = drizzle(pool, { schema });
  const clock = new MutableTestClock();
  await insertActor(pool, OWNER_A, "planner-apply-owner-a");
  await insertActor(pool, OWNER_B, "planner-apply-owner-b");

  const inboxBootstrap = createInboxBootstrapPort(database, clock);
  await inboxBootstrap.ensureInbox(OWNER_A.userId);
  await inboxBootstrap.ensureInbox(OWNER_B.userId);

  const tasks = createTasksApplication({ database, clock, taskSchedules: schema.taskSchedules });
  const repository = createPlannerProposalRepository(schema.plannerProposals, database);
  let proposalSequence = 9_000;
  const proposals = createPlannerProposalLifecycle({
    persistence: repository,
    clock,
    createId: () => deterministicId(proposalSequence++),
    proposalTtlMs: 30 * 60_000,
  });
  const applier = createPlannerProposalApplier(
    {
      transaction: { execute: (work) => database.transaction(work) },
      proposals: createPlannerApplyProposalAdapter(repository),
      tasks: createPlannerApplyTaskAdapter(tasks.reviewedPlanWrites),
    },
    { clock },
  );

  return {
    pool,
    database,
    clock,
    tasks,
    proposals,
    assistant: {
      applyProposal: applier.apply,
    },
    async teardown() {
      await fixture.teardown();
    },
    async createList(actor: AuthenticatedActor, id: string, name: string) {
      return (
        await tasks.lists.createRegularList(actor, id, {
          name,
          colorToken: "slate",
          folderId: null,
          placement: { kind: "end" },
        })
      ).value;
    },
    async createTask(actor: AuthenticatedActor, id: string, listId: string, title: string) {
      return (
        await tasks.tasks.createTask(actor, id, {
          title,
          descriptionMd: "",
          priority: "none",
          listId,
          sectionId: null,
          parentTaskId: null,
          placement: { kind: "end" },
        })
      ).value;
    },
    persistProposal(
      actor: AuthenticatedActor,
      proposal: PlannerProposal,
      contextVersions: Readonly<Record<string, number>>,
    ): Promise<PlannerProposalDto> {
      return proposals.persist(actor, {
        proposal,
        contextVersions,
        model: PLANNER_MODEL,
        promptVersion: PLANNER_PROMPT_VERSION,
      });
    },
    async storedTask(actor: AuthenticatedActor, taskId: string) {
      const result = await pool.query(
        `select id, list_id, title, description_md, priority, status, version
           from tasks where user_id = $1 and id = $2`,
        [actor.userId, taskId],
      );
      return result.rows[0] as Record<string, unknown> | undefined;
    },
    async storedSchedule(actor: AuthenticatedActor, taskId: string) {
      const result = await pool.query(
        `select kind, start_date, end_date, start_at, end_at, timezone
           from task_schedules where user_id = $1 and task_id = $2`,
        [actor.userId, taskId],
      );
      return result.rows[0] as Record<string, unknown> | undefined;
    },
    async storedProposal(actor: AuthenticatedActor, proposalId: string) {
      const result = await pool.query(
        `select status, applied_at from planner_proposals where user_id = $1 and id = $2`,
        [actor.userId, proposalId],
      );
      return result.rows[0] as Record<string, unknown> | undefined;
    },
    async activeInboxId(actor: AuthenticatedActor): Promise<string> {
      const result = await pool.query(
        `select id from task_lists
          where user_id = $1 and kind = 'inbox' and deleted_at is null`,
        [actor.userId],
      );
      const id = result.rows[0]?.id as string | undefined;
      if (!id) throw new Error("Planner apply test actor has no Inbox.");
      return id;
    },
  };
}

export function proposalDocument(options: {
  subjects: PlannerProposal["subjects"];
  actions: readonly PlannerAction[];
  planningDate?: string;
  workWindow?: Readonly<{ start: string; end: string }>;
  bufferMinutes?: number;
}): PlannerProposal {
  return {
    schemaVersion: PLANNER_SCHEMA_VERSION,
    planningDate: options.planningDate ?? "2026-07-20",
    planningContext: {
      timeZone: "Asia/Singapore",
      workWindow: options.workWindow ?? { start: "09:00", end: "17:00" },
      defaultDurationMinutes: 30,
      bufferMinutes: options.bufferMinutes ?? 10,
    },
    summary: "Review and apply the selected plan.",
    subjects: options.subjects,
    actions: [...options.actions],
    overflow: [],
    conflicts: [],
    uncertainties: [],
  };
}

export function selection(
  proposal: PlannerProposalDto,
  actions: readonly PlannerAction[] = proposal.proposal.actions,
): PlannerSelection {
  return { proposalId: proposal.id, applyToken: proposal.applyToken, actions: [...actions] };
}

export function deterministicId(sequence: number): string {
  return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`;
}

export function timed(startAt: string, endAt: string) {
  return { kind: "timed" as const, startAt, endAt, timeZone: "Asia/Singapore" };
}

async function insertActor(pool: Pool, actor: AuthenticatedActor, label: string): Promise<void> {
  await pool.query(`insert into "user" (id, name, email, email_verified) values ($1, $2, $3, false)`, [
    actor.userId,
    label,
    `${label}@example.test`,
  ]);
}
