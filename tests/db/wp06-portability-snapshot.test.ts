import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readPortablePlannerProposals } from "../../modules/assistant/index.ts";
import { readPortableIdentity } from "../../modules/identity/index.ts";
import {
  createPortabilityApplication,
  createPostgresExportSnapshot,
} from "../../modules/portability/index.ts";
import { readPortableTasks } from "../../modules/tasks/index.ts";
import type { AuthenticatedActor } from "../../shared/auth/actor.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";

import { EXPORT_INSTANT, portableEntityIds, seedPortableTenant } from "./support/export-test-data.ts";
import { createWp02SchemaFixture } from "./wp02-schema-support.ts";

const fixture = createWp02SchemaFixture("portability_snapshot");
let pool: Pool;
let database: Database;
let owner: AuthenticatedActor;
let seed: Awaited<ReturnType<typeof seedPortableTenant>>;

describe("portable export PostgreSQL snapshot", () => {
  beforeAll(async () => {
    pool = await fixture.setup();
    database = drizzle(pool, { schema });
    owner = { userId: randomUUID() };
    seed = await seedPortableTenant(pool, {
      actor: owner,
      email: `snapshot-${owner.userId}@example.test`,
      marker: "SNAPSHOT_BEFORE",
      timezone: "Asia/Singapore",
      timedStartInput: "2026-07-20T09:00:00+08:00",
      timedEndInput: "2026-07-20T10:00:00+08:00",
      timedStartUtc: "2026-07-20T01:00:00.000Z",
      timedEndUtc: "2026-07-20T02:00:00.000Z",
    });
  });

  afterAll(async () => fixture.teardown());

  it("holds one repeatable-read view while a coordinated cross-module mutation commits", async () => {
    const identityRead = deferred();
    const continueSnapshot = deferred();
    const application = createPortabilityApplication({
      snapshot: createPostgresExportSnapshot(database),
      clock: { now: () => new Date(EXPORT_INSTANT) },
      readIdentity: async (actor, transaction) => {
        const identity = await readPortableIdentity(actor, transaction);
        identityRead.resolve();
        await continueSnapshot.promise;
        return identity;
      },
      readTasks: readPortableTasks,
      readProposals: readPortablePlannerProposals,
    });

    const inFlightExport = application.exportUserData(owner);
    await identityRead.promise;
    let mutationError: unknown;
    try {
      await commitConcurrentMutation();
    } catch (error) {
      mutationError = error;
    } finally {
      continueSnapshot.resolve();
    }
    const duringMutation = await inFlightExport;
    if (mutationError !== undefined) throw mutationError;

    const rootDuringMutation = duringMutation.tasks.tasks.find(({ id }) => id === portableEntityIds.rootTask);
    expect(duringMutation.identity.profile.name).toBe(seed.ownerName);
    expect(rootDuringMutation).toMatchObject({ title: seed.rootTaskTitle, version: 1 });

    const afterCommit = await createPortabilityApplication({
      snapshot: createPostgresExportSnapshot(database),
      clock: { now: () => new Date(EXPORT_INSTANT) },
    }).exportUserData(owner);
    const rootAfterCommit = afterCommit.tasks.tasks.find(({ id }) => id === portableEntityIds.rootTask);
    expect(afterCommit.identity.profile.name).toBe("SNAPSHOT_AFTER owner");
    expect(rootAfterCommit).toMatchObject({
      title: seed.updatedRootTaskTitle,
      version: 2,
      updatedAt: "2026-07-19T16:30:45.678Z",
    });
  });
});

async function commitConcurrentMutation() {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`update "user" set name = $1, updated_at = $2 where id = $3`, [
      "SNAPSHOT_AFTER owner",
      "2026-07-19T16:30:45.678Z",
      owner.userId,
    ]);
    await client.query(
      `update tasks
          set title = $1, version = version + 1, updated_at = $2
        where user_id = $3 and id = $4`,
      [seed.updatedRootTaskTitle, "2026-07-19T16:30:45.678Z", owner.userId, portableEntityIds.rootTask],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve } as const;
}
