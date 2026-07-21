import { randomUUID } from "node:crypto";

import { problemResponseFromError } from "./problem";
import { logger, type SafeLogger } from "../logging/logger";

type RequestWork = () => Response | Promise<Response>;

type RequestObserverDependencies = Readonly<{
  createRequestId: () => string;
  log: SafeLogger;
  now: () => number;
}>;

const routeLiterals = new Set([
  "api",
  "auth",
  "health",
  "live",
  "ready",
  "v1",
  "demo",
  "export",
  "focus",
  "active",
  "summary",
  "sessions",
  "links",
  "pause",
  "resume",
  "finish",
  "discard",
  "folders",
  "habits",
  "archive",
  "history",
  "logs",
  "month",
  "overview",
  "overviews",
  "streaks",
  "undo",
  "delete",
  "position",
  "restore",
  "lists",
  "move",
  "sections",
  "planner",
  "notifications",
  "subscriptions",
  "revoke",
  "capability",
  "proposals",
  "apply",
  "reject",
  "planning",
  "agenda",
  "calendar",
  "matrix",
  "today",
  "upcoming",
  "preferences",
  "schedules",
  "tags",
  "tasks",
  "checklist",
  "schedule",
  "clear",
  "status",
  "reminder",
  "quick-add",
  "recurrence",
  "occurrences",
  "transition",
  "end",
  "search",
  "terminal",
]);
const validUseCasePattern = /^[a-z][a-z0-9-]{0,31}(?:\.[a-z][a-z0-9-]{0,31}){1,2}$/;

export type ApiRequestObserver = (request: Request, useCase: string, work: RequestWork) => Promise<Response>;

export function createApiRequestObserver(dependencies: RequestObserverDependencies): ApiRequestObserver {
  return async (request, useCase, work) => {
    const startedAt = dependencies.now();
    const requestId = dependencies.createRequestId();
    let response: Response;

    try {
      response = await work();
    } catch (error) {
      response = problemResponseFromError(error, requestId);
    }

    response = withRequestId(response, requestId);
    const correlationId = response.headers.get("x-correlation-id") ?? undefined;
    dependencies.log.event("REQUEST_COMPLETED", {
      requestId,
      correlationId,
      routePattern: sanitizeApiRoutePattern(request),
      useCase: normalizeUseCase(useCase),
      durationMs: elapsedMilliseconds(startedAt, dependencies.now()),
      statusClass: toStatusClass(response.status),
    });

    return response;
  };
}

export const observeApiRequest = createApiRequestObserver({
  createRequestId: randomUUID,
  log: logger,
  now: () => performance.now(),
});

export function sanitizeApiRoutePattern(request: Request): string {
  try {
    const segments = new URL(request.url).pathname.split("/").filter(Boolean).slice(0, 12);
    if (segments[0] !== "api") return "/api/:resource";
    return `/${segments.map((segment) => (routeLiterals.has(segment) ? segment : ":resource")).join("/")}`;
  } catch {
    return "/api/:resource";
  }
}

function normalizeUseCase(value: string): string {
  return validUseCasePattern.test(value) ? value : "http.request";
}

function withRequestId(response: Response, requestId: string): Response {
  try {
    response.headers.set("x-request-id", requestId);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    headers.set("x-request-id", requestId);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

function elapsedMilliseconds(startedAt: number, finishedAt: number): number {
  return Math.max(0, Math.round(finishedAt - startedAt));
}

function toStatusClass(status: number): "1xx" | "2xx" | "3xx" | "4xx" | "5xx" {
  if (status < 200) return "1xx";
  if (status < 300) return "2xx";
  if (status < 400) return "3xx";
  if (status < 500) return "4xx";
  return "5xx";
}
