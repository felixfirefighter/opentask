import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createLogger, type SafeLogFields } from "./logger";

describe("structured logging", () => {
  it("emits only reviewed metadata with a static event message", () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += String(chunk);
        callback();
      },
    });
    const forbidden = {
      correlationId: "corr-123",
      errorName: "DatabaseError",
      title: "sentinel-task-title",
      error: new Error("sentinel-error-message"),
      payload: {
        tasks: ["sentinel-array-content"],
        plannerInput: "sentinel-planner-input",
      },
      request: {
        url: "https://example.invalid/?token=sentinel-query-token",
        headers: { authorization: "Bearer sentinel-authorization" },
      },
      subscription: {
        endpoint: "https://push.invalid/sentinel-endpoint",
        keys: { p256dh: "sentinel-p256dh", auth: "sentinel-push-auth" },
      },
    } as unknown as SafeLogFields;

    createLogger(destination).event("READINESS_FAILED", forbidden);

    const line = JSON.parse(output) as Record<string, unknown>;
    expect(line).toMatchObject({
      code: "READINESS_FAILED",
      correlationId: "corr-123",
      errorName: "DatabaseError",
      msg: "readiness check failed",
    });
    expect(Object.keys(line).sort()).toEqual(
      ["code", "correlationId", "errorName", "level", "msg", "time"].sort(),
    );
    expect(output).not.toContain("sentinel-");
  });

  it("drops invalid values even when a caller bypasses the type contract", () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += String(chunk);
        callback();
      },
    });

    createLogger(destination).event("WORKER_READY", {
      correlationId: "contains spaces and user content",
      errorName: { message: "sentinel-nested-error" },
      registeredJobCount: -1,
      recordsWritten: Number.NaN,
    } as unknown as SafeLogFields);

    const line = JSON.parse(output) as Record<string, unknown>;
    expect(Object.keys(line).sort()).toEqual(["code", "level", "msg", "time"].sort());
    expect(output).not.toContain("sentinel-");
  });

  it("rejects unreviewed fields and raw logging methods at type-check time", () => {
    if (false) {
      const logger = createLogger();
      // @ts-expect-error User content is not safe logging metadata.
      logger.event("READINESS_FAILED", { title: "private" });
      // @ts-expect-error Callers cannot provide free-form log messages.
      logger.info({ code: "READINESS_FAILED" }, "private message");
    }

    expect(true).toBe(true);
  });
});
