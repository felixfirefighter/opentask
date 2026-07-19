import pino, { type DestinationStream, type LoggerOptions } from "pino";

const REDACTED = "[Redacted]";
const correlationIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const errorNamePattern = /^[A-Za-z_$][A-Za-z0-9_$.-]{0,127}$/;
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const routePattern = /^\/api(?:\/[a-z0-9-]+|\/:resource){0,11}$/;
const useCasePattern = /^[a-z][a-z0-9-]{0,31}(?:\.[a-z][a-z0-9-]{0,31}){1,2}$/;
const logLevels = new Set(["fatal", "error", "warn", "info", "debug", "trace", "silent"]);
const statusClasses = new Set(["1xx", "2xx", "3xx", "4xx", "5xx"]);

const events = {
  ACCOUNT_BOOTSTRAP_FAILED: { level: "error", message: "account bootstrap failed" },
  DATABASE_POOL_ERROR: { level: "error", message: "database pool error" },
  MIGRATIONS_APPLIED: { level: "info", message: "database migrations applied" },
  MIGRATIONS_FAILED: { level: "error", message: "database migration failed" },
  READINESS_FAILED: { level: "warn", message: "readiness check failed" },
  REQUEST_COMPLETED: { level: "info", message: "request completed" },
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
  durationMs?: number | undefined;
  errorName?: string | undefined;
  recordsWritten?: number | undefined;
  registeredJobCount?: number | undefined;
  requestId?: string | undefined;
  routePattern?: string | undefined;
  statusClass?: "1xx" | "2xx" | "3xx" | "4xx" | "5xx" | undefined;
  useCase?: string | undefined;
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
  if (isSafeDuration(fields.durationMs)) safe.durationMs = fields.durationMs;
  if (isSafeErrorName(fields.errorName)) safe.errorName = fields.errorName;
  if (isSafeCount(fields.recordsWritten)) safe.recordsWritten = fields.recordsWritten;
  if (isSafeCount(fields.registeredJobCount)) {
    safe.registeredJobCount = fields.registeredJobCount;
  }
  if (isSafeRequestId(fields.requestId)) safe.requestId = fields.requestId;
  if (isSafeRoutePattern(fields.routePattern)) safe.routePattern = fields.routePattern;
  if (isSafeStatusClass(fields.statusClass)) safe.statusClass = fields.statusClass;
  if (isSafeUseCase(fields.useCase)) safe.useCase = fields.useCase;

  return safe;
}

function isSafeCorrelationId(value: unknown): value is string {
  return typeof value === "string" && correlationIdPattern.test(value);
}

function isSafeErrorName(value: unknown): value is string {
  return typeof value === "string" && errorNamePattern.test(value);
}

function isSafeDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSafeRequestId(value: unknown): value is string {
  return typeof value === "string" && requestIdPattern.test(value);
}

function isSafeRoutePattern(value: unknown): value is string {
  return typeof value === "string" && routePattern.test(value);
}

function isSafeStatusClass(value: unknown): value is NonNullable<SafeLogFields["statusClass"]> {
  return typeof value === "string" && statusClasses.has(value);
}

function isSafeUseCase(value: unknown): value is string {
  return typeof value === "string" && useCasePattern.test(value);
}

function isSafeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
