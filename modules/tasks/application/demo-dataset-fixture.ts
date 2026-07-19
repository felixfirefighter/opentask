import { Temporal } from "temporal-polyfill";

import type { DemoDatasetRecords } from "../infrastructure/demo-dataset-repository";

export const DEMO_TIME_ZONE = "UTC";

const ids = {
  folder: "10000000-0000-4000-8000-000000000001",
  list: "20000000-0000-4000-8000-000000000001",
  section: "30000000-0000-4000-8000-000000000001",
  launchTag: "40000000-0000-4000-8000-000000000001",
  designTag: "40000000-0000-4000-8000-000000000002",
  productTag: "40000000-0000-4000-8000-000000000003",
  recordDemo: "50000000-0000-4000-8000-000000000001",
  reviewMobile: "50000000-0000-4000-8000-000000000002",
  prepareData: "50000000-0000-4000-8000-000000000003",
  launchNarrative: "50000000-0000-4000-8000-000000000004",
  friendScript: "50000000-0000-4000-8000-000000000005",
  submissionSummary: "50000000-0000-4000-8000-000000000006",
  releasePass: "50000000-0000-4000-8000-000000000007",
  mobileScreenshot: "50000000-0000-4000-8000-000000000008",
  selfHost: "50000000-0000-4000-8000-000000000009",
  scopeChange: "50000000-0000-4000-8000-000000000010",
  checklistTaskLoop: "60000000-0000-4000-8000-000000000001",
  checklistMobile: "60000000-0000-4000-8000-000000000002",
  checklistExport: "60000000-0000-4000-8000-000000000003",
} as const;

export function buildDemoDatasetFixture(resetAt: Date, inboxId: string): DemoDatasetRecords {
  const today = Temporal.Instant.from(resetAt.toISOString()).toZonedDateTimeISO(DEMO_TIME_ZONE).toPlainDate();
  const tomorrow = today.add({ days: 1 });
  const dayAfterTomorrow = today.add({ days: 2 });

  return {
    resetAt,
    folder: { id: ids.folder, name: "Launch", rank: "a0" },
    regularList: {
      id: ids.list,
      folderId: ids.folder,
      name: "Hackathon launch",
      colorToken: "coral",
      rank: "a0",
    },
    section: { id: ids.section, listId: ids.list, name: "Demo path", rank: "a0" },
    tags: [
      { id: ids.launchTag, name: "Launch", colorToken: "coral" },
      { id: ids.designTag, name: "Design", colorToken: "sky" },
      { id: ids.productTag, name: "Product", colorToken: "amber" },
    ],
    tasks: [
      task(ids.recordDemo, ids.list, ids.section, "Record the two-minute demo", "high", "a0", {
        descriptionMd: "Keep the story focused: capture, plan, review, apply, and export.",
      }),
      task(ids.reviewMobile, ids.list, ids.section, "Review landing page on mobile", "medium", "a1"),
      task(ids.prepareData, inboxId, null, "Prepare clean demo data", "medium", "a0"),
      task(ids.launchNarrative, ids.list, null, "Draft the launch narrative", "high", "a0", {
        descriptionMd: "Turn the product story into three clear beats for the submission.",
      }),
      task(ids.friendScript, inboxId, null, "Polish the friend test script", "medium", "a1"),
      task(ids.submissionSummary, ids.list, null, "Write the submission summary", "low", "a1"),
      task(ids.releasePass, ids.list, ids.section, "Run the release readiness pass", "high", "a2", {
        descriptionMd: "## Release check\n\nVerify the manual core before recording the final walkthrough.",
      }),
      task(ids.mobileScreenshot, ids.list, ids.section, "Capture the mobile screenshot", "medium", "a0", {
        parentTaskId: ids.releasePass,
      }),
      task(ids.selfHost, ids.list, null, "Verify the self-host setup", "medium", "a2", {
        status: "completed",
      }),
      task(ids.scopeChange, ids.list, null, "Change the approved demo scope", "none", "a3", {
        status: "cancelled",
      }),
    ],
    schedules: [
      timedSchedule(ids.recordDemo, today, "10:30", "11:30"),
      timedSchedule(ids.reviewMobile, today, "14:00", "14:30"),
      {
        taskId: ids.prepareData,
        kind: "all_day",
        startDate: today.toString(),
        endDate: tomorrow.toString(),
      },
      {
        taskId: ids.submissionSummary,
        kind: "all_day",
        startDate: tomorrow.toString(),
        endDate: dayAfterTomorrow.toString(),
      },
    ],
    checklistItems: [
      checklist(ids.checklistTaskLoop, ids.releasePass, "Test the core task loop", true, "a0"),
      checklist(ids.checklistMobile, ids.releasePass, "Verify the mobile layout", false, "a1"),
      checklist(ids.checklistExport, ids.releasePass, "Export clean JSON", false, "a2"),
    ],
    taskTags: [
      { taskId: ids.recordDemo, tagId: ids.launchTag },
      { taskId: ids.reviewMobile, tagId: ids.designTag },
      { taskId: ids.prepareData, tagId: ids.productTag },
      { taskId: ids.launchNarrative, tagId: ids.launchTag },
      { taskId: ids.releasePass, tagId: ids.productTag },
    ],
  };
}

function task(
  id: string,
  listId: string,
  sectionId: string | null,
  title: string,
  priority: "none" | "low" | "medium" | "high",
  rank: string,
  options: Readonly<{
    descriptionMd?: string;
    parentTaskId?: string;
    status?: "open" | "completed" | "cancelled";
  }> = {},
) {
  return {
    id,
    listId,
    sectionId,
    parentTaskId: options.parentTaskId ?? null,
    title,
    descriptionMd: options.descriptionMd ?? "",
    status: options.status ?? "open",
    priority,
    rank,
  } as const;
}

function timedSchedule(taskId: string, date: Temporal.PlainDate, startTime: string, endTime: string) {
  return {
    taskId,
    kind: "timed",
    startAt: localInstant(date, startTime),
    endAt: localInstant(date, endTime),
    timezone: DEMO_TIME_ZONE,
  } as const;
}

function localInstant(date: Temporal.PlainDate, time: string): Date {
  const instant = date
    .toPlainDateTime(Temporal.PlainTime.from(time))
    .toZonedDateTime(DEMO_TIME_ZONE)
    .toInstant();
  return new Date(instant.epochMilliseconds);
}

function checklist(id: string, taskId: string, title: string, isCompleted: boolean, rank: string) {
  return { id, taskId, title, isCompleted, rank } as const;
}
