import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createNotificationWorkerRuntime,
  NotificationDeliveryRetryError,
  NotificationWorkerModeError,
} from "./pg-boss-notification-worker";

const userId = "10000000-0000-4000-8000-000000000001";
const deliveryId = "20000000-0000-4000-8000-000000000001";
const reminderId = "30000000-0000-4000-8000-000000000001";

describe("pg-boss notification worker", () => {
  let boss: ReturnType<typeof createBoss>;
  let handlers: Parameters<typeof createNotificationWorkerRuntime>[1];
  let validateSchema: ReturnType<typeof createVoidAsyncMock>;
  let cleanup: ReturnType<typeof createVoidAsyncMock>;

  beforeEach(() => {
    boss = createBoss();
    handlers = {
      deliverNotification: vi.fn().mockResolvedValue({ outcome: "completed" }),
      runNotificationMaintenance: vi.fn().mockResolvedValue(undefined),
    };
    validateSchema = createVoidAsyncMock();
    cleanup = createVoidAsyncMock();
  });

  it("checks both queues without registering a consumer or sending work", async () => {
    const runtime = createRuntime(boss, handlers, validateSchema, true, cleanup);

    await runtime.check();

    expect(runtime.declaredJobCount).toBe(2);
    expect(boss.start).toHaveBeenCalledOnce();
    expect(validateSchema).toHaveBeenCalledOnce();
    expect([...boss.queues.keys()]).toEqual(["notification_delivery_v1", "notification_maintenance_v1"]);
    expect(boss.work).not.toHaveBeenCalled();
    expect(boss.send).not.toHaveBeenCalled();
    expect(boss.stop).toHaveBeenCalledWith({ graceful: true, timeout: 15_000 });
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("registers exactly two bounded handlers and stops idempotently", async () => {
    const runtime = createRuntime(boss, handlers, validateSchema, true, cleanup);

    const active = await runtime.start();

    expect(boss.work).toHaveBeenCalledTimes(2);
    expect(boss.work.mock.calls.map(([queue]) => queue)).toEqual([
      "notification_delivery_v1",
      "notification_maintenance_v1",
    ]);
    expect(boss.work.mock.calls[0]?.[1]).toEqual({ batchSize: 1, localConcurrency: 4 });
    expect(boss.work.mock.calls[1]?.[1]).toEqual({ batchSize: 1, localConcurrency: 1 });

    await active.stop();
    await active.stop();
    expect(boss.stop).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("parses jobs and rejects only an explicit delivery retry with a sanitized signal", async () => {
    const runtime = createRuntime(boss, handlers, validateSchema, true, cleanup);
    await runtime.start();
    const deliveryHandler = boss.handlers.get("notification_delivery_v1")!;
    const maintenanceHandler = boss.handlers.get("notification_maintenance_v1")!;
    const deliveryJob = { schemaVersion: 1, userId, deliveryId } as const;

    await expect(deliveryHandler([{ data: deliveryJob }])).resolves.toBeUndefined();
    expect(handlers.deliverNotification).toHaveBeenCalledWith(deliveryJob);

    vi.mocked(handlers.deliverNotification).mockResolvedValueOnce({ outcome: "noop" });
    await expect(deliveryHandler([{ data: deliveryJob }])).resolves.toBeUndefined();

    vi.mocked(handlers.deliverNotification).mockResolvedValueOnce({ outcome: "retry" });
    await expect(deliveryHandler([{ data: deliveryJob }])).rejects.toBeInstanceOf(
      NotificationDeliveryRetryError,
    );
    await expect(deliveryHandler([{ data: deliveryJob }])).resolves.toBeUndefined();
    try {
      vi.mocked(handlers.deliverNotification).mockResolvedValueOnce({ outcome: "retry" });
      await deliveryHandler([{ data: deliveryJob }]);
    } catch (error) {
      expect((error as Error).message).not.toContain(userId);
      expect((error as Error).message).not.toContain(deliveryId);
    }

    const maintenanceJob = {
      schemaVersion: 1,
      userId,
      kind: "recurring_repair",
      reminderId,
    } as const;
    await maintenanceHandler([{ data: maintenanceJob }]);
    expect(handlers.runNotificationMaintenance).toHaveBeenCalledWith(maintenanceJob);
  });

  it("refuses consumer startup unless worker mode is explicitly enabled", async () => {
    const runtime = createRuntime(boss, handlers, validateSchema, false, cleanup);

    await expect(runtime.start()).rejects.toBeInstanceOf(NotificationWorkerModeError);
    expect(boss.start).not.toHaveBeenCalled();
    expect(boss.work).not.toHaveBeenCalled();
  });
});

function createRuntime(
  boss: ReturnType<typeof createBoss>,
  handlers: Parameters<typeof createNotificationWorkerRuntime>[1],
  validateSchema: () => Promise<void>,
  workerEnabled: boolean,
  cleanup: () => Promise<void>,
) {
  return createNotificationWorkerRuntime(
    boss as unknown as Parameters<typeof createNotificationWorkerRuntime>[0],
    handlers,
    validateSchema,
    workerEnabled,
    cleanup,
  );
}

function createVoidAsyncMock() {
  return vi.fn(async (): Promise<void> => undefined);
}

function createBoss() {
  const queues = new Map<string, Record<string, unknown>>();
  const handlers = new Map<string, (jobs: Array<{ data: unknown }>) => Promise<unknown>>();
  return {
    queues,
    handlers,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(null),
    createQueue: vi.fn(async (name: string, options: Record<string, unknown>) => {
      queues.set(name, { name, ...options });
    }),
    getQueue: vi.fn(async (name: string) => queues.get(name) ?? null),
    work: vi.fn(
      async (
        name: string,
        _options: Record<string, unknown>,
        handler: (jobs: Array<{ data: unknown }>) => Promise<unknown>,
      ) => {
        handlers.set(name, handler);
        return name;
      },
    ),
  };
}
