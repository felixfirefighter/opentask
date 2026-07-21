import { describe, expect, it } from "vitest";

import {
  decodeHabitPageCursor,
  encodeHabitPageCursor,
  habitPageAfter,
  habitPageFromRows,
} from "./habit-page-cursor";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const updatedAt = "2026-07-21T01:02:03.000Z";

describe("habit page cursor", () => {
  it("round-trips one canonical opaque cursor and constructs a deterministic page", () => {
    const rows = [
      { id: firstId, updatedAt: new Date(updatedAt) },
      { id: secondId, updatedAt: new Date("2026-07-20T01:02:03.000Z") },
    ];
    const page = habitPageFromRows(rows, 1, "overviews", "active");

    expect(page.items).toEqual([rows[0]]);
    expect(decodeHabitPageCursor(page.nextCursor ?? undefined, "overviews", "active")).toEqual({
      version: 1,
      scope: "overviews",
      lifecycle: "active",
      updatedAt,
      id: firstId,
    });
  });

  it("rejects scope, lifecycle, noncanonical payload, and noncanonical timestamps generically", () => {
    const cursor = encodeHabitPageCursor({
      version: 1,
      scope: "definitions",
      lifecycle: "active",
      updatedAt,
      id: firstId,
    });
    for (const read of [
      () => decodeHabitPageCursor(cursor, "today", "active"),
      () => decodeHabitPageCursor(cursor, "definitions", "archived"),
      () =>
        decodeHabitPageCursor(
          Buffer.from(
            JSON.stringify({ id: firstId, updatedAt, lifecycle: "active", scope: "definitions", version: 1 }),
            "utf8",
          ).toString("base64url"),
          "definitions",
          "active",
        ),
      () =>
        decodeHabitPageCursor(
          Buffer.from(
            JSON.stringify({
              version: 1,
              scope: "definitions",
              lifecycle: "active",
              updatedAt: "2026-07-21T01:02:03+00:00",
              id: firstId,
            }),
            "utf8",
          ).toString("base64url"),
          "definitions",
          "active",
        ),
    ]) {
      expect(read).toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    }
  });

  it("rejects a missing or changed actor-scoped anchor as expired", () => {
    const decoded = decodeHabitPageCursor(
      encodeHabitPageCursor({
        version: 1,
        scope: "today",
        lifecycle: "active",
        updatedAt,
        id: firstId,
      }),
      "today",
      "active",
    );

    expect(() => habitPageAfter(decoded, null)).toThrowError(
      expect.objectContaining({ code: "VALIDATION_FAILED" }),
    );
    expect(() =>
      habitPageAfter(decoded, { id: firstId, updatedAt: new Date("2026-07-21T01:02:04.000Z") }),
    ).toThrowError(expect.objectContaining({ code: "VALIDATION_FAILED" }));
    expect(habitPageAfter(decoded, { id: firstId, updatedAt: new Date(updatedAt) })).toEqual({
      id: firstId,
      updatedAt: new Date(updatedAt),
    });
  });
});
