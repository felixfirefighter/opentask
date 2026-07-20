import { randomUUID } from "node:crypto";

import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

import type { TaskWireRecord } from "./wp03-tasks";

export type TaskReadBarrier = Readonly<{
  release: () => Promise<void>;
}>;

export async function readAuthenticatedUserId(page: Page): Promise<string> {
  const response = await page.context().request.get("/api/auth/get-session");
  expect(response.status()).toBe(200);
  const body = (await response.json()) as unknown;
  expect(body).toMatchObject({ user: { id: expect.any(String) } });
  return (body as { user: { id: string } }).user.id;
}

export async function readTaskForConflict(page: Page, taskId: string): Promise<TaskWireRecord> {
  const response = await page.context().request.get(`/api/v1/tasks/${taskId}`);
  expect(response.status()).toBe(200);
  const task = (await response.json()) as TaskWireRecord;
  expect(task).toMatchObject({ id: taskId, version: expect.any(Number) });
  return task;
}

export async function acquireTaskReadBarrier(): Promise<TaskReadBarrier> {
  const client = await connectedClient();
  let released = false;
  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '60s'");
    await client.query("lock table tasks in access exclusive mode");
  } catch (error) {
    await client.end().catch(() => undefined);
    throw error;
  }

  return {
    async release() {
      if (released) return;
      released = true;
      try {
        await client.query("rollback");
      } finally {
        await client.end();
      }
    },
  };
}

export async function seedOccurrenceAheadOfTask(
  userId: string,
  taskId: string,
  occurrenceKey: string,
): Promise<number> {
  return withDatabase(async (client) => {
    const result = await client.query<{ taskVersion: number }>(
      `insert into task_occurrence_events
         (id, user_id, task_id, occurrence_key, state, task_version)
       select $1, user_id, id, $3, 'open', version + 1
         from tasks
        where user_id = $2 and id = $4 and deleted_at is null
       returning task_version as "taskVersion"`,
      [randomUUID(), userId, occurrenceKey, taskId],
    );
    expect(result.rows).toHaveLength(1);
    return result.rows[0]!.taskVersion;
  });
}

export async function deleteIsolatedDemoUser(userId: string): Promise<void> {
  await withDatabase(async (client) => {
    const result = await client.query(`delete from "user" where id = $1`, [userId]);
    expect(result.rowCount).toBe(1);
  });
}

async function withDatabase<Result>(work: (client: Client) => Promise<Result>): Promise<Result> {
  const client = await connectedClient();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

async function connectedClient(): Promise<Client> {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  return client;
}

function databaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(".env.local");
    } catch {
      // CI may provide DATABASE_URL without a repository-local environment file.
    }
  }
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("P2 task-route evidence requires DATABASE_URL.");
  return value;
}
