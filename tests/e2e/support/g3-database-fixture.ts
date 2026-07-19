import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

import type { PlannerProposalDto } from "../../../modules/assistant/application/contracts";

type StoredTask = Readonly<{
  id: string;
  title: string;
  descriptionMd: string;
  priority: string;
  version: number;
}>;

type StoredSchedule = Readonly<{
  taskId: string;
  kind: string;
  startAt: string | null;
  endAt: string | null;
  timezone: string | null;
}>;

export type G3DatabaseState = Readonly<{
  proposal: Readonly<{ status: string; appliedAt: string | null }> | null;
  selectedTask: StoredTask | null;
  selectedSchedule: StoredSchedule | null;
  createdTask: StoredTask | null;
  createdSchedule: StoredSchedule | null;
}>;

type TaskRow = Omit<StoredTask, "version"> & Readonly<{ version: number }>;
type ScheduleRow = Readonly<{
  taskId: string;
  kind: string;
  startAt: Date | null;
  endAt: Date | null;
  timezone: string | null;
}>;
type ProposalRow = Readonly<{ status: string; appliedAt: Date | null }>;

export async function persistG3Proposal(page: Page, proposal: PlannerProposalDto): Promise<void> {
  const userId = await readAuthenticatedUserId(page);
  await withDatabase(async (client) => {
    await client.query(
      `insert into planner_proposals
         (id, user_id, planning_date, schema_version, proposal, context_versions, status,
          model, prompt_version, idempotency_key, created_at, expires_at, applied_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        proposal.id,
        userId,
        proposal.planningDate,
        proposal.schemaVersion,
        proposal.proposal,
        proposal.contextVersions,
        proposal.status,
        proposal.model,
        proposal.promptVersion,
        proposal.applyToken,
        proposal.createdAt,
        proposal.expiresAt,
        proposal.appliedAt,
      ],
    );
  });
}

export async function readG3DatabaseState(
  page: Page,
  input: Readonly<{ proposalId: string; selectedTaskId: string; createdTaskId: string }>,
): Promise<G3DatabaseState> {
  const userId = await readAuthenticatedUserId(page);
  return withDatabase(async (client) => {
    const tasks = await client.query<TaskRow>(
      `select id, title, description_md as "descriptionMd", priority, version
         from tasks
        where user_id = $1 and id = any($2::uuid[])`,
      [userId, [input.selectedTaskId, input.createdTaskId]],
    );
    const schedules = await client.query<ScheduleRow>(
      `select task_id as "taskId", kind, start_at as "startAt", end_at as "endAt", timezone
         from task_schedules
        where user_id = $1 and task_id = any($2::uuid[])`,
      [userId, [input.selectedTaskId, input.createdTaskId]],
    );
    const proposals = await client.query<ProposalRow>(
      `select status, applied_at as "appliedAt"
         from planner_proposals
        where user_id = $1 and id = $2`,
      [userId, input.proposalId],
    );

    const byTaskId = new Map(tasks.rows.map((task) => [task.id, task]));
    const byScheduleTaskId = new Map(
      schedules.rows.map((schedule) => [schedule.taskId, toStoredSchedule(schedule)]),
    );
    const proposal = proposals.rows[0];
    return {
      proposal: proposal
        ? { status: proposal.status, appliedAt: proposal.appliedAt?.toISOString() ?? null }
        : null,
      selectedTask: byTaskId.get(input.selectedTaskId) ?? null,
      selectedSchedule: byScheduleTaskId.get(input.selectedTaskId) ?? null,
      createdTask: byTaskId.get(input.createdTaskId) ?? null,
      createdSchedule: byScheduleTaskId.get(input.createdTaskId) ?? null,
    };
  });
}

async function readAuthenticatedUserId(page: Page): Promise<string> {
  const response = await page.context().request.get("/api/auth/get-session");
  expect(response.status()).toBe(200);
  const body = (await response.json()) as unknown;
  expect(body).toMatchObject({ user: { id: expect.any(String) } });
  return (body as { user: { id: string } }).user.id;
}

async function withDatabase<Result>(work: (client: Client) => Promise<Result>): Promise<Result> {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

function databaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(".env.local");
    } catch {
      // A configured CI environment does not need a repository-local env file.
    }
  }
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("G3 database fixture requires DATABASE_URL.");
  return value;
}

function toStoredSchedule(schedule: ScheduleRow): StoredSchedule {
  return {
    ...schedule,
    startAt: schedule.startAt?.toISOString() ?? null,
    endAt: schedule.endAt?.toISOString() ?? null,
  };
}
