import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPushCapability: vi.fn(),
  getReleaseApplications: vi.fn(),
  getTaskReminder: vi.fn(),
  registerPushSubscription: vi.fn(),
  removeTaskReminder: vi.fn(),
  resolveActor: vi.fn(),
  revokePushSubscription: vi.fn(),
  setTaskReminder: vi.fn(),
}));

vi.mock("@/modules/identity", () => ({
  getIdentityRequestSecurity: () => ({ trustedOrigin: "http://localhost:3000" }),
  resolveActor: mocks.resolveActor,
}));

vi.mock("@/server/release-applications", () => ({
  getReleaseApplications: mocks.getReleaseApplications,
}));

import { GET as getCapability } from "./capability/route";
import { POST as registerSubscription } from "./subscriptions/route";
import { POST as revokeSubscription } from "./subscriptions/revoke/route";
import {
  DELETE as removeReminder,
  GET as getReminder,
  PUT as setReminder,
} from "../tasks/[taskId]/reminder/route";

const actor = { userId: "10000000-0000-4000-8000-000000000001" };
const taskId = "20000000-0000-4000-8000-000000000001";
const reminderId = "30000000-0000-4000-8000-000000000001";
const subscriptionId = "40000000-0000-4000-8000-000000000001";
const endpoint = "https://push.example.test/subscriptions/private-value";
const reminder = {
  id: reminderId,
  taskId,
  enabled: true,
  version: 1,
  spec: { kind: "relative_start" as const, remindAt: null, offsetMinutes: 15 },
  createdAt: "2026-07-21T00:00:00.000Z",
  updatedAt: "2026-07-21T00:00:00.000Z",
};

function reminderContext(value = taskId) {
  return { params: Promise.resolve({ taskId: value }) };
}

function mutationRequest(path: string, method: "DELETE" | "POST" | "PUT", body: unknown) {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(body),
  });
}

describe("notification API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveActor.mockResolvedValue(actor);
    mocks.getReleaseApplications.mockReturnValue({
      notifications: {
        getPushCapability: mocks.getPushCapability,
        getTaskReminder: mocks.getTaskReminder,
        registerPushSubscription: mocks.registerPushSubscription,
        removeTaskReminder: mocks.removeTaskReminder,
        revokePushSubscription: mocks.revokePushSubscription,
        setTaskReminder: mocks.setTaskReminder,
      },
    });
    mocks.getPushCapability.mockResolvedValue({
      provider: "unconfigured",
      storageEncryption: "unconfigured",
      worker: "known_disabled",
      vapidPublicKey: null,
    });
    mocks.getTaskReminder.mockResolvedValue(reminder);
    mocks.setTaskReminder.mockResolvedValue(reminder);
    mocks.removeTaskReminder.mockResolvedValue(reminder);
    mocks.registerPushSubscription.mockResolvedValue({
      status: "subscribed",
      subscriptionId,
    });
    mocks.revokePushSubscription.mockResolvedValue({ status: "revoked" });
  });

  it("reads capability and the actor-owned task reminder with private responses", async () => {
    const capability = await getCapability(
      new Request("http://localhost:3000/api/v1/notifications/capability"),
    );
    expect(capability.status).toBe(200);
    expect(capability.headers.get("cache-control")).toBe("no-store");
    expect(mocks.getPushCapability).toHaveBeenCalledWith(actor);

    const response = await getReminder(
      new Request(`http://localhost:3000/api/v1/tasks/${taskId}/reminder`),
      reminderContext(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(reminder);
    expect(mocks.getTaskReminder).toHaveBeenCalledWith(actor, taskId);
  });

  it("sets and removes one reminder without accepting ownership from the client", async () => {
    const setInput = {
      id: reminderId,
      expectedVersion: null,
      enabled: true,
      spec: { kind: "relative_start", offsetMinutes: 15 },
    };
    const setResponse = await setReminder(
      mutationRequest(`/api/v1/tasks/${taskId}/reminder`, "PUT", setInput),
      reminderContext(),
    );
    expect(setResponse.status).toBe(200);
    expect(mocks.setTaskReminder).toHaveBeenCalledWith(actor, {
      ...setInput,
      spec: { ...setInput.spec, remindAt: null },
      taskId,
    });

    const removeResponse = await removeReminder(
      mutationRequest(`/api/v1/tasks/${taskId}/reminder`, "DELETE", { expectedVersion: 1 }),
      reminderContext(),
    );
    expect(removeResponse.status).toBe(200);
    await expect(removeResponse.json()).resolves.toEqual({ removed: true });
    expect(mocks.removeTaskReminder).toHaveBeenCalledWith(actor, { taskId, expectedVersion: 1 });
  });

  it("registers and revokes only the submitted browser subscription", async () => {
    const registration = {
      id: subscriptionId,
      endpoint,
      keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) },
      deviceLabel: "Laptop browser",
    };
    const registerResponse = await registerSubscription(
      mutationRequest("/api/v1/notifications/subscriptions", "POST", registration),
    );
    expect(registerResponse.status).toBe(200);
    expect(mocks.registerPushSubscription).toHaveBeenCalledWith(actor, registration);

    const revokeResponse = await revokeSubscription(
      mutationRequest("/api/v1/notifications/subscriptions/revoke", "POST", { endpoint }),
    );
    expect(revokeResponse.status).toBe(200);
    await expect(revokeResponse.json()).resolves.toEqual({ status: "revoked" });
    expect(mocks.revokePushSubscription).toHaveBeenCalledWith(actor, { endpoint });
  });

  it("rejects untrusted, malformed, queried, and unauthenticated requests", async () => {
    const crossSite = mutationRequest(`/api/v1/tasks/${taskId}/reminder`, "PUT", {
      id: reminderId,
      expectedVersion: null,
      enabled: true,
      spec: { kind: "relative_start", offsetMinutes: 15 },
    });
    crossSite.headers.set("origin", "https://attacker.invalid");
    expect((await setReminder(crossSite, reminderContext())).status).toBe(403);

    const claimedOwner = mutationRequest(`/api/v1/tasks/${taskId}/reminder`, "PUT", {
      id: reminderId,
      userId: actor.userId,
      expectedVersion: null,
      enabled: true,
      spec: { kind: "relative_start", offsetMinutes: 15 },
    });
    expect((await setReminder(claimedOwner, reminderContext())).status).toBe(400);

    expect(
      (
        await getReminder(
          new Request(`http://localhost:3000/api/v1/tasks/${taskId}/reminder?private=1`),
          reminderContext(),
        )
      ).status,
    ).toBe(400);

    mocks.resolveActor.mockRejectedValueOnce(
      Object.assign(new Error("Private authentication failure."), { code: "UNAUTHENTICATED" }),
    );
    const unauthenticated = await getCapability(
      new Request("http://localhost:3000/api/v1/notifications/capability"),
    );
    expect(unauthenticated.status).toBe(401);
    expect(await unauthenticated.text()).not.toContain("Private authentication failure");
    expect(mocks.setTaskReminder).not.toHaveBeenCalled();
  });
});
