import { z } from "zod";

import { ianaTimeZoneSchema } from "@/shared/validation/time-zone";

import {
  clearTaskScheduleRequestSchema,
  setTaskScheduleRequestSchema,
  taskScheduleDtoSchema,
  taskScheduleMutationResultSchema,
  type ClearTaskScheduleRequest,
  type SetTaskScheduleRequest,
} from "../../application/contracts";
import { requestTaskJson, taskJsonMutation } from "./task-api-request";

const schedulePreferencesSchema = z.object({
  timezone: ianaTimeZoneSchema,
  hourCycle: z.enum(["h12", "h23"]),
});

export type SchedulePreferences = Readonly<{
  timeZone: string;
  hourCycle: "h12" | "h23";
}>;

export async function getTaskSchedule(taskId: string) {
  return requestTaskJson(`/api/v1/tasks/${taskId}/schedule`, taskScheduleDtoSchema.nullable());
}

export function setTaskSchedule(taskId: string, input: SetTaskScheduleRequest) {
  return requestTaskJson(
    `/api/v1/tasks/${taskId}/schedule`,
    taskScheduleMutationResultSchema,
    taskJsonMutation("PATCH", setTaskScheduleRequestSchema.parse(input)),
  );
}

export function clearTaskSchedule(taskId: string, input: ClearTaskScheduleRequest) {
  return requestTaskJson(
    `/api/v1/tasks/${taskId}/schedule/clear`,
    taskScheduleMutationResultSchema,
    taskJsonMutation("POST", clearTaskScheduleRequestSchema.parse(input)),
  );
}

export async function getSchedulePreferences(): Promise<SchedulePreferences> {
  const preferences = await requestTaskJson("/api/v1/preferences", schedulePreferencesSchema);
  return { timeZone: preferences.timezone, hourCycle: preferences.hourCycle };
}
