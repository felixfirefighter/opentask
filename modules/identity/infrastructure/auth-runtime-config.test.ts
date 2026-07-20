import { describe, expect, it } from "vitest";

import { parseEnvironment } from "@/shared/config/environment";

import { resolveAuthRuntimeConfig, resolveTrustedBrowserOrigins } from "./auth-runtime-config";

const databaseUrl = "postgresql://user:pass@localhost:5432/opentask";

describe("auth runtime configuration", () => {
  it("forces secure cookies for a fully configured production origin", () => {
    const runtime = resolveAuthRuntimeConfig(
      parseEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET: "a-production-secret-with-more-than-32-characters",
        BETTER_AUTH_URL: "https://tasks.example.com",
      }),
    );

    expect(runtime).toMatchObject({
      baseUrl: "https://tasks.example.com",
      secureCookies: true,
    });
  });

  it("rejects missing production auth configuration and non-local HTTP", () => {
    expect(() =>
      resolveAuthRuntimeConfig(parseEnvironment({ NODE_ENV: "production", DATABASE_URL: databaseUrl })),
    ).toThrow(/BETTER_AUTH_SECRET.*BETTER_AUTH_URL/u);
    expect(() =>
      resolveAuthRuntimeConfig(
        parseEnvironment({
          NODE_ENV: "production",
          DATABASE_URL: databaseUrl,
          BETTER_AUTH_SECRET: "a-production-secret-with-more-than-32-characters",
          BETTER_AUTH_URL: "http://tasks.example.com",
        }),
      ),
    ).toThrow(/BETTER_AUTH_URL/u);
  });

  it("keeps cookies usable for the explicit local production topology", () => {
    const runtime = resolveAuthRuntimeConfig(
      parseEnvironment({
        NODE_ENV: "production",
        DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET: "a-production-secret-with-more-than-32-characters",
        BETTER_AUTH_URL: "http://localhost:3000",
      }),
    );

    expect(runtime.secureCookies).toBe(false);
  });

  it.each([
    ["http://localhost:3000", ["http://localhost:3000", "http://127.0.0.1:3000"]],
    ["http://127.0.0.1:3000", ["http://127.0.0.1:3000", "http://localhost:3000"]],
    ["https://localhost:3443/auth", ["https://localhost:3443", "https://127.0.0.1:3443"]],
  ])("trusts only the exact same-scheme, same-port loopback pair for %s", (baseUrl, expected) => {
    expect(resolveTrustedBrowserOrigins(baseUrl)).toEqual(expected);
  });

  it("does not expand a configured non-loopback origin", () => {
    expect(resolveTrustedBrowserOrigins("https://tasks.example.com:8443/auth")).toEqual([
      "https://tasks.example.com:8443",
    ]);
  });
});
