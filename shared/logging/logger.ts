import pino, { type DestinationStream, type LoggerOptions } from "pino";

const REDACTED = "[Redacted]";

const sensitivePaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers.*",
  "request.headers.authorization",
  "request.headers.cookie",
  "request.headers.*",
  "headers.authorization",
  "headers.cookie",
  "headers.*",
  "authorization",
  "cookie",
  "password",
  "session",
  "token",
  "body",
  "task",
  "title",
  "description",
  "brainDump",
  "plannerInput",
  "plannerOutput",
  "pushEndpoint",
  "endpoint",
  "OPENAI_API_KEY",
  "VAPID_PRIVATE_KEY",
  "*.authorization",
  "*.cookie",
  "*.password",
  "*.session",
  "*.token",
  "*.body",
  "*.task",
  "*.title",
  "*.description",
  "*.brainDump",
  "*.plannerInput",
  "*.plannerOutput",
  "*.pushEndpoint",
  "*.endpoint",
  "*.OPENAI_API_KEY",
  "*.VAPID_PRIVATE_KEY",
] as const;

export function createLogger(destination?: DestinationStream) {
  const options: LoggerOptions = {
    level: process.env.LOG_LEVEL ?? "info",
    base: null,
    redact: {
      paths: [...sensitivePaths],
      censor: REDACTED,
    },
  };

  return destination ? pino(options, destination) : pino(options);
}

export const logger = createLogger();
