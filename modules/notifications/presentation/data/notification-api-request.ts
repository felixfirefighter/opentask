import { z } from "zod";

import { fetchWithConnectivity } from "@/shared/presentation";

const notificationProblemSchema = z.strictObject({
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

type NotificationProblem = z.infer<typeof notificationProblemSchema>;

export class NotificationApiError extends Error {
  readonly code: NotificationProblem["code"];
  readonly status: number;
  readonly currentVersion: number | undefined;

  constructor(
    problem: Pick<NotificationProblem, "code" | "status" | "detail"> & Partial<NotificationProblem>,
  ) {
    super(problem.detail);
    this.name = "NotificationApiError";
    this.code = problem.code;
    this.status = problem.status;
    this.currentVersion = problem.currentVersion;
  }
}

export async function requestNotificationJson<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  const response = await fetchWithConnectivity(path, { ...init, credentials: "same-origin", headers });
  if (!response.ok) throw await readProblem(response);
  try {
    return schema.parse(await response.json());
  } catch {
    throw new NotificationApiError({
      code: "INTERNAL",
      status: 500,
      detail: "The server returned an unreadable reminder response. Refresh and try again.",
    });
  }
}

export function notificationJsonMutation(method: "DELETE" | "POST" | "PUT", body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function isNotificationApiError(error: unknown): error is NotificationApiError {
  return error instanceof NotificationApiError;
}

async function readProblem(response: Response): Promise<NotificationApiError> {
  try {
    return new NotificationApiError(notificationProblemSchema.parse(await response.json()));
  } catch {
    return new NotificationApiError({
      code: response.status === 401 ? "UNAUTHENTICATED" : "INTERNAL",
      status: response.status,
      detail: "The reminder request could not be completed. Try again safely.",
    });
  }
}
