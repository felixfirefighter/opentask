import { describe, expect, it } from "vitest";

import { EnvironmentConfigurationError, parseEnvironment } from "./environment";

describe("server environment", () => {
  it("parses the required database URL without requiring optional providers", () => {
    expect(
      parseEnvironment({ DATABASE_URL: "postgresql://user:pass@localhost:5432/opentask" }),
    ).toMatchObject({
      DATABASE_URL: "postgresql://user:pass@localhost:5432/opentask",
      LOG_LEVEL: "info",
      NODE_ENV: "development",
    });
  });

  it("reports field names without echoing secret values", () => {
    const secret = "not-a-database-url-secret";

    expect(() => parseEnvironment({ DATABASE_URL: secret })).toThrow(EnvironmentConfigurationError);

    try {
      parseEnvironment({ DATABASE_URL: secret });
    } catch (error) {
      expect(String(error)).toContain("DATABASE_URL");
      expect(String(error)).not.toContain(secret);
    }
  });
});
