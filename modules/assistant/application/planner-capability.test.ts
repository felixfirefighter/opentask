import { beforeEach, describe, expect, it, vi } from "vitest";

const configurationMocks = vi.hoisted(() => ({ isOpenAIConfigured: vi.fn() }));

vi.mock("../infrastructure/openai-configuration", () => ({
  isOpenAIConfigured: configurationMocks.isOpenAIConfigured,
}));

import { getPlannerCapability } from "./planner-capability";

describe("production planner capability", () => {
  beforeEach(() => {
    configurationMocks.isOpenAIConfigured.mockReset();
  });

  it("reports the actual missing-environment state through the configuration boundary", () => {
    configurationMocks.isOpenAIConfigured.mockReturnValue(false);

    const capability = getPlannerCapability();

    expect(capability).toEqual({ state: "disabled", reason: "missing_api_key" });
    expect(configurationMocks.isOpenAIConfigured).toHaveBeenCalledOnce();
    expect(JSON.stringify(capability)).not.toContain("apiKey");
  });

  it("reports the pinned provider contract when configuration is available", () => {
    configurationMocks.isOpenAIConfigured.mockReturnValue(true);

    expect(getPlannerCapability()).toEqual({
      state: "available",
      model: "gpt-5.6",
      schemaVersion: 1,
    });
  });
});
