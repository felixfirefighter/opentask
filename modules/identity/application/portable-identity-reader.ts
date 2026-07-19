import type { AuthenticatedActor } from "@/shared/auth/actor";
import type { DatabaseExecutor } from "@/shared/db/client";
import { ApplicationError } from "@/shared/http/application-error";

import { preferenceDocumentSchema, preferenceSchemaVersion } from "./preferences-contract";
import { createPortableIdentityRepository } from "../infrastructure/portable-identity-repository";

export async function readPortableIdentity(actor: AuthenticatedActor, executor: DatabaseExecutor) {
  const row = await createPortableIdentityRepository(executor).readOwned(actor.userId);
  if (!row || row.user.id !== actor.userId || row.preferences.userId !== actor.userId) {
    throw new ApplicationError("NOT_FOUND", "The account export source was not found.");
  }
  if (row.preferences.schemaVersion !== preferenceSchemaVersion) {
    throw new ApplicationError("INTERNAL", "The account preferences cannot be exported safely.");
  }

  return {
    profile: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      createdAt: row.user.createdAt.toISOString(),
      updatedAt: row.user.updatedAt.toISOString(),
    },
    preferences: {
      schemaVersion: preferenceSchemaVersion,
      version: row.preferences.version,
      ...preferenceDocumentSchema.parse(row.preferences.preferences),
      createdAt: row.preferences.createdAt.toISOString(),
      updatedAt: row.preferences.updatedAt.toISOString(),
    },
  } as const;
}
