import type { ReviewedPlanBatch, ReviewedPlanTaskWriter, TaskScheduleValue } from "@/modules/tasks";
import { ApplicationError } from "@/shared/http/application-error";

import type {
  PlannerAction,
  PlannerApplyTaskWriter,
  PlannerSchedule,
  ProposalContextVersions,
} from "./contracts";

type ReviewedUpdate = ReviewedPlanBatch["updates"][number];
type MutableReviewedUpdate = {
  id: string;
  expectedVersion: number;
  title?: string;
  descriptionMd?: string;
  priority?: "none" | "low" | "medium" | "high";
  schedule?: TaskScheduleValue;
};

export function createPlannerApplyTaskAdapter(writer: ReviewedPlanTaskWriter): PlannerApplyTaskWriter {
  return {
    async loadOwnedOpenForUpdate(actor, taskIds, transaction) {
      return (await writer.loadOwnedOpenForUpdate(actor, taskIds, transaction)).map((task) => ({
        ...task,
        schedule: task.schedule ? toPlannerSchedule(task.schedule) : null,
      }));
    },

    async loadBusySchedulesForUpdate(actor, query, excludedTaskIds, transaction) {
      const page = await writer.loadBusySchedulesForUpdate(actor, query, excludedTaskIds, transaction);
      return {
        items: page.items.map(({ schedule }) => ({ schedule: toPlannerSchedule(schedule) })),
        truncated: page.truncated,
      };
    },

    async applyAllowedActions(actor, actions, expectedVersions, transaction) {
      await writer.applyBatch(actor, toReviewedBatch(actions, expectedVersions), transaction);
    },
  };
}

function toReviewedBatch(
  actions: readonly PlannerAction[],
  expectedVersions: ProposalContextVersions,
): ReviewedPlanBatch {
  const creates: ReviewedPlanBatch["creates"][number][] = [];
  const updates = new Map<string, MutableReviewedUpdate>();
  for (const action of actions) {
    if (action.kind === "create") {
      creates.push({
        id: action.actionId,
        title: action.after.title,
        descriptionMd: action.after.descriptionMd,
        priority: action.after.priority,
        schedule: action.after.schedule ? toTaskSchedule(action.after.schedule) : null,
      });
      continue;
    }
    if (action.kind === "defer") {
      throw new ApplicationError("INTERNAL", "A deferred planner action reached the task writer.");
    }
    const update = getUpdate(updates, action.taskId, expectedVersions);
    if (action.kind === "update") {
      update.title = action.after.title;
      update.descriptionMd = action.after.descriptionMd;
    } else if (action.kind === "prioritize") {
      update.priority = action.after;
    } else {
      update.schedule = toTaskSchedule(action.after);
    }
  }
  return { creates, updates: [...updates.values()] as ReviewedUpdate[] };
}

function getUpdate(
  updates: Map<string, MutableReviewedUpdate>,
  taskId: string,
  expectedVersions: ProposalContextVersions,
) {
  const existing = updates.get(taskId);
  if (existing) return existing;
  const expectedVersion = expectedVersions[taskId];
  if (expectedVersion === undefined) {
    throw new ApplicationError("INTERNAL", "A reviewed planner action is missing its task version.");
  }
  const created: MutableReviewedUpdate = { id: taskId, expectedVersion };
  updates.set(taskId, created);
  return created;
}

function toPlannerSchedule(schedule: TaskScheduleValue): PlannerSchedule {
  return schedule.kind === "all_day"
    ? schedule
    : {
        kind: schedule.kind,
        startAt: schedule.startAt,
        endAt: schedule.endAt,
        timeZone: schedule.timezone,
      };
}

function toTaskSchedule(schedule: PlannerSchedule): TaskScheduleValue {
  return schedule.kind === "all_day"
    ? schedule
    : {
        kind: schedule.kind,
        startAt: schedule.startAt,
        endAt: schedule.endAt,
        timezone: schedule.timeZone,
      };
}
