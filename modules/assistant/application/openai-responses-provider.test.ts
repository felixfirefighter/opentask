import type OpenAI from "openai";
import { APIConnectionTimeoutError } from "openai";
import { describe, expect, it, vi } from "vitest";

import {
  PLANNER_SCHEMA_VERSION,
  modelExtractionSchema,
  plannerExtractionRequestSchema,
  validateExtractionReferences,
  type ModelExtraction,
  type PlannerExtractionProvider,
  type PlannerExtractionRequest,
} from "./contracts";
import { createOpenAIResponsesProvider } from "../infrastructure/openai-responses-provider";

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

function extraction(semanticRef = "selected-1"): ModelExtraction {
  return {
    schemaVersion: PLANNER_SCHEMA_VERSION,
    disposition: "actionable",
    summary: "Review the launch.",
    tasks: [
      {
        source: { kind: "selected_task", semanticRef: semanticRef as "selected-1" },
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

function createRecorder(responseOrError: unknown) {
  const parse =
    responseOrError instanceof Error
      ? vi.fn().mockRejectedValue(responseOrError)
      : vi.fn().mockResolvedValue(responseOrError);
  const events: Array<{ code: string; fields: unknown }> = [];
  const provider = createOpenAIResponsesProvider({
    apiKey: "provider-key",
    requestSchema: plannerExtractionRequestSchema,
    responseSchema: modelExtractionSchema,
    validateOutput: validateExtractionReferences,
    client: { responses: { parse } } as unknown as Pick<OpenAI, "responses">,
    log: { event: (code, fields) => events.push({ code, fields }) },
  });
  return { provider, parse, events };
}

describe("OpenAI Responses planner provider", () => {
  it("uses the exact privacy, model, reasoning, timeout, tool, and Structured Output contract", async () => {
    const fixture = createRecorder({
      output: [],
      output_parsed: extraction(),
      model: "gpt-5.6-2026-07-01",
      status: "completed",
    });
    const canonicalPort: PlannerExtractionProvider = fixture.provider;

    await expect(canonicalPort.extract(request())).resolves.toEqual({
      extraction: extraction(),
      model: "gpt-5.6-2026-07-01",
    });

    const [body, requestOptions] = fixture.parse.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(body).toMatchObject({
      model: "gpt-5.6",
      store: false,
      truncation: "disabled",
      tools: [],
      reasoning: { effort: "medium" },
      max_output_tokens: 4096,
    });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("metadata");
    expect(body).not.toHaveProperty("previous_response_id");
    expect(requestOptions).toEqual({ timeout: 30_000, maxRetries: 0 });
    expect(body.text).toMatchObject({
      format: { type: "json_schema", name: "opentask_planner_extraction_v1", strict: true },
    });

    const serialized = body.input;
    expect(typeof serialized).toBe("string");
    const sent = JSON.parse(serialized as string) as Record<string, unknown>;
    expect(sent).toEqual(request());
    expect(JSON.stringify(sent)).not.toContain("provider-key");
    expect(JSON.stringify(sent)).not.toContain("11111111-1111");
    expect(JSON.stringify(sent)).not.toContain("descriptionMd");
    expect(fixture.events).toEqual([]);
  });

  it("handles explicit refusal without retaining refusal or input content in errors or logs", async () => {
    const fixture = createRecorder({
      output: [
        {
          type: "message",
          content: [{ type: "refusal", refusal: "Sensitive refusal detail" }],
        },
      ],
      output_parsed: null,
      model: "gpt-5.6",
      status: "completed",
    });

    const error = await fixture.provider.extract(request()).catch((caught: unknown) => caught);
    expect(error).toEqual(expect.objectContaining({ kind: "refusal" }));
    const observable = JSON.stringify({
      name: (error as Error).name,
      message: (error as Error).message,
      events: fixture.events,
    });
    expect(observable).not.toContain("Sensitive refusal detail");
    expect(observable).not.toContain("Prepare launch notes");
    expect(fixture.events).toEqual([
      { code: "REQUEST_FAILED", fields: { errorName: "PlannerProviderRefusalError" } },
    ]);
  });

  it.each([
    [new APIConnectionTimeoutError(), "timeout", "PlannerProviderTimeoutError"],
    [new Error("Provider leaked content: Review launch"), "unavailable", "PlannerProviderUnavailableError"],
  ] as const)("normalizes provider failures without logging causes", async (cause, kind, errorName) => {
    const fixture = createRecorder(cause);
    const error = await fixture.provider.extract(request()).catch((caught: unknown) => caught);

    expect(error).toEqual(expect.objectContaining({ kind }));
    expect(fixture.events).toEqual([{ code: "REQUEST_FAILED", fields: { errorName } }]);
    expect(JSON.stringify({ error, events: fixture.events })).not.toContain("Review launch");
  });

  it("rejects missing, schema-invalid, and semantically unknown output", async () => {
    const missing = createRecorder({
      output: [],
      output_parsed: null,
      model: "gpt-5.6",
      status: "completed",
    });
    await expect(missing.provider.extract(request())).rejects.toMatchObject({
      kind: "malformed_output",
    });

    const incomplete = createRecorder({
      output: [],
      output_parsed: extraction(),
      model: "gpt-5.6",
      status: "incomplete",
    });
    await expect(incomplete.provider.extract(request())).rejects.toMatchObject({
      kind: "malformed_output",
    });

    const malformed = createRecorder({
      output: [],
      output_parsed: { ...extraction(), command: "complete" },
      model: "gpt-5.6",
      status: "completed",
    });
    await expect(malformed.provider.extract(request())).rejects.toMatchObject({
      kind: "malformed_output",
    });

    const semantic = createRecorder({
      output: [],
      output_parsed: extraction("selected-2"),
      model: "gpt-5.6",
      status: "completed",
    });
    await expect(semantic.provider.extract(request())).rejects.toMatchObject({
      kind: "semantic_invalid",
    });
  });

  it("rejects invalid request data before any provider call or failure log", async () => {
    const fixture = createRecorder({
      output: [],
      output_parsed: extraction(),
      model: "gpt-5.6",
      status: "completed",
    });
    await expect(
      fixture.provider.extract({ ...request(), selectedTasks: [{ ...request().selectedTasks[0], id: 1 }] }),
    ).rejects.toHaveProperty("name", "ZodError");
    expect(fixture.parse).not.toHaveBeenCalled();
    expect(fixture.events).toEqual([]);
  });

  it("refuses provider construction when no key or an unbounded timeout is supplied", () => {
    expect(() =>
      createOpenAIResponsesProvider({
        apiKey: " ",
        requestSchema: plannerExtractionRequestSchema,
        responseSchema: modelExtractionSchema,
      }),
    ).toThrow(RangeError);
    expect(() =>
      createOpenAIResponsesProvider({
        apiKey: "provider-key",
        requestSchema: plannerExtractionRequestSchema,
        responseSchema: modelExtractionSchema,
        timeoutMs: 120_001,
      }),
    ).toThrow(RangeError);
  });
});
