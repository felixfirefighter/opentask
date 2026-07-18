import { createHash, randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { expect } from "vitest";

import type { createIdentityApplication } from "../../../modules/identity/application/identity-application.ts";
import { getTestDatabaseUrl } from "../../../shared/config/environment.ts";
import type { Database } from "../../../shared/db/client.ts";
import { schema } from "../../../shared/db/schema.ts";
import type { Clock } from "../../../shared/time/clock.ts";

export const identityTestClock: Clock = {
  now: () => new Date("2026-07-18T00:00:00.000Z"),
};

export const identityTestAuthRuntime = {
  baseUrl: "http://localhost:3000",
  secret: "identity-test-secret-with-more-than-32-characters",
  secureCookies: false,
} as const;

export const identityTestPassword = "correct horse battery staple";

type IdentityApplication = ReturnType<typeof createIdentityApplication>;

export function createIdentityDatabaseFixture(suiteName: string) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const schemaName = `${suiteName}_${process.pid}_${suffix}`;
  const adminPool = new Pool({
    connectionString: getTestDatabaseUrl(),
    max: 1,
    application_name: `opentask-${suiteName}-admin`,
  });
  let isolatedPool: Pool | undefined;

  return {
    async setup(): Promise<Database> {
      await adminPool.query(`create schema "${schemaName}"`);
      isolatedPool = new Pool({
        connectionString: getTestDatabaseUrl(),
        max: 6,
        application_name: `opentask-${suiteName}-isolated`,
        options: `-c search_path=${schemaName}`,
      });
      const database = drizzle(isolatedPool, { schema });
      await migrate(database, { migrationsFolder: "drizzle", migrationsSchema: schemaName });
      return database;
    },

    async teardown(): Promise<void> {
      await isolatedPool?.end();
      await adminPool.query(`drop schema if exists "${schemaName}" cascade`);
      await adminPool.end();
    },
  };
}

export function authRequest(
  path: string,
  body: Record<string, unknown>,
  cookie?: string,
  ip = "192.0.2.1",
  origin: string = identityTestAuthRuntime.baseUrl,
) {
  const headers = new Headers({
    "content-type": "application/json",
    origin,
    "x-real-ip": ip,
  });
  if (cookie) headers.set("cookie", cookie);
  return new Request(`${origin}/api/auth${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export async function signUp(application: IdentityApplication, email: string) {
  const response = await application.handleAuthRequest(
    authRequest(
      "/sign-up/email",
      { email, password: identityTestPassword },
      undefined,
      clientAddressForEmail(email),
    ),
  );
  const payload = (await response.clone().json()) as AuthResponsePayload;
  return {
    response,
    payload,
    userId: payload.user.id,
    cookie: cookiesFromSetCookie(response.headers.getSetCookie()),
  };
}

export async function signIn(application: IdentityApplication, email: string) {
  const response = await application.handleAuthRequest(
    authRequest(
      "/sign-in/email",
      { email, password: identityTestPassword },
      undefined,
      clientAddressForEmail(email),
    ),
  );
  return {
    response,
    cookie: cookiesFromSetCookie(response.headers.getSetCookie()),
  };
}

export async function createAuthenticatedAccount(application: IdentityApplication, email: string) {
  const signedUp = await signUp(application, email);
  const signedIn = await signIn(application, email);
  expect(signedIn.response.status).toBe(200);
  expect(signedIn.cookie).not.toBe("");
  return { ...signedUp, cookie: signedIn.cookie };
}

function clientAddressForEmail(email: string): string {
  const digest = createHash("sha256").update(email).digest();
  return `198.18.${digest[0]}.${digest[1]}`;
}

function cookiesFromSetCookie(values: readonly string[]): string {
  return values
    .map((value) => value.split(";", 1)[0])
    .filter(Boolean)
    .join("; ");
}

type AuthResponsePayload = {
  token: string | null;
  user: { id: string; email: string; name: string };
};
