import { eq } from "drizzle-orm";

import type { Database, DatabaseExecutor } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";

export type EncryptedOpenAICredential = Readonly<{
  encryptedApiKey: string;
  initializationVector: string;
  authenticationTag: string;
  encryptionVersion: number;
}>;

export function createOpenAICredentialRepository(database: Database) {
  return {
    async findByUserId(userId: string, executor: DatabaseExecutor = database) {
      const [row] = await executor
        .select({
          encryptedApiKey: schema.openaiCredentials.encryptedApiKey,
          initializationVector: schema.openaiCredentials.initializationVector,
          authenticationTag: schema.openaiCredentials.authenticationTag,
          encryptionVersion: schema.openaiCredentials.encryptionVersion,
        })
        .from(schema.openaiCredentials)
        .where(eq(schema.openaiCredentials.userId, userId))
        .limit(1);
      return row ?? null;
    },

    async save(userId: string, credential: EncryptedOpenAICredential, executor: DatabaseExecutor = database) {
      const now = new Date();
      await executor
        .insert(schema.openaiCredentials)
        .values({ userId, ...credential, createdAt: now, updatedAt: now })
        .onConflictDoUpdate({
          target: schema.openaiCredentials.userId,
          set: { ...credential, updatedAt: now },
        });
    },

    async delete(userId: string, executor: DatabaseExecutor = database) {
      await executor.delete(schema.openaiCredentials).where(eq(schema.openaiCredentials.userId, userId));
    },
  };
}
