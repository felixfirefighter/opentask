import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createNotificationDeliveryRepository } from "../../modules/notifications/infrastructure/notification-delivery-repository.ts";
import { createPushSubscriptionRepository } from "../../modules/notifications/infrastructure/push-subscription-repository.ts";
import { createTaskReminderRepository } from "../../modules/notifications/infrastructure/task-reminder-repository.ts";
import { ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX } from "../../modules/notifications/domain/notification-limits.ts";
import { schema } from "../../shared/db/schema.ts";

import { createWp02SchemaFixture } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("p6_notification_query_plan");
const owner = "11111111-1111-4111-8111-111111111111";
const listId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const selected = {
  task: numberedId("10000000", 0),
  subscription: numberedId("20000000", 0),
  reminder: numberedId("30000000", 0),
  delivery: numberedId("40000000", 0),
  endpointHash: Buffer.from(`${"0".repeat(63)}1`, "hex"),
} as const;

type CapturedQuery = Readonly<{ sql: string; params: readonly unknown[] }>;
type ExplainNode = Readonly<{
  "Node Type": string;
  "Index Name"?: string;
  Plans?: readonly ExplainNode[];
}>;
type ExplainDocument = Readonly<{ Plan: ExplainNode }>;

let pool: Pool;

describe("P6 notification tenant-leading query plans", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    await seedNotificationRows(pool);
    for (const table of ["push_subscriptions", "task_reminders", "notification_deliveries"]) {
      await pool.query(`analyze ${table}`);
    }
  }, 60_000);

  afterAll(async () => fixture.teardown());

  it("uses bounded active-subscription indexes for endpoint reads, counts, and fan-out", async () => {
    const endpointCapture = createQueryCapture(pool);
    await createPushSubscriptionRepository().findActiveByEndpointHash(
      owner,
      selected.endpointHash,
      endpointCapture.database,
    );
    await expectIndex(endpointCapture.lastQuery(), "push_subscriptions_active_endpoint_hash_idx");

    const capCapture = createQueryCapture(pool);
    expect(
      await createPushSubscriptionRepository().listActiveIdsUpTo(
        owner,
        ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX,
        capCapture.database,
      ),
    ).toHaveLength(ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX);
    await expectIndex(capCapture.lastQuery(), "push_subscriptions_user_active_idx");

    const listCapture = createQueryCapture(pool);
    const subscriptions = await createPushSubscriptionRepository().listActive(owner, listCapture.database);
    expect(subscriptions).toHaveLength(ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX);
    expect(subscriptions[0]?.id).toBe(numberedId("20000000", ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX - 1));
    expect(subscriptions.at(-1)?.id).toBe(numberedId("20000000", 0));
    await expectIndex(listCapture.lastQuery(), "push_subscriptions_user_active_idx");
  });

  it("uses actor/task and actor/id indexes for reminder reads and portable export pages", async () => {
    const byTaskCapture = createQueryCapture(pool);
    await createTaskReminderRepository().findByTask(owner, selected.task, byTaskCapture.database);
    await expectIndex(byTaskCapture.lastQuery(), "task_reminders_user_task_unique");

    const exportCapture = createQueryCapture(pool);
    const page = await createTaskReminderRepository().listRecoveryPage(
      owner,
      null,
      100,
      exportCapture.database,
    );
    expect(page).toHaveLength(100);
    await expectIndex(exportCapture.lastQuery(), "task_reminders_pkey");
  });

  it("uses actor-leading delivery indexes for targeted and recovery reads", async () => {
    const reminderCapture = createQueryCapture(pool);
    const targeted = await createNotificationDeliveryRepository().listByReminder(
      owner,
      selected.reminder,
      reminderCapture.database,
    );
    expect(targeted).toHaveLength(1);
    await expectIndex(reminderCapture.lastQuery(), "notification_deliveries_reminder_state_scheduled_idx");

    const recoveryCapture = createQueryCapture(pool);
    const page = await createNotificationDeliveryRepository().listRecoveryPage(
      owner,
      null,
      100,
      recoveryCapture.database,
    );
    expect(page).toHaveLength(100);
    await expectIndex(recoveryCapture.lastQuery(), "notification_deliveries_pkey");
  });
});

function createQueryCapture(databasePool: Pool) {
  const queries: CapturedQuery[] = [];
  const database = drizzle(databasePool, {
    schema,
    logger: { logQuery: (sql, params) => queries.push({ sql, params: [...params] }) },
  });
  return {
    database,
    lastQuery() {
      const query = queries.at(-1);
      if (!query) throw new Error("Expected the notification repository to execute a query.");
      return query;
    },
  };
}

async function expectIndex(query: CapturedQuery, expectedIndex: string) {
  expect(query.sql).toContain('"user_id"');
  const plan = await explain(query);
  const indexNames = flattenPlan(plan).flatMap((node) =>
    node["Index Name"] === undefined ? [] : [node["Index Name"]],
  );
  expect(indexNames, JSON.stringify(plan)).toContain(expectedIndex);
}

async function explain(query: CapturedQuery): Promise<ExplainNode> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local enable_seqscan = off");
    const result = await client.query<{ "QUERY PLAN": readonly ExplainDocument[] }>(
      `explain (analyze, buffers, costs off, timing off, summary off, format json) ${query.sql}`,
      [...query.params],
    );
    const plan = result.rows[0]?.["QUERY PLAN"]?.[0]?.Plan;
    if (!plan) throw new Error("PostgreSQL did not return a notification EXPLAIN plan.");
    return plan;
  } finally {
    await rollback(client);
    client.release();
  }
}

async function rollback(client: PoolClient) {
  try {
    await client.query("rollback");
  } catch {
    // Preserve the original EXPLAIN failure; fixture teardown drops the isolated schema.
  }
}

function flattenPlan(node: ExplainNode): readonly ExplainNode[] {
  return [node, ...(node.Plans ?? []).flatMap(flattenPlan)];
}

async function seedNotificationRows(databasePool: Pool) {
  await databasePool.query(
    `insert into "user" (id, name, email, email_verified)
     values ($1, 'Notification plan owner', 'notification-plan@example.test', false)`,
    [owner],
  );
  await databasePool.query(
    `insert into task_lists (id, user_id, name, color_token, rank, kind)
     values ($1, $2, 'Notification plans', 'slate', 'a0', 'regular')`,
    [listId, owner],
  );
  await databasePool.query(
    `insert into tasks (id, user_id, list_id, title, description_md, rank, version)
     select ('10000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
            $1, $2, 'Notification task ' || sequence, '', 'n' || lpad(sequence::text, 4, '0'), 1
       from generate_series(0, 127) as sequence`,
    [owner, listId],
  );
  const ciphertext = `v1.${"A".repeat(16)}.${"B".repeat(43)}.${"C".repeat(22)}`;
  await databasePool.query(
    `insert into push_subscriptions
       (id, user_id, endpoint_hash, endpoint_ciphertext, p256dh_ciphertext, auth_ciphertext,
        encryption_key_version, created_at, last_used_at, revoked_at)
     select ('20000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
            $1, decode(lpad(to_hex(sequence + 1), 64, '0'), 'hex'), $2, $2, $2, 1,
            timestamptz '2026-07-21 00:00:00+00',
            timestamptz '2026-07-21 00:00:00+00' + sequence * interval '1 second',
            case
              when sequence < $3 then null
              else timestamptz '2026-07-21 00:00:00+00' + sequence * interval '1 second'
            end
       from generate_series(0, 127) as sequence`,
    [owner, ciphertext, ACTIVE_PUSH_SUBSCRIPTIONS_PER_USER_MAX],
  );
  await seedActiveSubscriptionNoise(databasePool, ciphertext);
  await databasePool.query(
    `insert into task_reminders
       (id, user_id, task_id, kind, remind_at, enabled, version)
     select ('30000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
            $1, ('10000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
            'absolute', timestamptz '2099-01-01 00:00:00+00' + sequence * interval '1 minute',
            true, 1
       from generate_series(0, 127) as sequence`,
    [owner],
  );
  await databasePool.query(
    `insert into notification_deliveries
       (id, user_id, reminder_id, subscription_id, scheduled_for, idempotency_key, state,
        attempt_count, created_at, updated_at)
     select ('40000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
            $1, ('30000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
            ('20000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
            timestamptz '2099-01-01 00:00:00+00' + sequence * interval '1 minute',
            lpad(to_hex(sequence + 1), 64, '0'), 'scheduled', 0,
            timestamptz '2026-07-21 00:00:00+00', timestamptz '2026-07-21 00:00:00+00'
       from generate_series(0, 127) as sequence`,
    [owner],
  );
}

async function seedActiveSubscriptionNoise(databasePool: Pool, ciphertext: string) {
  await databasePool.query(
    `insert into "user" (id, name, email, email_verified)
     select ('90000000-0000-4000-8000-' || lpad(actor_sequence::text, 12, '0'))::uuid,
            'Notification plan noise owner ' || actor_sequence,
            'notification-plan-noise-' || actor_sequence || '@example.test', false
       from generate_series(0, 63) as actor_sequence`,
  );
  await databasePool.query(
    `insert into push_subscriptions
       (id, user_id, endpoint_hash, endpoint_ciphertext, p256dh_ciphertext, auth_ciphertext,
        encryption_key_version, created_at, last_used_at)
     select ('21000000-0000-4000-8000-' || lpad(subscription_sequence::text, 12, '0'))::uuid,
            ('90000000-0000-4000-8000-' || lpad(actor_sequence::text, 12, '0'))::uuid,
            decode(lpad(to_hex(10000 + actor_sequence * 10 + subscription_sequence), 64, '0'), 'hex'),
            $1, $1, $1, 1, timestamptz '2026-07-21 00:00:00+00',
            timestamptz '2026-07-21 00:00:00+00' + subscription_sequence * interval '1 second'
       from generate_series(0, 63) as actor_sequence
       cross join generate_series(0, 9) as subscription_sequence`,
    [ciphertext],
  );
}

function numberedId(prefix: string, sequence: number): string {
  return `${prefix}-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}
