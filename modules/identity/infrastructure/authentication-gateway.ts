import { randomBytes, randomUUID } from "node:crypto";
import { isIP } from "node:net";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth/minimal";
import { createAuthMiddleware, getIp } from "better-auth/api";
import type { BetterAuthOptions } from "better-auth";

import type { SessionIdentity } from "@/shared/auth/actor";
import type { Database } from "@/shared/db/client";
import { schema } from "@/shared/db/schema";
import { problemResponseFromError } from "@/shared/http/problem";
import { logger } from "@/shared/logging/logger";

import type { AuthRuntimeConfig } from "./auth-runtime-config";
import { preparePublicAuthRequest } from "./authentication-request-contract";
import { demoEmailSuffix } from "./demo-account-policy";

const clientAddressPolicy: NonNullable<NonNullable<BetterAuthOptions["advanced"]>["ipAddress"]> = {
  ipAddressHeaders: ["x-real-ip"],
  ipv6Subnet: 64,
};
const clientAddressOptions = {
  advanced: { ipAddress: clientAddressPolicy },
} satisfies BetterAuthOptions;
const globalRateLimitWindowSeconds = 60 * 60;
const globalRateLimitMaximum = 10_000;
const credentialRateLimitWindowSeconds = 60;
const credentialRateLimitMaximum = 5;

export function findClientAddress(headers: Headers): string | null {
  const forwardedAddress = headers.get("x-real-ip")?.trim();
  if (!forwardedAddress || isIP(forwardedAddress) === 0) return null;
  return getIp(headers, clientAddressOptions);
}

export type AuthenticationGateway = ReturnType<typeof createAuthenticationGateway>;

export function createAuthenticationGateway({
  database,
  runtime,
  onAccountAvailable,
}: {
  database: Database;
  runtime: AuthRuntimeConfig;
  onAccountAvailable(userId: string): Promise<void>;
}) {
  const trustedOrigins = resolveTrustedOrigins(runtime.baseUrl);

  async function repairAccount(userId: string) {
    try {
      await onAccountAvailable(userId);
    } catch (error) {
      logger.event("ACCOUNT_BOOTSTRAP_FAILED", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }

  const auth = betterAuth({
    appName: "OpenTask",
    baseURL: runtime.baseUrl,
    secret: runtime.secret,
    trustedOrigins,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
      },
      transaction: true,
    }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: globalRateLimitWindowSeconds,
      max: globalRateLimitMaximum,
      customRules: {
        "/sign-in/email": {
          window: credentialRateLimitWindowSeconds,
          max: credentialRateLimitMaximum,
        },
        "/sign-up/email": {
          window: credentialRateLimitWindowSeconds,
          max: credentialRateLimitMaximum,
        },
      },
    },
    advanced: {
      useSecureCookies: runtime.secureCookies,
      cookiePrefix: "opentask",
      database: { generateId: "uuid" },
      disableCSRFCheck: false,
      disableOriginCheck: false,
      ipAddress: clientAddressPolicy,
    },
    logger: { disabled: true },
    telemetry: { enabled: false },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => repairAccount(user.id),
        },
      },
    },
    hooks: {
      after: createAuthMiddleware(async (context) => {
        if (context.path === "/sign-in/email" && context.context.newSession) {
          await repairAccount(context.context.newSession.user.id);
        }
      }),
    },
  });

  return {
    async handle(request: Request) {
      try {
        const response = await auth.handler(await preparePublicAuthRequest(request));
        const headers = new Headers(response.headers);
        headers.set("cache-control", "no-store");
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch (error) {
        return problemResponseFromError(error);
      }
    },

    findClientAddress,

    async findSession(headers: Headers): Promise<SessionIdentity | null> {
      const current = await auth.api.getSession({ headers });
      if (!current) return null;
      return {
        actor: { userId: current.user.id },
        displayName: current.user.name,
        email: current.user.email,
      };
    },

    async createDemoAccount(headers: Headers) {
      const email = `demo-${randomUUID()}${demoEmailSuffix}`;
      const password = `${randomBytes(32).toString("base64url")}Aa1!`;
      await auth.api.signUpEmail({
        headers,
        returnHeaders: true,
        body: {
          name: "Demo visitor",
          email,
          password,
        },
      });
      const result = await auth.api.signInEmail({
        headers,
        returnHeaders: true,
        body: { email, password },
      });

      return {
        identity: {
          actor: { userId: result.response.user.id },
          displayName: result.response.user.name,
          email: result.response.user.email,
        } satisfies SessionIdentity,
        setCookieHeaders: result.headers.getSetCookie(),
      };
    },

    security: {
      clientAddressHeaders: [...(clientAddressPolicy.ipAddressHeaders ?? [])],
      credentialRateLimitMaximum,
      credentialRateLimitWindowSeconds,
      globalRateLimitMaximum,
      globalRateLimitWindowSeconds,
      ipv6Subnet: clientAddressPolicy.ipv6Subnet,
      rateLimitEnabled: true,
      secureCookies: runtime.secureCookies,
      trustedOrigins,
    },
  };
}

function resolveTrustedOrigins(baseUrl: string): string[] {
  const parsed = new URL(baseUrl);
  const origins = new Set([parsed.origin]);
  const isLocalHost = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (!isLocalHost) return [...origins];

  const port = parsed.port ? `:${parsed.port}` : "";
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    origins.add(`${parsed.protocol}//${host}${port}`);
  }
  return [...origins];
}
