import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseExecutor } from "@/shared/db/client";
import { createEntityId } from "@/shared/db/ids";
import { systemClock, type Clock } from "@/shared/time/clock";

import { createTaskListRepository, type TaskListRepository } from "../infrastructure/task-list-repository";

export type InboxSummary = Readonly<{
  id: string;
  name: "Inbox";
  kind: "inbox";
  version: number;
}>;

export function createInboxBootstrapPort(database: DatabaseExecutor, clock: Clock = systemClock) {
  const useCases = createInboxUseCases({ database, clock });
  return { ensureInbox: useCases.ensureInbox };
}

export function getInbox(actor: AuthenticatedActor) {
  return createInboxUseCases({ clock: systemClock }).getInbox(actor);
}

export function createInboxUseCases({ database, clock }: { database?: DatabaseExecutor; clock: Clock }) {
  const repository = createTaskListRepository(database);
  return {
    ensureInbox(userId: string, executor?: DatabaseExecutor) {
      const selectedExecutor = executor ?? database;
      if (!selectedExecutor) throw new Error("Inbox bootstrap requires a transaction executor.");
      return ensureInbox(repository, clock, selectedExecutor, userId);
    },

    async getInbox(actor: AuthenticatedActor): Promise<InboxSummary> {
      const inbox = await repository.findInbox(actor.userId, database);
      if (!inbox) throw new Error("The authenticated account does not have an Inbox.");
      return mapInbox(inbox);
    },
  };
}

async function ensureInbox(
  repository: TaskListRepository,
  clock: Clock,
  executor: DatabaseExecutor,
  userId: string,
): Promise<InboxSummary> {
  const existing = await repository.findInbox(userId, executor);
  if (existing) return mapInbox(existing);

  await repository.insertInbox(
    {
      id: createEntityId(),
      userId,
      createdAt: clock.now(),
    },
    executor,
  );

  const inbox = await repository.findInbox(userId, executor);
  if (!inbox) throw new Error("Inbox bootstrap did not produce an active Inbox.");
  return mapInbox(inbox);
}

function mapInbox(inbox: { id: string; name: string; kind: string; version: number }): InboxSummary {
  if (inbox.name !== "Inbox" || inbox.kind !== "inbox") {
    throw new Error("The active Inbox violates its canonical identity.");
  }
  return { id: inbox.id, name: "Inbox", kind: "inbox", version: inbox.version };
}
