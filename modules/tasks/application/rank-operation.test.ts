import type { DatabaseExecutor } from "@/shared/db/client";
import { describe, expect, it, vi } from "vitest";

import { planLockedRank } from "./rank-operation";

describe("rank operation boundary", () => {
  it("maps unusable stored rank state to a safe conflict", async () => {
    const executor = { execute: vi.fn().mockResolvedValue(undefined) } as unknown as DatabaseExecutor;
    await expect(
      planLockedRank(
        executor,
        ["folders", "11111111-1111-4111-8111-111111111111"],
        async () => [{ id: "22222222-2222-4222-8222-222222222222", rank: "not-valid!" }],
        "33333333-3333-4333-8333-333333333333",
        { kind: "end" },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", currentVersion: undefined });
  });
});
