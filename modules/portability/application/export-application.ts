import { readPortablePlannerProposals } from "@/modules/assistant";
import { readPortableIdentity } from "@/modules/identity";
import { readPortableHabits } from "@/modules/habits";
import { readPortableTasks } from "@/modules/tasks";
import type { AuthenticatedActor } from "@/shared/auth/actor";
import { getDatabase, type Database, type DatabaseTransaction } from "@/shared/db/client";
import { ApplicationError } from "@/shared/http/application-error";
import { systemClock, type Clock } from "@/shared/time/clock";

import {
  PORTABLE_SECTION_SCHEMA_VERSION,
  PORTABLE_HABITS_SECTION_SCHEMA_VERSION,
  PORTABLE_TASKS_SECTION_SCHEMA_VERSION,
  USER_EXPORT_SCHEMA_VERSION,
} from "./export-contract-primitives";
import { userExportEnvelopeSchema, type UserExportEnvelope } from "./export-envelope-contract";
import { findExportRelationshipErrors } from "./export-relationship-validation";

type ExportSourceReader = (actor: AuthenticatedActor, transaction: DatabaseTransaction) => Promise<unknown>;

type SnapshotRunner = Readonly<{
  run<T>(work: (transaction: DatabaseTransaction) => Promise<T>): Promise<T>;
}>;

export function createPortabilityApplication(
  dependencies: Readonly<{
    snapshot: SnapshotRunner;
    clock?: Clock;
    readIdentity?: ExportSourceReader;
    readTasks?: ExportSourceReader;
    readHabits?: ExportSourceReader;
    readProposals?: ExportSourceReader;
  }>,
) {
  const clock = dependencies.clock ?? systemClock;
  const readIdentity = dependencies.readIdentity ?? readPortableIdentity;
  const readTasks = dependencies.readTasks ?? readPortableTasks;
  const readHabits = dependencies.readHabits ?? readPortableHabits;
  const readProposals = dependencies.readProposals ?? readPortablePlannerProposals;

  return {
    async exportUserData(actor: AuthenticatedActor): Promise<UserExportEnvelope> {
      return dependencies.snapshot.run(async (transaction) => {
        const identity = await readIdentity(actor, transaction);
        const tasks = await readTasks(actor, transaction);
        const habits = await readHabits(actor, transaction);
        const proposals = await readProposals(actor, transaction);
        const envelope = userExportEnvelopeSchema.parse({
          schemaVersion: USER_EXPORT_SCHEMA_VERSION,
          exportedAt: clock.now().toISOString(),
          identity: { schemaVersion: PORTABLE_SECTION_SCHEMA_VERSION, ...asObject(identity) },
          tasks: { schemaVersion: PORTABLE_TASKS_SECTION_SCHEMA_VERSION, ...asObject(tasks) },
          habits: { schemaVersion: PORTABLE_HABITS_SECTION_SCHEMA_VERSION, ...asObject(habits) },
          assistant: {
            schemaVersion: PORTABLE_SECTION_SCHEMA_VERSION,
            proposals,
          },
        });
        if (envelope.identity.profile.id !== actor.userId) {
          throw new ApplicationError(
            "INTERNAL",
            "The export identity did not match the authenticated actor.",
          );
        }
        const relationshipErrors = findExportRelationshipErrors(envelope);
        if (relationshipErrors.length > 0) {
          throw new ApplicationError("INTERNAL", "The export relationships could not be validated safely.");
        }
        return envelope;
      });
    },
  } as const;
}

export function createPostgresExportSnapshot(database: Database = getDatabase()): SnapshotRunner {
  return {
    run: <T>(work: (transaction: DatabaseTransaction) => Promise<T>) =>
      database.transaction(work, { isolationLevel: "repeatable read", accessMode: "read only" }),
  };
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApplicationError("INTERNAL", "An export source returned an invalid section.");
  }
  return value as Record<string, unknown>;
}
