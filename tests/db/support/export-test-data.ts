import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";

import { createProjectedOccurrenceKey } from "../../../modules/tasks/domain/recurrence/occurrence-key.ts";
import type { AuthenticatedActor } from "../../../shared/auth/actor.ts";

export const EXPORT_INSTANT = "2026-07-20T00:05:06.789Z";
export const PLANNING_DATE = "2026-07-20";
export const ALL_DAY_START_DATE = "2026-07-20";
export const ALL_DAY_END_DATE = "2026-07-22";
export const RECORD_INSTANT = "2026-07-19T15:30:45.678Z";
export const PROPOSAL_EXPIRY_INSTANT = "2026-07-20T15:30:45.678Z";
export const PROPOSAL_APPLIED_INSTANT = "2026-07-19T16:00:00.000Z";

export const portableEntityIds = {
  folder: "10000000-0000-4000-8000-000000000001",
  regularList: "20000000-0000-4000-8000-000000000001",
  inboxList: "20000000-0000-4000-8000-000000000002",
  section: "30000000-0000-4000-8000-000000000001",
  childTask: "40000000-0000-4000-8000-000000000001",
  timedTask: "40000000-0000-4000-8000-000000000002",
  allDayTask: "40000000-0000-4000-8000-000000000003",
  rootTask: "40000000-0000-4000-8000-000000000004",
  checklistItem: "50000000-0000-4000-8000-000000000001",
  firstTag: "60000000-0000-4000-8000-000000000001",
  secondTag: "60000000-0000-4000-8000-000000000002",
  firstProposal: "70000000-0000-4000-8000-000000000001",
  secondProposal: "70000000-0000-4000-8000-000000000002",
  firstAction: "71000000-0000-4000-8000-000000000001",
  secondAction: "71000000-0000-4000-8000-000000000002",
  firstApplyToken: "80000000-0000-4000-8000-000000000001",
  secondApplyToken: "80000000-0000-4000-8000-000000000002",
  allDayCompletedEvent: "90000000-0000-4000-8000-000000000001",
  allDayReopenedEvent: "90000000-0000-4000-8000-000000000002",
  timedSkippedEvent: "90000000-0000-4000-8000-000000000003",
  concurrentOccurrenceEvent: "90000000-0000-4000-8000-000000000004",
  booleanHabit: "a0000000-0000-4000-8000-000000000001",
  quantityHabit: "a0000000-0000-4000-8000-000000000002",
  booleanHabitLog: "b0000000-0000-4000-8000-000000000001",
  quantityHabitLog: "b0000000-0000-4000-8000-000000000002",
  taskFocusSession: "c0000000-0000-4000-8000-000000000001",
  habitFocusSession: "c0000000-0000-4000-8000-000000000002",
  completedBreakSession: "c0000000-0000-4000-8000-000000000003",
  activeFocusSession: "c0000000-0000-4000-8000-000000000004",
} as const;

export const APIA_DATE_CROSSING_OCCURRENCE_KEY = createProjectedOccurrenceKey(
  portableEntityIds.timedTask,
  { kind: "timed", startAt: "2011-12-30T19:00:00Z" },
  { kind: "timed", startLocalDateTime: "2011-12-30T09:00" },
  "Pacific/Apia",
);

type TenantSeedInput = Readonly<{
  actor: AuthenticatedActor;
  email: string;
  marker: string;
  timezone: string;
  timedStartInput: string;
  timedEndInput: string;
  timedStartUtc: string;
  timedEndUtc: string;
}>;

export async function seedPortableTenant(pool: Pool, input: TenantSeedInput) {
  const client = await pool.connect();
  const values = tenantValues(input);
  try {
    await client.query("begin");
    await seedIdentity(client, input, values.secretCanaries);
    await seedOrganization(client, input);
    await seedTasks(client, input, values);
    await seedHabits(client, input);
    await seedFocus(client, input);
    await seedPlannerProposals(client, input, values);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return values;
}

async function seedFocus(client: PoolClient, input: TenantSeedInput) {
  await client.query(
    `insert into focus_sessions
       (id, user_id, task_id, habit_id, kind, mode, state, started_at, paused_at,
        accumulated_active_seconds, planned_seconds, ended_at, version, created_at, updated_at)
     values
       ($1, $5, $6, null, 'focus', 'pomodoro', 'completed', '2026-07-19T15:05:45.678Z',
        null, 1500, 1500, $8, 1, '2026-07-19T15:05:45.678Z', $8),
       ($2, $5, null, $7, 'focus', 'stopwatch', 'completed', '2026-07-19T15:15:45.678Z',
        null, 900, null, $8, 1, '2026-07-19T15:15:45.678Z', $8),
       ($3, $5, null, null, 'break', 'pomodoro', 'completed', '2026-07-19T15:20:45.678Z',
        null, 300, 300, $8, 1, '2026-07-19T15:20:45.678Z', $8),
       ($4, $5, null, null, 'focus', 'stopwatch', 'active', $8,
        null, 0, null, null, 1, $8, $8)`,
    [
      portableEntityIds.taskFocusSession,
      portableEntityIds.habitFocusSession,
      portableEntityIds.completedBreakSession,
      portableEntityIds.activeFocusSession,
      input.actor.userId,
      portableEntityIds.rootTask,
      portableEntityIds.quantityHabit,
      RECORD_INSTANT,
    ],
  );
}

async function seedHabits(client: PoolClient, input: TenantSeedInput) {
  await client.query(
    `insert into habits
       (id, user_id, title, icon, color_token, goal_kind, target_value, unit, version,
        created_at, updated_at, archived_at)
     values
       ($1, $3, $4, '✓', 'slate', 'boolean', null, null, 2, $5, $5, $5),
       ($2, $3, $6, '📚', 'mint', 'quantity', 20.000, 'minutes', 1, $5, $5, null)`,
    [
      portableEntityIds.booleanHabit,
      portableEntityIds.quantityHabit,
      input.actor.userId,
      `${input.marker} archived habit`,
      RECORD_INSTANT,
      `${input.marker} reading habit`,
    ],
  );
  await client.query(
    `insert into habit_schedules
       (user_id, habit_id, kind, weekdays, target_per_week, timezone, start_date, end_date,
        created_at, updated_at)
     values
       ($1, $2, 'daily', null, null, $4, '2026-07-01', null, $5, $5),
       ($1, $3, 'weekly_target', null, 4, $4, '2026-07-01', null, $5, $5)`,
    [
      input.actor.userId,
      portableEntityIds.booleanHabit,
      portableEntityIds.quantityHabit,
      input.timezone,
      RECORD_INSTANT,
    ],
  );
  await client.query(
    `insert into habit_logs
       (id, user_id, habit_id, local_date, state, quantity, note, version, created_at, updated_at)
     values
       ($1, $3, $4, '2026-07-19', 'completed', null, null, 1, $6, $6),
       ($2, $3, $5, '2026-07-20', 'completed', 24.500, $7, 1, $6, $6)`,
    [
      portableEntityIds.booleanHabitLog,
      portableEntityIds.quantityHabitLog,
      input.actor.userId,
      portableEntityIds.booleanHabit,
      portableEntityIds.quantityHabit,
      RECORD_INSTANT,
      `${input.marker} private habit note`,
    ],
  );
}

function tenantValues(input: TenantSeedInput) {
  const marker = input.marker;
  return {
    ownerName: `${marker} owner`,
    rootTaskTitle: `${marker} root task`,
    updatedRootTaskTitle: `${marker} root task after concurrent commit`,
    timedStartUtc: input.timedStartUtc,
    timedEndUtc: input.timedEndUtc,
    secretCanaries: [
      `${marker}-session-token-must-not-leak`,
      `${marker}-password-hash-must-not-leak`,
      `${marker}-provider-access-token-must-not-leak`,
      `${marker}-provider-refresh-token-must-not-leak`,
      `${marker}-provider-id-token-must-not-leak`,
      `${marker}-raw-brain-dump-must-not-leak`,
      `${marker}-server-configuration-must-not-leak`,
    ],
  } as const;
}

async function seedIdentity(client: PoolClient, input: TenantSeedInput, secrets: readonly string[]) {
  await client.query(
    `insert into "user" (id, name, email, email_verified, created_at, updated_at)
     values ($1, $2, $3, false, $4, $4)`,
    [input.actor.userId, `${input.marker} owner`, input.email, RECORD_INSTANT],
  );
  await client.query(
    `insert into user_preferences
       (user_id, schema_version, preferences, version, created_at, updated_at)
     values ($1, 1, $2::jsonb, 1, $3, $3)`,
    [
      input.actor.userId,
      JSON.stringify({
        timezone: input.timezone,
        weekStart: 1,
        hourCycle: "h23",
        theme: "system",
        reducedMotion: false,
      }),
      RECORD_INSTANT,
    ],
  );
  await client.query(
    `insert into session
       (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id)
     values ($1, $2, $3, $4, $4, '192.0.2.44', 'export-test-agent', $5)`,
    [randomUUID(), PROPOSAL_EXPIRY_INSTANT, secrets[0], RECORD_INSTANT, input.actor.userId],
  );
  await client.query(
    `insert into account
       (id, account_id, provider_id, user_id, access_token, refresh_token, id_token, scope,
        password, created_at, updated_at)
     values ($1, $2, 'credential', $3, $4, $5, $6, 'private-scope', $7, $8, $8)`,
    [
      randomUUID(),
      `${input.marker}-credential-account`,
      input.actor.userId,
      secrets[2],
      secrets[3],
      secrets[4],
      secrets[1],
      RECORD_INSTANT,
    ],
  );
  await client.query(
    `insert into verification
       (id, identifier, value, expires_at, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $5)`,
    [randomUUID(), `${input.marker}-raw-input`, secrets[5], PROPOSAL_EXPIRY_INSTANT, RECORD_INSTANT],
  );
  await client.query(`insert into rate_limit (id, key, count, last_request) values ($1, $2, 7, 123456789)`, [
    randomUUID(),
    secrets[6],
  ]);
}

async function seedOrganization(client: PoolClient, input: TenantSeedInput) {
  await client.query(
    `insert into list_folders
       (id, user_id, name, rank, version, created_at, updated_at)
     values ($1, $2, $3, 'b0', 1, $4, $4)`,
    [portableEntityIds.folder, input.actor.userId, `${input.marker} folder`, RECORD_INSTANT],
  );
  await client.query(
    `insert into task_lists
       (id, user_id, folder_id, name, color_token, rank, kind, version, created_at, updated_at)
     values
       ($1, $3, $4, $5, 'sky', 'b0', 'regular', 1, $6, $6),
       ($2, $3, null, 'Inbox', 'slate', 'a0', 'inbox', 1, $6, $6)`,
    [
      portableEntityIds.regularList,
      portableEntityIds.inboxList,
      input.actor.userId,
      portableEntityIds.folder,
      `${input.marker} list`,
      RECORD_INSTANT,
    ],
  );
  await client.query(
    `insert into list_sections
       (id, user_id, list_id, name, rank, version, created_at, updated_at)
     values ($1, $2, $3, $4, 'a0', 1, $5, $5)`,
    [
      portableEntityIds.section,
      input.actor.userId,
      portableEntityIds.regularList,
      `${input.marker} section`,
      RECORD_INSTANT,
    ],
  );
}

async function seedTasks(
  client: PoolClient,
  input: TenantSeedInput,
  values: ReturnType<typeof tenantValues>,
) {
  const taskValues = [
    [
      portableEntityIds.rootTask,
      portableEntityIds.regularList,
      portableEntityIds.section,
      null,
      values.rootTaskTitle,
      `${input.marker} private root description`,
      "high",
      "d0",
      1,
    ],
    [
      portableEntityIds.allDayTask,
      portableEntityIds.inboxList,
      null,
      null,
      `${input.marker} all-day task`,
      "",
      "medium",
      "c0",
      3,
    ],
    [
      portableEntityIds.timedTask,
      portableEntityIds.regularList,
      null,
      null,
      `${input.marker} timed task`,
      "",
      "low",
      "b0",
      2,
    ],
    [
      portableEntityIds.childTask,
      portableEntityIds.regularList,
      portableEntityIds.section,
      portableEntityIds.rootTask,
      `${input.marker} child task`,
      "",
      "none",
      "a0",
      1,
    ],
  ] as const;
  for (const task of taskValues) {
    await client.query(
      `insert into tasks
         (id, user_id, list_id, section_id, parent_task_id, title, description_md, status,
          priority, rank, status_changed_at, version, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, 'open', $8, $9, $11, $10, $11, $11)`,
      [task[0], input.actor.userId, ...task.slice(1), RECORD_INSTANT],
    );
  }
  await client.query(
    `insert into task_schedules
       (user_id, task_id, kind, start_date, end_date, created_at, updated_at)
     values ($1, $2, 'all_day', $3, $4, $5, $5)`,
    [input.actor.userId, portableEntityIds.allDayTask, ALL_DAY_START_DATE, ALL_DAY_END_DATE, RECORD_INSTANT],
  );
  await client.query(
    `insert into task_schedules
       (user_id, task_id, kind, start_at, end_at, timezone, created_at, updated_at)
     values ($1, $2, 'timed', $3, $4, $5, $6, $6)`,
    [
      input.actor.userId,
      portableEntityIds.timedTask,
      input.timedStartInput,
      input.timedEndInput,
      input.timezone,
      RECORD_INSTANT,
    ],
  );
  await client.query(
    `insert into task_recurrences
       (user_id, task_id, rrule, timezone, generation_mode,
        projection_start_date, projection_end_date, created_at, updated_at)
     values ($1, $2, 'FREQ=DAILY;INTERVAL=1', $3, 'schedule', $4, null, $5, $5)`,
    [input.actor.userId, portableEntityIds.allDayTask, input.timezone, ALL_DAY_START_DATE, RECORD_INSTANT],
  );
  await client.query(
    `insert into task_recurrences
       (user_id, task_id, rrule, timezone, generation_mode,
        projection_start_at, projection_end_at, created_at, updated_at)
     values ($1, $2, 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE;COUNT=5', $3, 'schedule', $4, $4, $5, $5)`,
    [input.actor.userId, portableEntityIds.timedTask, input.timezone, input.timedStartInput, RECORD_INSTANT],
  );
  await client.query(
    `insert into task_occurrence_events
       (id, user_id, task_id, occurrence_key, state, task_version, effective_at, created_at)
     values
       ($1, $4, $5, 'o1.YWxsLWRheQ', 'completed', 2, $8, $8),
       ($2, $4, $5, 'o1.YWxsLWRheQ', 'open', 3, $8, $8),
       ($3, $4, $6, $7, 'skipped', 2, $8, $8)`,
    [
      portableEntityIds.allDayCompletedEvent,
      portableEntityIds.allDayReopenedEvent,
      portableEntityIds.timedSkippedEvent,
      input.actor.userId,
      portableEntityIds.allDayTask,
      portableEntityIds.timedTask,
      APIA_DATE_CROSSING_OCCURRENCE_KEY,
      RECORD_INSTANT,
    ],
  );
  await client.query(
    `insert into checklist_items
       (id, user_id, task_id, title, is_completed, rank, version, created_at, updated_at)
     values ($1, $2, $3, $4, true, 'a0', 1, $5, $5)`,
    [
      portableEntityIds.checklistItem,
      input.actor.userId,
      portableEntityIds.rootTask,
      `${input.marker} checklist item`,
      RECORD_INSTANT,
    ],
  );
  await client.query(
    `insert into tags
       (id, user_id, name, color_token, version, created_at, updated_at, deleted_at)
     values
       ($1, $3, $4, 'violet', 1, $5, $5, $5),
       ($2, $3, $6, 'amber', 1, $5, $5, null)`,
    [
      portableEntityIds.secondTag,
      portableEntityIds.firstTag,
      input.actor.userId,
      `${input.marker} second tag`,
      RECORD_INSTANT,
      `${input.marker} first tag`,
    ],
  );
  await client.query(
    `insert into task_tags (user_id, task_id, tag_id)
     values ($1, $2, $3), ($1, $4, $5)`,
    [
      input.actor.userId,
      portableEntityIds.rootTask,
      portableEntityIds.secondTag,
      portableEntityIds.timedTask,
      portableEntityIds.firstTag,
    ],
  );
}

async function seedPlannerProposals(
  client: PoolClient,
  input: TenantSeedInput,
  values: ReturnType<typeof tenantValues>,
) {
  const proposals = [
    {
      id: portableEntityIds.secondProposal,
      actionId: portableEntityIds.secondAction,
      applyToken: portableEntityIds.secondApplyToken,
      status: "applied",
      appliedAt: PROPOSAL_APPLIED_INSTANT,
      label: "second",
    },
    {
      id: portableEntityIds.firstProposal,
      actionId: portableEntityIds.firstAction,
      applyToken: portableEntityIds.firstApplyToken,
      status: "pending",
      appliedAt: null,
      label: "first",
    },
  ] as const;
  for (const record of proposals) {
    const proposal = {
      schemaVersion: 1,
      planningDate: PLANNING_DATE,
      planningContext: {
        timeZone: input.timezone,
        workWindow: { start: "09:00", end: "17:00" },
        defaultDurationMinutes: 30,
        bufferMinutes: 10,
      },
      summary: `${input.marker} ${record.label} review`,
      subjects: [
        {
          semanticRef: "selected-1",
          title: values.rootTaskTitle,
          source: "selected_task",
          taskId: portableEntityIds.rootTask,
        },
      ],
      actions: [
        {
          actionId: record.actionId,
          kind: "schedule",
          semanticRef: "selected-1",
          taskId: portableEntityIds.rootTask,
          before: null,
          after: {
            kind: "timed",
            startAt: input.timedStartUtc,
            endAt: input.timedEndUtc,
            timeZone: input.timezone,
          },
          rationale: "Fits the available work window.",
          uncertainties: [],
        },
      ],
      overflow: [],
      conflicts: [],
      uncertainties: [],
    };
    await client.query(
      `insert into planner_proposals
         (id, user_id, planning_date, schema_version, proposal, context_versions, status, model,
          prompt_version, idempotency_key, created_at, expires_at, applied_at)
       values ($1, $2, $3, 1, $4::jsonb, $5::jsonb, $6, 'gpt-5.6',
               'planner-extraction-v1', $7, $8, $9, $10)`,
      [
        record.id,
        input.actor.userId,
        PLANNING_DATE,
        JSON.stringify(proposal),
        JSON.stringify({ [portableEntityIds.rootTask]: 1 }),
        record.status,
        record.applyToken,
        RECORD_INSTANT,
        PROPOSAL_EXPIRY_INSTANT,
        record.appliedAt,
      ],
    );
  }
}
