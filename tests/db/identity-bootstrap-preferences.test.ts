import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createIdentityApplication } from "../../modules/identity/application/identity-application.ts";
import { createInboxBootstrapPort, createInboxUseCases } from "../../modules/tasks/application/inbox.ts";
import { createTaskListRepository } from "../../modules/tasks/infrastructure/task-list-repository.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";

import {
  createAuthenticatedAccount,
  createIdentityDatabaseFixture,
  identityTestAuthRuntime,
  identityTestClock,
  signIn,
  signUp,
} from "./support/identity-test-fixture.ts";

const fixture = createIdentityDatabaseFixture("identity-bootstrap");
let database: Database;

describe("identity account bootstrap and preferences isolation", () => {
  beforeAll(async () => {
    database = await fixture.setup();
  });

  afterAll(async () => {
    await fixture.teardown();
  });

  it("signs up, bootstraps exactly one preferences row and Inbox, and self-heals atomically", async () => {
    const application = createIdentityApplication({
      database,
      clock: identityTestClock,
      authRuntime: identityTestAuthRuntime,
    });
    const signedUp = await signUp(application, "first@example.test");

    expect(signedUp.response.status).toBe(200);
    expect(signedUp.cookie).toBe("");
    expect(await accountRowCounts(signedUp.userId)).toEqual({ inboxes: 1, preferences: 1 });

    const signedIn = await signIn(application, "first@example.test");
    const actor = await application.resolveActor(new Headers({ cookie: signedIn.cookie }));
    expect(actor.userId).toBe(signedUp.userId);

    await Promise.all([
      application.bootstrapAccount(actor.userId),
      application.bootstrapAccount(actor.userId),
    ]);
    expect(await accountRowCounts(actor.userId)).toEqual({ inboxes: 1, preferences: 1 });

    await database.transaction(async (transaction) => {
      await transaction.delete(schema.taskLists).where(eq(schema.taskLists.userId, actor.userId));
      await transaction.delete(schema.userPreferences).where(eq(schema.userPreferences.userId, actor.userId));
    });
    expect(await accountRowCounts(actor.userId)).toEqual({ inboxes: 0, preferences: 0 });

    await application.getOptionalSessionIdentity(new Headers({ cookie: signedIn.cookie }));
    expect(await accountRowCounts(actor.userId)).toEqual({ inboxes: 1, preferences: 1 });
  });

  it("rolls back the bootstrap pair after hook failures and self-heals from the authoritative session", async () => {
    const inboxPort = createInboxBootstrapPort(database, identityTestClock);
    let remainingFailures = 2;
    const application = createIdentityApplication({
      database,
      clock: identityTestClock,
      authRuntime: identityTestAuthRuntime,
      inboxPort: {
        async ensureInbox(userId, executor) {
          if (remainingFailures > 0) {
            remainingFailures -= 1;
            throw new Error("Injected Inbox failure");
          }
          return inboxPort.ensureInbox(userId, executor);
        },
      },
    });

    const signedUp = await signUp(application, "rollback@example.test");
    expect(await accountRowCounts(signedUp.userId)).toEqual({ inboxes: 0, preferences: 0 });

    const signedIn = await signIn(application, "rollback@example.test");
    expect(await accountRowCounts(signedUp.userId)).toEqual({ inboxes: 0, preferences: 0 });

    const identity = await application.getOptionalSessionIdentity(new Headers({ cookie: signedIn.cookie }));
    expect(identity?.actor.userId).toBe(signedUp.userId);
    expect(await accountRowCounts(signedUp.userId)).toEqual({ inboxes: 1, preferences: 1 });
  });

  it("scopes preferences and Inbox reads to each actor and rejects stale preference writes", async () => {
    const application = createIdentityApplication({
      database,
      clock: identityTestClock,
      authRuntime: identityTestAuthRuntime,
    });
    const userA = await createAuthenticatedAccount(application, "owner-a@example.test");
    const userB = await createAuthenticatedAccount(application, "owner-b@example.test");
    const actorA = await application.resolveActor(new Headers({ cookie: userA.cookie }));
    const actorB = await application.resolveActor(new Headers({ cookie: userB.cookie }));

    const savedA = await application.updateUserPreferences(actorA, 1, {
      timezone: "Asia/Singapore",
      theme: "dark",
    });
    expect(savedA).toMatchObject({ timezone: "Asia/Singapore", theme: "dark", version: 2 });
    expect(await application.getUserPreferences(actorB)).toMatchObject({
      timezone: "UTC",
      theme: "system",
      version: 1,
    });
    await expect(application.updateUserPreferences(actorA, 1, { theme: "light" })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const inboxUseCases = createInboxUseCases({ database, clock: identityTestClock });
    const inboxA = await inboxUseCases.getInbox(actorA);
    const inboxB = await inboxUseCases.getInbox(actorB);
    expect(inboxA.id).not.toBe(inboxB.id);
    expect(await createTaskListRepository(database).findInbox(actorA.userId)).toMatchObject({
      id: inboxA.id,
    });
  });

  async function accountRowCounts(userId: string) {
    const preferences = await database
      .select()
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, userId));
    const inboxes = await database
      .select()
      .from(schema.taskLists)
      .where(and(eq(schema.taskLists.userId, userId), eq(schema.taskLists.kind, "inbox")));
    return { preferences: preferences.length, inboxes: inboxes.length };
  }
});
