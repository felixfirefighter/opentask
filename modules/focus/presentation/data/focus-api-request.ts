import { z } from "zod";

const focusProblemSchema = z.strictObject({
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

type FocusProblem = z.infer<typeof focusProblemSchema>;

export class FocusApiError extends Error {
  readonly code: FocusProblem["code"];
  readonly status: number;
  readonly currentVersion: number | undefined;

  constructor(problem: Pick<FocusProblem, "code" | "status" | "detail"> & Partial<FocusProblem>) {
    super(problem.detail);
    this.name = "FocusApiError";
    this.code = problem.code;
    this.status = problem.status;
    this.currentVersion = problem.currentVersion;
  }
}

export async function requestFocusJson<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  const response = await fetch(path, { ...init, credentials: "same-origin", headers });
  if (!response.ok) throw await readFocusProblem(response);
  try {
    return schema.parse(await response.json());
  } catch {
    throw new FocusApiError({
      code: "INTERNAL",
      status: 500,
      detail: "The server returned an unreadable Focus response. Refresh and try again.",
    });
  }
}

export function focusJsonMutation(
  method: "DELETE" | "PATCH" | "POST",
  body: unknown,
  headers?: HeadersInit,
): RequestInit {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("content-type", "application/json");
  return { method, headers: requestHeaders, body: JSON.stringify(body) };
}

export function focusQueryPath(
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

export function isFocusApiError(error: unknown): error is FocusApiError {
  return error instanceof FocusApiError;
}

async function readFocusProblem(response: Response): Promise<FocusApiError> {
  try {
    return new FocusApiError(focusProblemSchema.parse(await response.json()));
  } catch {
    return new FocusApiError({
      code: response.status === 401 ? "UNAUTHENTICATED" : "INTERNAL",
      status: response.status,
      detail: "The Focus request could not be completed. Try again safely.",
    });
  }
}
