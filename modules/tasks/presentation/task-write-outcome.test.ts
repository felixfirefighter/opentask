import { describe, expect, it } from "vitest";

import { TaskApiError } from "./data/task-api-request";
import { classifyTaskWriteOutcome } from "./task-write-outcome";

describe("classifyTaskWriteOutcome", () => {
  it("keeps optimistic conflicts distinct from definite client rejections", () => {
    expect(
      classifyTaskWriteOutcome(new TaskApiError({ code: "CONFLICT", status: 409, detail: "Stale version" })),
    ).toBe("conflict");
    expect(
      classifyTaskWriteOutcome(
        new TaskApiError({ code: "VALIDATION_FAILED", status: 422, detail: "Invalid input" }),
      ),
    ).toBe("rejected");
  });

  it("treats network, server, and unreadable-success failures as unconfirmed", () => {
    expect(classifyTaskWriteOutcome(new TypeError("Failed to fetch"))).toBe("unconfirmed");
    expect(
      classifyTaskWriteOutcome(new TaskApiError({ code: "INTERNAL", status: 500, detail: "Server error" })),
    ).toBe("unconfirmed");
  });
});
