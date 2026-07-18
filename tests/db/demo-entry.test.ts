import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { like } from "drizzle-orm";
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
}: {
  origin?: string | null;
  contentType?: string;
}) {
  const headers = new Headers({
    "content-type": contentType,
    "sec-fetch-site": "same-origin",
    "x-real-ip": "203.0.113.90",
  });
  if (origin) headers.set("origin", origin);
  return new Request(`${authRuntime.baseUrl}/api/v1/demo`, {
    method: "POST",
    headers,
    body: contentType === "application/json" ? JSON.stringify({}) : "demo=true",
  });
}
