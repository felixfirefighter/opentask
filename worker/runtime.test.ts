import { describe, expect, it, vi } from "vitest";

import type { NotificationWorkerRuntime } from "../modules/notifications/index";
import type { SafeLogger } from "../shared/logging/logger";
import { checkWorker, startWorker } from "./runtime";

describe("worker process runtime", () => {
  it("logs the exact non-consuming check result", async () => {
    const { runtime, check, start } = createRuntime();
    const { logger, event } = createTestLogger();

    await checkWorker(runtime, logger);

    expect(check).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
    expect(event).toHaveBeenCalledWith("WORKER_CHECK_OK", { declaredJobCount: 2 });
  });

  it("logs two registered jobs and stops the active runtime once", async () => {
    const { runtime, activeStop } = createRuntime();
    const { logger, event } = createTestLogger();

    const worker = await startWorker(runtime, logger);
    await worker.stop();
    await worker.stop();

    expect(event).toHaveBeenNthCalledWith(1, "WORKER_READY", { registeredJobCount: 2 });
    expect(event).toHaveBeenNthCalledWith(2, "WORKER_STOPPED");
    expect(activeStop).toHaveBeenCalledOnce();
  });
});

function createRuntime() {
  const check = vi.fn().mockResolvedValue(undefined);
  const activeStop = vi.fn().mockResolvedValue(undefined);
  const start = vi.fn().mockResolvedValue({ stop: activeStop });
  const runtime: NotificationWorkerRuntime = { declaredJobCount: 2, check, start };
  return { runtime, check, start, activeStop };
}

function createTestLogger() {
  const event = vi.fn();
  return { logger: { event } satisfies SafeLogger, event };
}
