import { z } from "zod";

import type { PlanningPriority, PlanningTaskStatus } from "./planning-screen-model";

const entityRefSchema = z.object({ id: z.uuidv4(), version: z.number().int().positive() });
const allDayScheduleSchema = z.strictObject({
  kind: z.literal("all_day"),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
});
const timedScheduleSchema = z.strictObject({
  kind: z.literal("timed"),
  startAt: z.iso.datetime({ offset: true }),
  endAt: z.iso.datetime({ offset: true }),
  timezone: z.string().min(1),
});
const scheduleSchema = z.discriminatedUnion("kind", [allDayScheduleSchema, timedScheduleSchema]);
const scheduleDtoFields = {
  taskId: z.uuidv4(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
} as const;
const scheduleDtoSchema = z.discriminatedUnion("kind", [
  allDayScheduleSchema.extend(scheduleDtoFields),
  timedScheduleSchema.extend(scheduleDtoFields),
]);
const scheduleMutationSchema = z.object({
  task: entityRefSchema,
  schedule: scheduleDtoSchema.nullable(),
});
const quickAddSchema = z.object({
  sourceText: z.string(),
  suggestions: z.array(
    z.object({
      recognizedText: z.string().min(1),
      startIndex: z.number().int().nonnegative(),
      endIndex: z.number().int().positive(),
      schedule: scheduleSchema,
      warnings: z.array(z.string()),
    }),
  ),
});
const problemSchema = z.object({
  code: z.string(),
  detail: z.string(),
  currentVersion: z.number().int().positive().optional(),
});

export type PlanningSchedule = z.infer<typeof scheduleSchema>;
export type PlanningQuickAddSuggestion = z.infer<typeof quickAddSchema>["suggestions"][number];

export class PlanningClientError extends Error {
  readonly code: string;
  readonly currentVersion: number | undefined;

  constructor(message: string, code = "INTERNAL", currentVersion?: number) {
    super(message);
    this.name = "PlanningClientError";
    this.code = code;
    this.currentVersion = currentVersion;
  }
}

export function transitionPlanningTask(taskId: string, expectedVersion: number, status: PlanningTaskStatus) {
  return mutate(`/api/v1/tasks/${taskId}/status`, "POST", { expectedVersion, status }, entityRefSchema);
}

export function updatePlanningTaskPriority(
  taskId: string,
  expectedVersion: number,
  priority: PlanningPriority,
) {
  return mutate(
    `/api/v1/tasks/${taskId}`,
    "PATCH",
    { expectedVersion, patch: { priority } },
    entityRefSchema,
  );
}

export function setPlanningTaskSchedule(taskId: string, expectedVersion: number, schedule: PlanningSchedule) {
  return mutate(
    `/api/v1/tasks/${taskId}/schedule`,
    "PATCH",
    { expectedVersion, schedule },
    scheduleMutationSchema,
  );
}

export function createPlanningTask(resourceId: string, input: Readonly<{ title: string; listId: string }>) {
  return mutate(
    "/api/v1/tasks",
    "POST",
    {
      title: input.title,
      descriptionMd: "",
      priority: "none",
      listId: input.listId,
      sectionId: null,
      parentTaskId: null,
      placement: { kind: "start" },
    },
    entityRefSchema,
    { "idempotency-key": resourceId },
  );
}

export function parsePlanningQuickAdd(text: string, timezone: string) {
  return mutate("/api/v1/tasks/quick-add", "POST", { text, timezone }, quickAddSchema);
}

async function mutate<T>(
  path: string,
  method: "PATCH" | "POST",
  body: unknown,
  schema: z.ZodType<T>,
  extraHeaders?: HeadersInit,
): Promise<T> {
  const headers = new Headers(extraHeaders);
  headers.set("accept", "application/json");
  headers.set("content-type", "application/json");
  const response = await fetch(path, {
    method,
    body: JSON.stringify(body),
    credentials: "same-origin",
    headers,
  });
  if (!response.ok) throw await readProblem(response);
  try {
    return schema.parse(await response.json());
  } catch {
    throw new PlanningClientError("The server returned an unreadable planning response.");
  }
}

async function readProblem(response: Response) {
  try {
    const problem = problemSchema.parse(await response.json());
    return new PlanningClientError(problem.detail, problem.code, problem.currentVersion);
  } catch (error) {
    if (error instanceof PlanningClientError) return error;
    return new PlanningClientError("That planning change was not saved. Refresh and try again.");
  }
}
