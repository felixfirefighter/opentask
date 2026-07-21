import { describe, expect, it } from "vitest";

import {
  PLANNER_SCHEMA_VERSION,
  modelExtractionSchema,
  plannerExtractionRequestSchema,
  validateExtractionReferences,
} from "./index";

const baseRequest = {
  schemaVersion: PLANNER_SCHEMA_VERSION,
  planningDate: "2026-07-20",
  timeZone: "Asia/Singapore",
  workWindow: { start: "09:00", end: "17:00" },
  defaultDurationMinutes: 30,
  bufferMinutes: 10,
  selectedTasks: [
    { semanticRef: "selected-1", title: "Review workshop checklist", priority: "high" },
    { semanticRef: "selected-2", title: "Prepare attendee notes", priority: "medium" },
  ],
} as const;

const goldenFixtures = [
  {
    name: "vague input preserves uncertainty",
    request: { ...baseRequest, brainDump: "Do something about the workshop sometime" },
    output: {
      schemaVersion: PLANNER_SCHEMA_VERSION,
      disposition: "partially_actionable",
      summary: "Clarify the workshop follow-up before scheduling it.",
      tasks: [
        {
          source: { kind: "brain_dump", semanticRef: "new-1" },
          title: "Clarify workshop follow-up",
          detail: "Determine the concrete workshop outcome and timing.",
          estimateMinutes: 30,
          priority: "none",
          timing: { kind: "flexible", earliestStart: null, deadline: null },
          constraints: [],
          uncertainties: ["The desired outcome and deadline are unclear."],
          rationale: "The note needs clarification before it can become a precise plan.",
        },
      ],
      uncertainties: ["Confirm what workshop task is required and when it is due."],
    },
  },
  {
    name: "multiple items keep distinct selected and new references",
    request: {
      ...baseRequest,
      brainDump: "Review the selected workshop task, prepare attendee notes, and draft workshop notes.",
    },
    output: {
      schemaVersion: PLANNER_SCHEMA_VERSION,
      disposition: "actionable",
      summary: "Plan two selected tasks and one new workshop-notes task.",
      tasks: [
        {
          source: { kind: "selected_task", semanticRef: "selected-1" },
          title: "Review workshop checklist",
          detail: null,
          estimateMinutes: 30,
          priority: "high",
          timing: { kind: "flexible", earliestStart: null, deadline: null },
          constraints: [],
          uncertainties: [],
          rationale: "The selected workshop review is ready to schedule.",
        },
        {
          source: { kind: "selected_task", semanticRef: "selected-2" },
          title: "Prepare attendee notes",
          detail: null,
          estimateMinutes: 45,
          priority: "medium",
          timing: { kind: "flexible", earliestStart: null, deadline: null },
          constraints: [],
          uncertainties: [],
          rationale: "The selected attendee-notes task is ready to schedule.",
        },
        {
          source: { kind: "brain_dump", semanticRef: "new-1" },
          title: "Draft workshop notes",
          detail: null,
          estimateMinutes: 30,
          priority: "medium",
          timing: { kind: "flexible", earliestStart: null, deadline: null },
          constraints: [],
          uncertainties: [],
          rationale: "The brain dump contains a distinct actionable task.",
        },
      ],
      uncertainties: [],
    },
  },
  {
    name: "fixed timing remains a bounded local interval",
    request: {
      ...baseRequest,
      brainDump: "Record the demo from 10:30 to 11:30 on July 20, 2026.",
    },
    output: {
      schemaVersion: PLANNER_SCHEMA_VERSION,
      disposition: "actionable",
      summary: "Record the demo in the requested fixed interval.",
      tasks: [
        {
          source: { kind: "brain_dump", semanticRef: "new-1" },
          title: "Record the demo",
          detail: null,
          estimateMinutes: 60,
          priority: "medium",
          timing: {
            kind: "fixed",
            start: { date: "2026-07-20", time: "10:30" },
            end: { date: "2026-07-20", time: "11:30" },
          },
          constraints: ["Keep the requested 10:30 to 11:30 interval."],
          uncertainties: [],
          rationale: "The user supplied an explicit date and time range.",
        },
      ],
      uncertainties: [],
    },
  },
  {
    name: "irrelevant input produces no task hallucinations",
    request: { ...baseRequest, selectedTasks: [], brainDump: "The sunset looked beautiful today." },
    output: {
      schemaVersion: PLANNER_SCHEMA_VERSION,
      disposition: "irrelevant",
      summary: "The note does not contain a planning request.",
      tasks: [],
      uncertainties: [],
    },
  },
] as const;

describe("canonical model-extraction golden fixtures", () => {
  it.each(goldenFixtures)("accepts $name", ({ request, output }) => {
    const canonicalRequest = plannerExtractionRequestSchema.parse(request);
    const canonicalOutput = modelExtractionSchema.parse(output);

    expect(validateExtractionReferences(canonicalRequest, canonicalOutput)).toBe(true);
  });
});
