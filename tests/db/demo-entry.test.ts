import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq, like, ne, sql } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { DemoDatasetSeeder } from "../../modules/identity/application/contracts.ts";
import { createIdentityApplication } from "../../modules/identity/application/identity-application.ts";
import { createDemoEntryLimiter } from "../../modules/identity/infrastructure/demo-entry-limiter.ts";
import { getTestDatabaseUrl } from "../../shared/config/environment.ts";
import { schema } from "../../shared/db/schema.ts";
import type { Clock } from "../../shared/time/clock.ts";

const productionDependencies = vi.hoisted(() => ({
  get: vi.fn<() => unknown>(),
}));

vi.mock("../../modules/identity/infrastructure/production-dependencies.ts", () => ({
  getProductionIdentityDependencies: productionDependencies.get,
}));

const schemaName = `demo_${process.pid}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const adminPool = new Pool({
  connectionString: getTestDatabaseUrl(),
  max: 1,
  application_name: "opentask-demo-test-admin",
});
let isolatedPool: Pool;
let database: ReturnType<typeof drizzle<typeof schema>>;
const clock: Clock = { now: () => new Date("2026-07-18T00:00:00.000Z") };
const authRuntime = {
  baseUrl: "http://localhost:3000",
  secret: "demo-test-secret-with-more-than-32-characters",
  secureCookies: false,
} as const;

describe("isolated demo entry", () => {
  beforeAll(async () => {
    await adminPool.query(`create schema "${schemaName}"`);
    isolatedPool = new Pool({
      connectionString: getTestDatabaseUrl(),
      max: 8,
      application_name: "opentask-demo-test-isolated",
      options: `-c search_path=${schemaName}`,
    });
    database = drizzle(isolatedPool, { schema });
    await migrate(database, { migrationsFolder: "drizzle", migrationsSchema: schemaName });
    productionDependencies.get.mockReturnValue({ database, clock, authRuntime });
  });

  afterAll(async () => {
    await isolatedPool.end();
    await adminPool.query(`drop schema if exists "${schemaName}" cascade`);
    await adminPool.end();
  });

  it("allows exactly five of six concurrent first-window attempts", async () => {
    const limiter = createDemoEntryLimiter(database, clock);
    const attempts = await Promise.all(Array.from({ length: 6 }, () => limiter.consume("198.51.100.81")));

    expect(attempts.filter(Boolean)).toHaveLength(5);
    expect(attempts.filter((allowed) => !allowed)).toHaveLength(1);
    const [counter] = await database
      .select({ count: schema.rateLimit.count })
      .from(schema.rateLimit)
      .where(like(schema.rateLimit.key, "demo-entry:%"));
    expect(counter?.count).toBe(5);
  });

  it("rejects login-CSRF request shapes before creating a user or session", async () => {
    const initialCounts = await authSideEffectCounts();
    const { POST } = await import("../../app/api/v1/demo/route.ts");
    const rejectedRequests = [
      {
        request: demoMutationRequest({ origin: null }),
        status: 403,
      },
      {
        request: demoMutationRequest({ origin: "https://attacker.example" }),
        status: 403,
      },
      {
        request: demoMutationRequest({ contentType: "application/x-www-form-urlencoded" }),
        status: 400,
      },
    ] as const;

    for (const { request, status } of rejectedRequests) {
      const response = await POST(request);
      expect(response.status).toBe(status);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(await authSideEffectCounts()).toEqual(initialCounts);
    }
  });

  it("creates a session-backed visitor and seeds the real task dataset through the route", async () => {
    const { POST } = await import("../../app/api/v1/demo/route.ts");
    const response = await POST(demoMutationRequest({ clientAddress: "203.0.113.91" }));

    expect(response.status).toBe(200);
    await expect(response.clone().json()).resolves.toEqual({ mode: "created", redirectTo: "/inbox" });
    const cookie = cookiesFromSetCookie(response.headers.getSetCookie());
    expect(cookie).not.toBe("");

    const identity = await createIdentityApplication({
      database,
      clock,
      authRuntime,
    }).getOptionalSessionIdentity(new Headers({ cookie }));
    expect(identity?.email).toMatch(/^demo-.*@demo\.opentask\.invalid$/);
    const taskRows = await database
      .select({ title: schema.tasks.title })
      .from(schema.tasks)
      .where(eq(schema.tasks.userId, identity!.actor.userId));
    expect(taskRows).toHaveLength(10);
    expect(taskRows).toContainEqual({ title: "Record the two-minute demo" });
    expect(taskRows).toContainEqual({ title: "Draft the launch narrative" });

    const otherResponse = await POST(demoMutationRequest({ clientAddress: "203.0.113.92" }));
    const otherCookie = cookiesFromSetCookie(otherResponse.headers.getSetCookie());
    const otherIdentity = await createIdentityApplication({
      database,
      clock,
      authRuntime,
    }).getOptionalSessionIdentity(new Headers({ cookie: otherCookie }));
    await insertPendingProposal(identity!.actor.userId);
    await insertPendingProposal(otherIdentity!.actor.userId);

    const resetResponse = await POST(demoMutationRequest({ clientAddress: "203.0.113.91", cookie }));
    expect(resetResponse.status).toBe(200);
    await expect(resetResponse.json()).resolves.toEqual({ mode: "reset", redirectTo: "/inbox" });
    const proposals = await database
      .select({ userId: schema.plannerProposals.userId })
      .from(schema.plannerProposals);
    expect(proposals).toEqual([{ userId: otherIdentity!.actor.userId }]);
  });

  it("rolls task data and planner proposals back together when reset cannot finish", async () => {
    const { POST } = await import("../../app/api/v1/demo/route.ts");
    const created = await POST(demoMutationRequest({ clientAddress: "203.0.113.93" }));
    const cookie = cookiesFromSetCookie(created.headers.getSetCookie());
    const identity = await createIdentityApplication({
      database,
      clock,
      authRuntime,
    }).getOptionalSessionIdentity(new Headers({ cookie }));
    const userId = identity!.actor.userId;
    await insertPendingProposal(userId);
    await database
      .update(schema.tasks)
      .set({ title: "Keep the previous demo after failure" })
      .where(and(eq(schema.tasks.userId, userId), eq(schema.tasks.title, "Record the two-minute demo")));
    await database
      .update(schema.tasks)
      .set({ title: "Earlier isolated demo task" })
      .where(and(ne(schema.tasks.userId, userId), eq(schema.tasks.title, "Record the two-minute demo")));
    await database.execute(
      sql`alter table tasks add constraint demo_entry_forced_failure
          check (title <> 'Record the two-minute demo')`,
    );

    try {
      const failedReset = await POST(demoMutationRequest({ clientAddress: "203.0.113.93", cookie }));
      expect(failedReset.status).toBe(500);
      expect(
        await database
          .select({ id: schema.plannerProposals.id })
          .from(schema.plannerProposals)
          .where(eq(schema.plannerProposals.userId, userId)),
      ).toHaveLength(1);
      expect(
        await database
          .select({ title: schema.tasks.title })
          .from(schema.tasks)
          .where(eq(schema.tasks.userId, userId)),
      ).toContainEqual({ title: "Keep the previous demo after failure" });
    } finally {
      await database.execute(sql`alter table tasks drop constraint demo_entry_forced_failure`);
    }
  });

  it("asks the injected seeder to reset only the current demo actor", async () => {
    const seededByUser = new Map<string, number>();
    const demoSeeder: DemoDatasetSeeder = {
      reset: async (userId) => {
        seededByUser.set(userId, (seededByUser.get(userId) ?? 0) + 1);
      },
    };
    const application = createIdentityApplication({
      database,
      clock,
      authRuntime,
      demoSeeder,
    });

    const demoA = await application.enterDemo(demoRequest("192.0.2.30").headers);
    const demoB = await application.enterDemo(demoRequest("192.0.2.31").headers);
    expect(seededByUser).toEqual(
      new Map([
        [demoA.actor.userId, 1],
        [demoB.actor.userId, 1],
      ]),
    );

    await application.enterDemo(
      demoRequest("192.0.2.30", cookiesFromSetCookie(demoA.setCookieHeaders)).headers,
    );

    expect(seededByUser.get(demoA.actor.userId)).toBe(2);
    expect(seededByUser.get(demoB.actor.userId)).toBe(1);
    expect(seededByUser.size).toBe(2);
  });

  async function authSideEffectCounts() {
    const [users, sessions, rateLimits] = await Promise.all([
      database.select({ id: schema.user.id }).from(schema.user),
      database.select({ id: schema.session.id }).from(schema.session),
      database.select({ id: schema.rateLimit.id }).from(schema.rateLimit),
    ]);
    return {
      users: users.length,
      sessions: sessions.length,
      rateLimits: rateLimits.length,
    };
  }
});

function cookiesFromSetCookie(values: readonly string[]): string {
  return values
    .map((value) => value.split(";", 1)[0])
    .filter(Boolean)
    .join("; ");
}

function demoRequest(clientAddress: string, cookie?: string) {
  const headers = new Headers({
    "content-type": "application/json",
    origin: authRuntime.baseUrl,
    "sec-fetch-site": "same-origin",
    "x-real-ip": clientAddress,
  });
  if (cookie) headers.set("cookie", cookie);
  return new Request(`${authRuntime.baseUrl}/api/v1/demo`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
}

function demoMutationRequest({
  origin = authRuntime.baseUrl,
  contentType = "application/json",
  clientAddress = "203.0.113.90",
  cookie,
}: {
  origin?: string | null;
  contentType?: string;
  clientAddress?: string;
  cookie?: string;
}) {
  const headers = new Headers({
    "content-type": contentType,
    "sec-fetch-site": "same-origin",
    "x-real-ip": clientAddress,
  });
  if (origin) headers.set("origin", origin);
  if (cookie) headers.set("cookie", cookie);
  return new Request(`${authRuntime.baseUrl}/api/v1/demo`, {
    method: "POST",
    headers,
    body: contentType === "application/json" ? JSON.stringify({}) : "demo=true",
  });
}

async function insertPendingProposal(userId: string): Promise<void> {
  const createdAt = clock.now();
  await database.insert(schema.plannerProposals).values({
    id: randomUUID(),
    userId,
    planningDate: "2026-07-18",
    schemaVersion: 1,
    proposal: {},
    contextVersions: {},
    status: "pending",
    model: "gpt-5.6",
    promptVersion: "demo-reset-test",
    idempotencyKey: randomUUID(),
    createdAt,
    expiresAt: new Date(createdAt.getTime() + 60_000),
    appliedAt: null,
  });
}
