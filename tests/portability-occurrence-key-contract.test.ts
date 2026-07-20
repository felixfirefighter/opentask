import { describe, expect, it } from "vitest";

import { portableOccurrenceKeySchema } from "../modules/portability/application/export-contract-primitives.ts";
import {
  createOccurrenceKey,
  createProjectedOccurrenceKey,
} from "../modules/tasks/domain/recurrence/occurrence-key.ts";

const taskId = "3f83c816-8db5-4fca-8cd6-4dfa924b7770";

describe("portable occurrence key compatibility", () => {
  it("accepts canonical o1 and Pacific/Apia date-crossing o2 keys from the task codec", () => {
    const o1Key = createOccurrenceKey(taskId, { kind: "all_day", startDate: "2026-07-20" });
    const o2Key = createApiaDateCrossingKey(taskId);

    expect(o1Key).toMatch(/^o1\./);
    expect(o2Key).toMatch(/^o2\./);
    expect(portableOccurrenceKeySchema.parse(o1Key)).toBe(o1Key);
    expect(portableOccurrenceKeySchema.parse(o2Key)).toBe(o2Key);
  });

  it.each([
    ["unsupported version", "o3.payload"],
    ["hyphenated task identity", `o2.${taskId}_0_0`],
    ["non-v4 task identity", `o2.${"0".repeat(32)}_0_0`],
    ["uppercase task identity", `o2.${taskId.replaceAll("-", "").toUpperCase()}_0_0`],
    ["missing local start", `o2.${taskId.replaceAll("-", "")}_0`],
    ["leading-zero instant", `o2.${taskId.replaceAll("-", "")}_01_0`],
    ["noncanonical sign", `o2.${taskId.replaceAll("-", "")}_+1_0`],
    ["uppercase base36", `o2.${taskId.replaceAll("-", "")}_A_0`],
    ["unsafe base36 integer", `o2.${taskId.replaceAll("-", "")}_2gosa7pa2gw_0`],
    ["oversized base36 integer", `o2.${taskId.replaceAll("-", "")}_${"z".repeat(12)}_0`],
  ])("rejects %s", (_case, key) => {
    expect(portableOccurrenceKeySchema.safeParse(key).success).toBe(false);
  });
});

function createApiaDateCrossingKey(id: string): string {
  return createProjectedOccurrenceKey(
    id,
    { kind: "timed", startAt: "2011-12-30T19:00:00Z" },
    { kind: "timed", startLocalDateTime: "2011-12-30T09:00" },
    "Pacific/Apia",
  );
}
