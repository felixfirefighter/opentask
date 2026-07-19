import { describe, expect, it } from "vitest";

import { decodeTerminalTaskCursor, encodeTerminalTaskCursor } from "./terminal-task-cursor";

const taskId = "11111111-1111-4111-8111-111111111111";

describe("terminal task cursor", () => {
  it("round-trips a canonical status-bound cursor", () => {
    const cursor = encodeTerminalTaskCursor({
      version: 1,
      status: "completed",
      statusChangedAt: "2026-07-19T09:00:00.000Z",
      id: taskId,
    });

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeTerminalTaskCursor(cursor, "completed")).toEqual({
      version: 1,
      status: "completed",
      statusChangedAt: "2026-07-19T09:00:00.000Z",
      id: taskId,
    });
  });

  it("rejects malformed, noncanonical, wrong-version, and cross-status cursors", () => {
    const completed = encodeTerminalTaskCursor({
      version: 1,
      status: "completed",
      statusChangedAt: "2026-07-19T09:00:00.000Z",
      id: taskId,
    });
    const wrongVersion = Buffer.from(
      JSON.stringify({
        version: 2,
        status: "completed",
        statusChangedAt: "2026-07-19T09:00:00.000Z",
        id: taskId,
      }),
      "utf8",
    ).toString("base64url");

    for (const [cursor, status] of [
      ["not-json", "completed"],
      [`${completed}=`, "completed"],
      [wrongVersion, "completed"],
      [completed, "cancelled"],
    ] as const) {
      expect(() => decodeTerminalTaskCursor(cursor, status)).toThrowError(
        expect.objectContaining({ code: "VALIDATION_FAILED" }),
      );
    }
  });
});
