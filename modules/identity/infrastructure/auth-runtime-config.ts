import { EnvironmentConfigurationError, type Environment } from "@/shared/config/environment";

export type AuthRuntimeConfig = Readonly<{
  baseUrl: string;
  secret: string;
  secureCookies: boolean;
}>;

const developmentSecret = "opentask-local-development-only-auth-secret";
const loopbackHostAliases = {
  localhost: "127.0.0.1",
  "127.0.0.1": "localhost",
} as const;

export function resolveTrustedBrowserOrigins(baseUrl: string): readonly string[] {
  const configured = new URL(baseUrl);
  const origins = [configured.origin];
  const alias = loopbackHostAliases[configured.hostname as keyof typeof loopbackHostAliases];

  if (alias) {
    const loopbackAlias = new URL(configured.origin);
    loopbackAlias.hostname = alias;
    origins.push(loopbackAlias.origin);
  }

  return Object.freeze(origins);
}

export function resolveAuthRuntimeConfig(environment: Environment): AuthRuntimeConfig {
  const missing = [];
  if (environment.NODE_ENV === "production" && !environment.BETTER_AUTH_SECRET) {
    missing.push("BETTER_AUTH_SECRET");
  }
  if (environment.NODE_ENV === "production" && !environment.BETTER_AUTH_URL) {
    missing.push("BETTER_AUTH_URL");
  }
  if (missing.length > 0) throw new EnvironmentConfigurationError(missing);

  const baseUrl = environment.BETTER_AUTH_URL ?? "http://localhost:3000";
  const parsedUrl = new URL(baseUrl);
  if (environment.NODE_ENV === "production" && parsedUrl.protocol !== "https:") {
    // Local Docker uses an explicit HTTP URL and is the only production-mode exception.
    if (parsedUrl.hostname !== "localhost" && parsedUrl.hostname !== "127.0.0.1") {
      throw new EnvironmentConfigurationError(["BETTER_AUTH_URL"]);
    }
  }

  return {
    baseUrl,
    secret: environment.BETTER_AUTH_SECRET ?? developmentSecret,
    secureCookies: environment.NODE_ENV === "production" && parsedUrl.protocol === "https:",
  };
}
