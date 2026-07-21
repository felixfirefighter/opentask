import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createIdentityApplication } from "../../modules/identity/application/identity-application.ts";
import type { Database } from "../../shared/db/client.ts";
import { schema } from "../../shared/db/schema.ts";

import {
  authRequest,
  createAuthenticatedAccount,
  createIdentityDatabaseFixture,
  identityTestAuthRuntime,
  identityTestClock,
  identityTestPassword,
  signUp,
} from "./support/identity-test-fixture.ts";

const fixture = createIdentityDatabaseFixture("identity-auth");
let database: Database;

describe("identity authentication and request security", () => {
  beforeAll(async () => {
    database = await fixture.setup();
  });

  afterAll(async () => {
    await fixture.teardown();
  });

  it("denies missing and tampered sessions, signs out, and never trusts cookie presence", async () => {
    const application = createApplication();
    await expect(application.resolveActor(new Headers())).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await expect(
      application.resolveActor(new Headers({ cookie: "opentask.session_token=forged" })),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

    const authenticated = await createAuthenticatedAccount(application, "signout@example.test");
    expect(await application.resolveActor(new Headers({ cookie: authenticated.cookie }))).toBeTruthy();
    const signOutResponse = await application.handleAuthRequest(
      authRequest("/sign-out", {}, authenticated.cookie),
    );
    expect(signOutResponse.status).toBe(200);
    await expect(
      application.resolveActor(new Headers({ cookie: authenticated.cookie })),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("resets only the authenticated profile and cascades its workspace and provider credential", async () => {
    const application = createApplication();
    const owner = await createAuthenticatedAccount(application, "reset-owner@example.test");
    const other = await createAuthenticatedAccount(application, "reset-other@example.test");
    const ownerIdentity = await application.resolveActor(new Headers({ cookie: owner.cookie }));
    const otherIdentity = await application.resolveActor(new Headers({ cookie: other.cookie }));

    await database.insert(schema.openaiCredentials).values({
      userId: ownerIdentity.userId,
      encryptedApiKey: "encrypted-test-value",
      initializationVector: "test-iv",
      authenticationTag: "test-tag",
      encryptionVersion: 1,
    });

    await application.resetApp(ownerIdentity);

    await expect(application.resolveActor(new Headers({ cookie: owner.cookie }))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    await expect(application.resolveActor(new Headers({ cookie: other.cookie }))).resolves.toEqual(
      otherIdentity,
    );
    expect(
      await database
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.id, ownerIdentity.userId)),
    ).toEqual([]);
    expect(
      await database
        .select()
        .from(schema.openaiCredentials)
        .where(eq(schema.openaiCredentials.userId, ownerIdentity.userId)),
    ).toEqual([]);
    expect(
      await database.select().from(schema.taskLists).where(eq(schema.taskLists.userId, otherIdentity.userId)),
    ).not.toEqual([]);
  });

  it("returns generic cookie-free signup responses for new and existing email addresses", async () => {
    const application = createApplication();
    const email = "generic-signup@example.test";

    const first = await signUp(application, email);
    const existing = await signUp(application, email);

    for (const signup of [first, existing]) {
      expect(signup.response.status).toBe(200);
      expect(signup.cookie).toBe("");
      expect(signup.payload).toMatchObject({
        token: null,
        user: { email, name: "OpenTask user" },
      });
    }
    expect(await accountRowCounts(first.userId)).toEqual({ inboxes: 1, preferences: 1 });
    const [storedUser] = await database
      .select({ name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.id, first.userId));
    expect(storedUser?.name).toBe("OpenTask user");
  });

  it("allows only the bounded public auth contract and keeps origin checks enabled", async () => {
    const application = createApplication();
    const credentials = {
      email: "contract@example.test",
      password: identityTestPassword,
    };

    const unknownField = await application.handleAuthRequest(
      authRequest("/sign-up/email", { ...credentials, name: "Client-controlled name" }),
    );
    expect(unknownField.status).toBe(400);

    const userCountBeforeReservedAttempt = (await database.select({ id: schema.user.id }).from(schema.user))
      .length;
    const reservedDemoIdentity = await application.handleAuthRequest(
      authRequest("/sign-up/email", {
        email: "visitor@DEMO.OPENTASK.INVALID",
        password: identityTestPassword,
      }),
    );
    expect(reservedDemoIdentity.status).toBe(400);
    await expect(reservedDemoIdentity.clone().json()).resolves.toMatchObject({
      code: "VALIDATION_FAILED",
      detail: "Review the submitted values and try again.",
    });
    expect(await database.select({ id: schema.user.id }).from(schema.user)).toHaveLength(
      userCountBeforeReservedAttempt,
    );

    const oversized = await application.handleAuthRequest(
      authRequest("/sign-up/email", { ...credentials, padding: "x".repeat(1200) }),
    );
    expect(oversized.status).toBe(400);

    const unknownEndpoint = await application.handleAuthRequest(
      authRequest("/request-password-reset", { email: credentials.email }),
    );
    expect(unknownEndpoint.status).toBe(404);

    const wrongMethod = await application.handleAuthRequest(
      new Request(`${identityTestAuthRuntime.baseUrl}/api/auth/sign-up/email`, { method: "GET" }),
    );
    expect(wrongMethod.status).toBe(404);

    const publicSession = await application.handleAuthRequest(
      new Request(`${identityTestAuthRuntime.baseUrl}/api/auth/get-session`, { method: "GET" }),
    );
    expect(publicSession.status).toBe(200);

    const crossOriginRequest = authRequest("/sign-up/email", credentials, undefined, "192.0.2.99");
    crossOriginRequest.headers.set("origin", "https://attacker.example");
    const crossOrigin = await application.handleAuthRequest(crossOriginRequest);
    expect(crossOrigin.status).toBe(403);
  });

  it("rate limits credential attempts by x-real-ip and emits secure sign-in cookies", async () => {
    const application = createApplication();
    expect(application.security).toMatchObject({
      clientAddressHeaders: ["x-real-ip"],
      credentialRateLimitMaximum: 5,
      credentialRateLimitWindowSeconds: 60,
      globalRateLimitMaximum: 10_000,
      globalRateLimitWindowSeconds: 3600,
      ipv6Subnet: 64,
      rateLimitEnabled: true,
    });

    const limitedAddress = "198.51.100.21";
    const attempts = [];
    for (let index = 0; index < 6; index += 1) {
      attempts.push(
        await application.handleAuthRequest(
          authRequest(
            "/sign-in/email",
            { email: "missing@example.test", password: "incorrect password" },
            undefined,
            limitedAddress,
          ),
        ),
      );
    }
    expect(attempts.at(0)?.status).toBe(401);
    expect(attempts.at(-1)?.status).toBe(429);
    const [limitedBucket] = await database
      .select({ count: schema.rateLimit.count })
      .from(schema.rateLimit)
      .where(eq(schema.rateLimit.key, `${limitedAddress}|/sign-in/email`));
    expect(limitedBucket?.count).toBe(5);

    const otherAddress = await application.handleAuthRequest(
      authRequest(
        "/sign-in/email",
        { email: "missing@example.test", password: "incorrect password" },
        undefined,
        "198.51.100.22",
      ),
    );
    expect(otherAddress.status).toBe(401);

    const secureApplication = createIdentityApplication({
      database,
      clock: identityTestClock,
      authRuntime: {
        ...identityTestAuthRuntime,
        baseUrl: "https://tasks.example.test",
        secureCookies: true,
      },
    });
    const secureSignup = await secureApplication.handleAuthRequest(
      authRequest(
        "/sign-up/email",
        { email: "secure-cookie@example.test", password: identityTestPassword },
        undefined,
        "203.0.113.41",
        "https://tasks.example.test",
      ),
    );
    expect(secureSignup.status).toBe(200);
    expect(secureSignup.headers.getSetCookie()).toEqual([]);

    const secureSignIn = await secureApplication.handleAuthRequest(
      authRequest(
        "/sign-in/email",
        { email: "secure-cookie@example.test", password: identityTestPassword },
        undefined,
        "203.0.113.41",
        "https://tasks.example.test",
      ),
    );
    const cookie = secureSignIn.headers.getSetCookie().join("; ");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  function createApplication() {
    return createIdentityApplication({
      database,
      clock: identityTestClock,
      authRuntime: identityTestAuthRuntime,
    });
  }

  async function accountRowCounts(userId: string) {
    const preferences = await database
      .select({ userId: schema.userPreferences.userId })
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, userId));
    const inboxes = await database
      .select({ id: schema.taskLists.id })
      .from(schema.taskLists)
      .where(and(eq(schema.taskLists.userId, userId), eq(schema.taskLists.kind, "inbox")));
    return { preferences: preferences.length, inboxes: inboxes.length };
  }
});
