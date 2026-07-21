import { beforeEach, describe, expect, it, vi } from "vitest";

import { verifyOpenAIKey } from "./openai-settings";

describe("OpenAI key verification", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("accepts a successful models response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    await expect(verifyOpenAIKey("sk-test-value")).resolves.toEqual({ ok: true });
  });

  it("distinguishes invalid credentials from network failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    await expect(verifyOpenAIKey("sk-invalid")).resolves.toEqual({ ok: false, reason: "invalid" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(verifyOpenAIKey("sk-offline")).resolves.toEqual({ ok: false, reason: "network" });
  });
});
