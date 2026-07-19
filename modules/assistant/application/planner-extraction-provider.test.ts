import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PLANNER_SCHEMA_VERSION,
  modelExtractionSchema,
  plannerExtractionRequestSchema,
  type ModelExtraction,
  type PlannerExtractionProvider,
  type PlannerExtractionRequest,
} from "./contracts";

const providerMocks = vi.hoisted(() => ({ createConfigured: vi.fn() }));

vi.mock("../infrastructure/openai-responses-provider", () => ({
  createConfiguredOpenAIResponsesProvider: providerMocks.createConfigured,
}));

import { createPlannerExtractionProvider } from "./planner-extraction-provider";

function request(): PlannerExtractionRequest {
  return {
    schemaVersion: PLANNER_SCHEMA_VERSION,
    brainDump: "Prepare launch notes",
    planningDate: "2026-07-20",
    timeZone: "Asia/Singapore",
    workWindow: { start: "09:00", end: "17:00" },
    defaultDurationMinutes: 30,
    bufferMinutes: 10,
    selectedTasks: [{ semanticRef: "selected-1", title: "Review launch", priority: "high" }],
  };
}

function extraction(semanticRef: "selected-1" | "selected-2" = "selected-1"): ModelExtraction {
  return {
    schemaVersion: PLANNER_SCHEMA_VERSION,
    disposition: "actionable",
    summary: "Review the launch.",
    tasks: [
      {
        source: { kind: "selected_task", semanticRef },
        title: "Review launch",
        detail: null,
        estimateMinutes: 30,
        priority: "high",
        timing: { kind: "flexible", earliestStart: null, deadline: null },
        constraints: [],
        uncertainties: [],
        rationale: "It is ready to plan.",
      },
    ],
    uncertainties: [],
  };
}

describe("canonical production planner provider factory", () => {
  beforeEach(() => {
    providerMocks.createConfigured.mockReset();
  });

  it("hard-wires both canonical schemas and non-optional semantic reference validation", async () => {
    providerMocks.createConfigured.mockReturnValue({
      extract: vi.fn().mockResolvedValue({ extraction: extraction(), model: "gpt-5.6" }),
    });

    const provider: PlannerExtractionProvider | null = createPlannerExtractionProvider();
    expect(provider).not.toBeNull();
    const options = providerMocks.createConfigured.mock.calls[0]?.[0];
    expect(options?.requestSchema).toBe(plannerExtractionRequestSchema);
    expect(options?.responseSchema).toBe(modelExtractionSchema);
    expect(options?.validateOutput(request(), extraction())).toBe(true);
    expect(options?.validateOutput(request(), extraction("selected-2"))).toBe(false);
    await expect(provider?.extract(request())).resolves.toEqual({
      extraction: extraction(),
      model: "gpt-5.6",
    });
  });

  it("returns the capability-safe null state when no provider is configured", () => {
    providerMocks.createConfigured.mockReturnValue(null);
    expect(createPlannerExtractionProvider()).toBeNull();
  });
});
