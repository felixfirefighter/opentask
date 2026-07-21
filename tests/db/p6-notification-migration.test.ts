import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readCommittedMigrationRevisions } from "../../shared/db/migration-files.ts";

import {
  applyMigrationSlice,
  createWp02SchemaFixture,
  expectPostgresError,
  insertUser,
} from "./wp02-schema-support.ts";

const notificationColumns = {
  notification_deliveries: [
    "id",
    "user_id",
    "reminder_id",
    "subscription_id",
    "occurrence_key",
    "scheduled_for",
    "state",
    "attempt_count",
    "last_error_code",
    "delivered_at",
    "idempotency_key",
    "created_at",
    "updated_at",
  ],
  push_subscriptions: [
    "id",
    "user_id",
    "endpoint_hash",
    "endpoint_ciphertext",
    "p256dh_ciphertext",
    "auth_ciphertext",
    "encryption_key_version",
    "device_label",
    "user_agent_summary",
    "created_at",
    "last_used_at",
    "revoked_at",
  ],
  task_reminders: [
    "id",
    "user_id",
    "task_id",
    "kind",
    "remind_at",
    "offset_minutes",
    "enabled",
    "version",
    "created_at",
    "updated_at",
  ],
} as const;

const expectedIndexes = [
  "notification_deliveries_idempotency_key_idx",
  "notification_deliveries_pkey",
  "notification_deliveries_reminder_state_scheduled_idx",
  "notification_deliveries_subscription_state_scheduled_idx",
  "notification_deliveries_user_state_scheduled_idx",
  "push_subscriptions_active_endpoint_hash_idx",
  "push_subscriptions_pkey",
  "push_subscriptions_user_active_idx",
  "task_reminders_pkey",
  "task_reminders_user_enabled_idx",
  "task_reminders_user_task_unique",
].sort();

describe("P6 fresh notification migration", () => {
  const fixture = createWp02SchemaFixture("p6_notification_fresh");
  let pool: Pool;

  beforeAll(async () => {
    pool = await fixture.setup();
  }, 60_000);

  afterAll(async () => fixture.teardown());

  it("creates only the approved reminder, subscription, and delivery columns", async () => {
    const result = await pool.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name
         from information_schema.columns
        where table_schema = current_schema() and table_name = any($1::text[])
        order by table_name, ordinal_position`,
      [Object.keys(notificationColumns)],
    );
    const actual = Object.fromEntries(
      Object.keys(notificationColumns).map((tableName) => [
        tableName,
        result.rows.filter((row) => row.table_name === tableName).map((row) => row.column_name),
      ]),
    );
    expect(actual).toEqual(notificationColumns);
  });

  it("installs the exact named indexes and tenant-leading foreign keys", async () => {
    const indexes = await pool.query<{ indexname: string }>(
      `select indexname
         from pg_indexes
        where schemaname = current_schema() and tablename = any($1::text[])
        order by indexname`,
      [Object.keys(notificationColumns)],
    );
    expect(indexes.rows.map(({ indexname }) => indexname)).toEqual(expectedIndexes);

    const foreignKeys = await pool.query<{
      name: string;
      columns: string[];
      target_schema: string;
      delete_action: string;
    }>(
      `select constraint_record.conname as name,
              array_agg(attribute.attname::text order by key.ordinality) as columns,
              target_namespace.nspname as target_schema,
              constraint_record.confdeltype::text as delete_action
         from pg_constraint constraint_record
         join pg_class source_table on source_table.oid = constraint_record.conrelid
         join pg_namespace source_namespace on source_namespace.oid = source_table.relnamespace
         join pg_class target_table on target_table.oid = constraint_record.confrelid
         join pg_namespace target_namespace on target_namespace.oid = target_table.relnamespace
         cross join lateral unnest(constraint_record.conkey)
           with ordinality as key(attnum, ordinality)
         join pg_attribute attribute
           on attribute.attrelid = source_table.oid and attribute.attnum = key.attnum
        where source_namespace.nspname = current_schema()
          and source_table.relname = any($1::text[])
          and constraint_record.contype = 'f'
        group by constraint_record.conname, target_namespace.nspname, constraint_record.confdeltype
        order by constraint_record.conname`,
      [Object.keys(notificationColumns)],
    );
    expect(foreignKeys.rows).toEqual([
      {
        name: "notification_deliveries_reminder_owner_fk",
        columns: ["user_id", "reminder_id"],
        target_schema: fixture.schemaName,
        delete_action: "c",
      },
      {
        name: "notification_deliveries_subscription_owner_fk",
        columns: ["user_id", "subscription_id"],
        target_schema: fixture.schemaName,
        delete_action: "a",
      },
      {
        name: "notification_deliveries_user_id_user_id_fk",
        columns: ["user_id"],
        target_schema: fixture.schemaName,
        delete_action: "c",
      },
      {
        name: "push_subscriptions_user_id_user_id_fk",
        columns: ["user_id"],
        target_schema: fixture.schemaName,
        delete_action: "c",
      },
      {
        name: "task_reminders_task_owner_fk",
        columns: ["user_id", "task_id"],
        target_schema: fixture.schemaName,
        delete_action: "c",
      },
      {
        name: "task_reminders_user_id_user_id_fk",
        columns: ["user_id"],
        target_schema: fixture.schemaName,
        delete_action: "c",
      },
    ]);
  });

  it("enforces tenant ownership, global active endpoints, ciphertext, and delivery state shapes", async () => {
    const ownerId = await insertUser(pool, "p6-notification-owner");
    const otherId = await insertUser(pool, "p6-notification-other");
    const taskId = await insertTask(pool, ownerId, "owner");
    const reminderId = randomUUID();
    await pool.query(
      `insert into task_reminders (id, user_id, task_id, kind, offset_minutes)
       values ($1, $2, $3, 'relative_start', 30)`,
      [reminderId, ownerId, taskId],
    );
    await expectPostgresError(
      pool.query(
        `insert into task_reminders (id, user_id, task_id, kind, remind_at)
         values ($1, $2, $3, 'absolute', now() + interval '1 hour')`,
        [randomUUID(), otherId, taskId],
      ),
      "23503",
    );

    const endpointHash = Buffer.alloc(32, 7);
    const subscriptionId = randomUUID();
    await insertSubscription(pool, ownerId, subscriptionId, endpointHash);
    await expectPostgresError(insertSubscription(pool, otherId, randomUUID(), endpointHash), "23505");
    await expectPostgresError(
      pool.query(
        `insert into push_subscriptions
           (id, user_id, endpoint_hash, endpoint_ciphertext, p256dh_ciphertext,
            auth_ciphertext, encryption_key_version)
         values ($1, $2, $3, 'plaintext', $4, $4, 0)`,
        [randomUUID(), ownerId, Buffer.alloc(32, 8), ciphertextEnvelope()],
      ),
      "23514",
    );
    await expectPostgresError(
      pool.query(
        `insert into notification_deliveries
           (id, user_id, reminder_id, subscription_id, scheduled_for, state,
            attempt_count, last_error_code, idempotency_key)
         values ($1, $2, $3, $4, now() + interval '1 hour', 'scheduled', 1, 'stale', $5)`,
        [randomUUID(), ownerId, reminderId, subscriptionId, "a".repeat(64)],
      ),
      "23514",
    );
  });
});

describe("P6 populated upgrade migration", () => {
  const fixture = createWp02SchemaFixture("p6_notification_upgrade");
  let pool: Pool;

  beforeAll(async () => {
    pool = await fixture.setup({ migrateLatest: false });
    const revisions = readCommittedMigrationRevisions();
    const p6Index = revisions.findIndex(({ sql }) =>
      sql.some((statement) => statement.includes('CREATE TABLE "notification_deliveries"')),
    );
    expect(p6Index).toBe(15);
    await applyMigrationSlice(pool, 0, p6Index);
    const userId = await insertUser(pool, "p6-upgrade-owner");
    await insertTask(pool, userId, "preserved");
    await applyMigrationSlice(pool, p6Index, p6Index + 1);
  }, 60_000);

  afterAll(async () => fixture.teardown());

  it("preserves existing task rows and adds empty notification aggregates", async () => {
    await expect(
      pool.query<{ title: string }>(`select title from tasks where title = 'Existing preserved task'`),
    ).resolves.toMatchObject({ rows: [{ title: "Existing preserved task" }] });
    for (const tableName of Object.keys(notificationColumns)) {
      await expect(
        pool.query<{ count: number }>(`select count(*)::int as count from ${tableName}`),
      ).resolves.toMatchObject({ rows: [{ count: 0 }] });
    }
  });
});

async function insertTask(pool: Pool, userId: string, label: string): Promise<string> {
  const listId = randomUUID();
  const taskId = randomUUID();
  await pool.query(
    `insert into task_lists (id, user_id, name, color_token, rank, kind)
     values ($1, $2, $3, 'slate', 'a0', 'regular')`,
    [listId, userId, `Existing ${label} list`],
  );
  await pool.query(
    `insert into tasks (id, user_id, list_id, title, description_md, rank)
     values ($1, $2, $3, $4, '', 'a0')`,
    [taskId, userId, listId, `Existing ${label} task`],
  );
  return taskId;
}

function insertSubscription(pool: Pool, userId: string, id: string, endpointHash: Buffer) {
  const ciphertext = ciphertextEnvelope();
  return pool.query(
    `insert into push_subscriptions
       (id, user_id, endpoint_hash, endpoint_ciphertext, p256dh_ciphertext,
        auth_ciphertext, encryption_key_version)
     values ($1, $2, $3, $4, $4, $4, 0)`,
    [id, userId, endpointHash, ciphertext],
  );
}

function ciphertextEnvelope(): string {
  return `v1.${"A".repeat(16)}.${"B".repeat(2)}.${"C".repeat(22)}`;
}
