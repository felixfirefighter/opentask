import { describe, expect, it } from "vitest";

import { ApplicationError } from "@/shared/http/application-error";

import {
  decodeFocusHistoryCursor,
  encodeFocusHistoryCursor,
  focusHistoryAfter,
} from "./focus-history-cursor";

const userId = "10000000-0000-4000-8000-000000000001";
const otherUserId = "10000000-0000-4000-8000-000000000002";
const sessionId = "70000000-0000-4000-8000-000000000001";
const endedAt = "2026-07-21T08:00:00.000Z";

describe("focus history cursor", () => {
  it("round-trips one canonical actor-bound anchor", () => {
    const encoded = encodeFocusHistoryCursor({ version: 1, userId, endedAt, id: sessionId });

    expect(decodeFocusHistoryCursor(encoded, userId)).toEqual({
      version: 1,
      userId,
      endedAt,
      id: sessionId,
    });
    expect(
      focusHistoryAfter(decodeFocusHistoryCursor(encoded, userId), {
        id: sessionId,
        endedAt: new Date(endedAt),
      }),
    ).toEqual({ id: sessionId, endedAt: new Date(endedAt) });
  });

  it("rejects another actor, noncanonical input, malformed JSON, and a changed anchor", () => {
    const encoded = encodeFocusHistoryCursor({ version: 1, userId, endedAt, id: sessionId });
    const padded = `${encoded}=`;

    for (const run of [
      () => decodeFocusHistoryCursor(encoded, otherUserId),
      () => decodeFocusHistoryCursor(padded, userId),
      () => decodeFocusHistoryCursor("bm90LWpzb24", userId),
      () =>
        focusHistoryAfter(decodeFocusHistoryCursor(encoded, userId), {
          id: sessionId,
          endedAt: new Date("2026-07-21T08:00:01.000Z"),
        }),
      () => focusHistoryAfter(decodeFocusHistoryCursor(encoded, userId), null),
    ]) {
      expect(run).toThrowError(ApplicationError);
      try {
        run();
      } catch (error) {
        expect(error).toMatchObject({ code: "VALIDATION_FAILED" });
      }
    }
  });
});
