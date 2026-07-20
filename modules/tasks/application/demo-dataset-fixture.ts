import { Temporal } from "temporal-polyfill";

import type { DemoDatasetRecords } from "../infrastructure/demo-dataset-repository";

export const DEMO_TIME_ZONE = "UTC";

const ids = {
  folder: "10000000-0000-4000-8000-000000000001",
  list: "20000000-0000-4000-8000-000000000001",
  section: "30000000-0000-4000-8000-000000000001",
  eventTag: "40000000-0000-4000-8000-000000000001",
  designTag: "40000000-0000-4000-8000-000000000002",
  planningTag: "40000000-0000-4000-8000-000000000003",
  workshopAgenda: "50000000-0000-4000-8000-000000000001",
  reviewMobile: "50000000-0000-4000-8000-000000000002",
  attendeeNotes: "50000000-0000-4000-8000-000000000003",
  welcomeMessage: "50000000-0000-4000-8000-000000000004",
  volunteerAgenda: "50000000-0000-4000-8000-000000000005",
  followUpSummary: "50000000-0000-4000-8000-000000000006",
  readinessReview: "50000000-0000-4000-8000-000000000007",
  mobileLayout: "50000000-0000-4000-8000-000000000008",
  venueSetup: "50000000-0000-4000-8000-000000000009",
  optionalSession: "50000000-0000-4000-8000-000000000010",
  checklistAttendeeFlow: "60000000-0000-4000-8000-000000000001",
  checklistMobile: "60000000-0000-4000-8000-000000000002",
  checklistExport: "60000000-0000-4000-8000-000000000003",
} as const;

export function buildDemoDatasetFixture(resetAt: Date, inboxId: string): DemoDatasetRecords {
  const today = Temporal.Instant.from(resetAt.toISOString()).toZonedDateTimeISO(DEMO_TIME_ZONE).toPlainDate();
  const tomorrow = today.add({ days: 1 });
  const dayAfterTomorrow = today.add({ days: 2 });

  return {
    resetAt,
    folder: { id: ids.folder, name: "Community", rank: "a0" },
    regularList: {
      id: ids.list,
      folderId: ids.folder,
      name: "Community workshop",
      colorToken: "coral",
      rank: "a0",
    },
    section: { id: ids.section, listId: ids.list, name: "This week", rank: "a0" },
    tags: [
      { id: ids.eventTag, name: "Event", colorToken: "coral" },
      { id: ids.designTag, name: "Design", colorToken: "sky" },
      { id: ids.planningTag, name: "Planning", colorToken: "amber" },
    ],
    tasks: [
      task(ids.workshopAgenda, ids.list, ids.section, "Outline the workshop agenda", "high", "a0", {
        descriptionMd: "Keep the session focused: welcome, discussion, practice, and next steps.",
      }),
      task(ids.reviewMobile, ids.list, ids.section, "Review event page on mobile", "medium", "a1"),
      task(ids.attendeeNotes, inboxId, null, "Prepare attendee notes", "medium", "a0"),
      task(ids.welcomeMessage, ids.list, null, "Draft the welcome message", "high", "a0", {
        descriptionMd: "Turn the event goals into three clear opening points.",
      }),
      task(ids.volunteerAgenda, inboxId, null, "Send the agenda to volunteers", "medium", "a1"),
      task(ids.followUpSummary, ids.list, null, "Write the follow-up summary", "low", "a1"),
      task(ids.readinessReview, ids.list, ids.section, "Run the workshop readiness review", "high", "a2", {
        descriptionMd: "## Readiness check\n\nVerify the agenda, attendee notes, and venue before the event.",
      }),
      task(ids.mobileLayout, ids.list, ids.section, "Check the mobile layout", "medium", "a0", {
        parentTaskId: ids.readinessReview,
      }),
      task(ids.venueSetup, ids.list, null, "Confirm the venue setup", "medium", "a2", {
        status: "completed",
      }),
      task(ids.optionalSession, ids.list, null, "Add an optional afternoon session", "none", "a3", {
        status: "cancelled",
      }),
    ],
    schedules: [
      timedSchedule(ids.workshopAgenda, today, "10:30", "11:30"),
      timedSchedule(ids.reviewMobile, today, "14:00", "14:30"),
      {
        taskId: ids.attendeeNotes,
        kind: "all_day",
        startDate: today.toString(),
        endDate: tomorrow.toString(),
      },
      {
        taskId: ids.followUpSummary,
        kind: "all_day",
        startDate: tomorrow.toString(),
        endDate: dayAfterTomorrow.toString(),
      },
    ],
    checklistItems: [
      checklist(ids.checklistAttendeeFlow, ids.readinessReview, "Review the attendee journey", true, "a0"),
      checklist(ids.checklistMobile, ids.readinessReview, "Verify the mobile layout", false, "a1"),
      checklist(ids.checklistExport, ids.readinessReview, "Export the event checklist", false, "a2"),
    ],
    taskTags: [
      { taskId: ids.workshopAgenda, tagId: ids.eventTag },
      { taskId: ids.reviewMobile, tagId: ids.designTag },
      { taskId: ids.attendeeNotes, tagId: ids.planningTag },
      { taskId: ids.welcomeMessage, tagId: ids.eventTag },
      { taskId: ids.readinessReview, tagId: ids.planningTag },
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
