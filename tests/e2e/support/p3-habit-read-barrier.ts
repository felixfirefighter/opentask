import { Client } from "pg";

export type HabitReadBarrier = Readonly<{
  release: () => Promise<void>;
}>;

export async function acquireHabitReadBarrier(): Promise<HabitReadBarrier> {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  let released = false;

  try {
    await client.query("begin");
    await client.query("set local lock_timeout = '60s'");
    await client.query("lock table habits in access exclusive mode");
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

function databaseUrl(): string {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(".env.local");
    } catch {
      // CI may provide DATABASE_URL without a repository-local environment file.
    }
  }
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("P3 habit-route evidence requires DATABASE_URL.");
  return value;
}
