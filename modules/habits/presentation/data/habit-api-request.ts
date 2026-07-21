import { z } from "zod";

import { fetchWithConnectivity } from "@/shared/presentation";

const habitProblemSchema = z.strictObject({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  code: z.enum([
    "UNAUTHENTICATED",
    "FORBIDDEN",
    "NOT_FOUND",
    "VALIDATION_FAILED",
    "CONFLICT",
    "RATE_LIMITED",
    "PROVIDER_UNAVAILABLE",
    "INTERNAL",
  ]),
  detail: z.string(),
  correlationId: z.string(),
  currentVersion: z.number().int().positive().optional(),
});

type HabitProblem = z.infer<typeof habitProblemSchema>;

export class HabitApiError extends Error {
  readonly code: HabitProblem["code"];
  readonly status: number;
  readonly currentVersion: number | undefined;

  constructor(problem: Pick<HabitProblem, "code" | "status" | "detail"> & Partial<HabitProblem>) {
    super(problem.detail);
    this.name = "HabitApiError";
    this.code = problem.code;
    this.status = problem.status;
    this.currentVersion = problem.currentVersion;
  }
}

export async function requestHabitJson<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  const response = await fetchWithConnectivity(path, { ...init, credentials: "same-origin", headers });
  if (!response.ok) throw await readHabitProblem(response);
  try {
    return schema.parse(await response.json());
  } catch {
    throw new HabitApiError({
      code: "INTERNAL",
      status: 500,
      detail: "The server returned an unreadable habit response. Refresh and try again.",
    });
  }
}

export function habitJsonMutation(
  method: "PATCH" | "POST",
  body: unknown,
  headers?: HeadersInit,
): RequestInit {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("content-type", "application/json");
  return { method, headers: requestHeaders, body: JSON.stringify(body) };
}

export function habitQueryPath(
  path: string,
  values: Readonly<Record<string, string | number | null | undefined>>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null) query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export function isHabitApiError(error: unknown): error is HabitApiError {
  return error instanceof HabitApiError;
}

export function isHabitInvalidPageCursorError(error: unknown): error is HabitApiError {
  return (
    isHabitApiError(error) &&
    error.code === "VALIDATION_FAILED" &&
    error.status === 400 &&
    error.message === "The habit page cursor is invalid or expired."
  );
}

async function readHabitProblem(response: Response): Promise<HabitApiError> {
  try {
    return new HabitApiError(habitProblemSchema.parse(await response.json()));
  } catch {
    return new HabitApiError({
      code: response.status === 401 ? "UNAUTHENTICATED" : "INTERNAL",
      status: response.status,
      detail: "The habit request could not be completed. Try again safely.",
    });
  }
}
