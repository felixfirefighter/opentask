import { z } from "zod";

import { fetchWithConnectivity } from "@/shared/presentation";

const taskProblemSchema = z.strictObject({
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

type TaskProblem = z.infer<typeof taskProblemSchema>;

export class TaskApiError extends Error {
  readonly code: TaskProblem["code"];
  readonly status: number;
  readonly correlationId: string | undefined;
  readonly currentVersion: number | undefined;

  constructor(problem: Pick<TaskProblem, "code" | "status" | "detail"> & Partial<TaskProblem>) {
    super(problem.detail);
    this.name = "TaskApiError";
    this.code = problem.code;
    this.status = problem.status;
    this.correlationId = problem.correlationId;
    this.currentVersion = problem.currentVersion;
  }
}

export async function requestTaskJson<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  const response = await fetchWithConnectivity(path, { ...init, credentials: "same-origin", headers });
  if (!response.ok) throw await readTaskProblem(response);
  try {
    return schema.parse(await response.json());
  } catch {
    throw new TaskApiError({
      code: "INTERNAL",
      status: 500,
      detail: "The server returned an unreadable task response. Refresh and try again.",
    });
  }
}

export function taskJsonMutation(
  method: "PATCH" | "POST",
  body: unknown,
  headers?: HeadersInit,
): RequestInit {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("content-type", "application/json");
  return { method, headers: requestHeaders, body: JSON.stringify(body) };
}

export function taskQueryPath(
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

export function isTaskApiError(error: unknown): error is TaskApiError {
  return error instanceof TaskApiError;
}

async function readTaskProblem(response: Response): Promise<TaskApiError> {
  try {
    const problem = taskProblemSchema.parse(await response.json());
    return new TaskApiError(problem);
  } catch (error) {
    if (error instanceof TaskApiError) return error;
    return new TaskApiError({
      code: response.status === 401 ? "UNAUTHENTICATED" : "INTERNAL",
      status: response.status,
      detail: "The task request could not be completed. Try again safely.",
    });
  }
}
