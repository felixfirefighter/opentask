import { z } from "zod";

const postgresUrl = z
  .string()
  .min(1)
  .refine((value) => /^postgres(?:ql)?:\/\//u.test(value), "must be a PostgreSQL connection URL");

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: postgresUrl,
  TEST_DATABASE_URL: postgresUrl.optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.url().optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
});

export type Environment = z.infer<typeof environmentSchema>;

export class EnvironmentConfigurationError extends Error {
  readonly fields: readonly string[];

  constructor(fields: readonly string[]) {
    super(`Invalid server environment: ${fields.join(", ")}`);
    this.name = "EnvironmentConfigurationError";
    this.fields = fields;
  }
}

let cachedEnvironment: Environment | undefined;

export function parseEnvironment(source: Readonly<Record<string, string | undefined>>): Environment {
  const parsed = environmentSchema.safeParse({
    NODE_ENV: source.NODE_ENV,
    DATABASE_URL: source.DATABASE_URL,
    TEST_DATABASE_URL: emptyToUndefined(source.TEST_DATABASE_URL),
    LOG_LEVEL: source.LOG_LEVEL,
    BETTER_AUTH_SECRET: emptyToUndefined(source.BETTER_AUTH_SECRET),
    BETTER_AUTH_URL: emptyToUndefined(source.BETTER_AUTH_URL),
    OPENAI_API_KEY: emptyToUndefined(source.OPENAI_API_KEY),
    VAPID_PUBLIC_KEY: emptyToUndefined(source.VAPID_PUBLIC_KEY),
    VAPID_PRIVATE_KEY: emptyToUndefined(source.VAPID_PRIVATE_KEY),
  });

  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "environment"))];
    throw new EnvironmentConfigurationError(fields);
  }

  return parsed.data;
}

export function getEnvironment(): Environment {
  cachedEnvironment ??= parseEnvironment(process.env);
  return cachedEnvironment;
}

export function getTestDatabaseUrl(): string {
  const url = getEnvironment().TEST_DATABASE_URL;

  if (!url) {
    throw new EnvironmentConfigurationError(["TEST_DATABASE_URL"]);
  }

  return url;
}

function emptyToUndefined(value: string | undefined) {
  return value === "" ? undefined : value;
}
