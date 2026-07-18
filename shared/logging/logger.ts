import pino, { type DestinationStream, type LoggerOptions } from "pino";

const REDACTED = "[Redacted]";
const correlationIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const errorNamePattern = /^[A-Za-z_$][A-Za-z0-9_$.-]{0,127}$/;
const logLevels = new Set(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);

const events = {
  ACCOUNT_BOOTSTRAP_FAILED: { level: "error", message: "account bootstrap failed" },
  DATABASE_POOL_ERROR: { level: "error", message: "database pool error" },
  MIGRATIONS_APPLIED: { level: "info", message: "database migrations applied" },
  MIGRATIONS_FAILED: { level: "error", message: "database migration failed" },
  READINESS_FAILED: { level: "warn", message: "readiness check failed" },
  REQUEST_FAILED: { level: "error", message: "request failed" },
  SEED_COMPLETE: { level: "info", message: "bootstrap seed complete" },
  SEED_FAILED: { level: "error", message: "bootstrap seed failed" },
  WORKER_QUEUE_ERROR: { level: "error", message: "worker queue error" },
  WORKER_READY: { level: "info", message: "worker started with registered jobs" },
  WORKER_START_FAILED: { level: "fatal", message: "worker failed to start" },
  WORKER_STOPPED: { level: "info", message: "worker stopped" },
} as const;

export type SafeLogCode = keyof typeof events;

export type SafeLogFields = {
  correlationId?: string | undefined;
  errorName?: string | undefined;
  recordsWritten?: number | undefined;
  registeredJobCount?: number | undefined;
};

export type SafeLogger = {
  event(code: SafeLogCode, fields?: SafeLogFields): void;
};

const sensitivePaths = [
  "authorization",
  "cookie",
  "password",
  "session",
  "token",
  "accessToken",
  "refreshToken",
  "body",
  "payload",
  "task",
  "title",
  "description",
  "brainDump",
  "plannerInput",
  "plannerOutput",
  "pushEndpoint",
  "endpoint",
  "p256dh",
  "auth",
  "OPENAI_API_KEY",
  "VAPID_PRIVATE_KEY",
  "*.authorization",
  "*.cookie",
  "*.password",
  "*.session",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.body",
  "*.payload",
  "*.task",
  "*.title",
  "*.description",
  "*.brainDump",
  "*.plannerInput",
  "*.plannerOutput",
  "*.pushEndpoint",
  "*.endpoint",
  "*.p256dh",
  "*.auth",
  "*.OPENAI_API_KEY",
  "*.VAPID_PRIVATE_KEY",
] as const;

export function createLogger(destination?: DestinationStream): SafeLogger {
  const configuredLevel = process.env.LOG_LEVEL;
  const options: LoggerOptions = {
    level: configuredLevel && logLevels.has(configuredLevel) ? configuredLevel : "info",
    base: null,
    redact: {
      paths: [...sensitivePaths],
      censor: REDACTED,
    },
  };
  const rawLogger = destination ? pino(options, destination) : pino(options);

  return {
    event(code, fields = {}) {
      const definition = events[code];
      rawLogger[definition.level]({ code, ...pickSafeFields(fields) }, definition.message);
    },
  };
}

export const logger = createLogger();

function pickSafeFields(fields: SafeLogFields): SafeLogFields {
  const safe: SafeLogFields = {};

  if (isSafeCorrelationId(fields.correlationId)) safe.correlationId = fields.correlationId;
  if (isSafeErrorName(fields.errorName)) safe.errorName = fields.errorName;
  if (isSafeCount(fields.recordsWritten)) safe.recordsWritten = fields.recordsWritten;
  if (isSafeCount(fields.registeredJobCount)) {
    safe.registeredJobCount = fields.registeredJobCount;
  }

  return safe;
}

function isSafeCorrelationId(value: unknown): value is string {
  return typeof value === "string" && correlationIdPattern.test(value);
}

function isSafeErrorName(value: unknown): value is string {
  return typeof value === "string" && errorNamePattern.test(value);
}

function isSafeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
