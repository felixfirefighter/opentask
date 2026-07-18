import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ApplicationError } from "./application-error";
import { logger } from "../logging/logger";

export const problemCodes = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "CONFLICT",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "INTERNAL",
] as const;

export type ProblemCode = (typeof problemCodes)[number];

type ProblemDefinition = {
  status: number;
  title: string;
};

const definitions: Record<ProblemCode, ProblemDefinition> = {
  UNAUTHENTICATED: { status: 401, title: "Authentication required" },
  FORBIDDEN: { status: 403, title: "Access denied" },
  NOT_FOUND: { status: 404, title: "Resource not found" },
  VALIDATION_FAILED: { status: 400, title: "Validation failed" },
  CONFLICT: { status: 409, title: "Conflict" },
  RATE_LIMITED: { status: 429, title: "Too many requests" },
  PROVIDER_UNAVAILABLE: { status: 503, title: "Service unavailable" },
  INTERNAL: { status: 500, title: "Unexpected error" },
};

export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail: string;
  correlationId: string;
};

export function createProblem(
  code: ProblemCode,
  detail: string,
  correlationId: string = randomUUID(),
): ProblemDetails {
  const definition = definitions[code];

  return {
    type: `urn:opentask:problem:${code.toLowerCase().replaceAll("_", "-")}`,
    title: definition.title,
    status: definition.status,
    code,
    detail,
    correlationId,
  };
}

export function problemResponse(problem: ProblemDetails) {
  return NextResponse.json(problem, {
    status: problem.status,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/problem+json",
      "x-correlation-id": problem.correlationId,
    },
  });
}

export function problemResponseFromError(error: unknown) {
  if (error instanceof ApplicationError) {
    return problemResponse(createProblem(error.code, error.message));
  }
  if (hasProblemCode(error, "UNAUTHENTICATED")) {
    return problemResponse(createProblem("UNAUTHENTICATED", "Sign in to continue."));
  }
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return problemResponse(createProblem("VALIDATION_FAILED", "Review the submitted values and try again."));
  }
  const problem = createProblem("INTERNAL", "The request could not be completed. Try again safely.");
  logger.event("REQUEST_FAILED", {
    correlationId: problem.correlationId,
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  return problemResponse(problem);
}

function hasProblemCode(error: unknown, code: ProblemCode): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
