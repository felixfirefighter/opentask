import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TaskReminderDeliveryStatus } from "./TaskReminderDeliveryStatus";

const mocks = vi.hoisted(() => ({
  capability: {} as Record<string, unknown>,
  browser: {} as Record<string, unknown>,
  enrollment: "enrolled" as "enrolled" | "reset_required" | "unverified",
}));

vi.mock("./data/use-notification-queries", () => ({
  usePushCapabilityQuery: () => mocks.capability,
}));

vi.mock("./use-browser-push-status", () => ({
  useBrowserPushStatus: () => mocks.browser,
}));
vi.mock("./data/use-browser-push-enrollment", () => ({
  useBrowserPushEnrollment: () => mocks.enrollment,
}));

beforeEach(() => {
  mocks.capability = capability();
  mocks.browser = browser();
  mocks.enrollment = "enrolled";
});

describe("TaskReminderDeliveryStatus", () => {
  it("states that configured worker liveness is not verified", () => {
    render(<TaskReminderDeliveryStatus online />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "This browser is enrolled. Worker configuration is present, but runtime liveness is not verified.",
    );
  });

  it.each([
    [
      { provider: "unconfigured" },
      "This server cannot deliver browser reminders yet. The saved reminder remains available.",
    ],
    [{ worker: "known_disabled" }, "The reminder worker is off. The saved reminder remains available."],
    [
      { worker: "unconfigured" },
      "The reminder worker is not configured. The saved reminder remains available.",
    ],
  ] as const)("renders an honest server degraded state", (overrides, message) => {
    mocks.capability = capability({ data: capabilityData(overrides) });
    render(<TaskReminderDeliveryStatus online />);

    expect(screen.getByRole("status")).toHaveTextContent(message);
  });

  it("distinguishes unsupported, denied, and unenrolled browsers", () => {
    mocks.browser = browser({
      snapshot: { support: "unsupported", permission: "unsupported", subscription: null },
    });
    const view = render(<TaskReminderDeliveryStatus online />);
    expect(screen.getByRole("status")).toHaveTextContent("cannot receive Web Push");

    mocks.browser = browser({
      snapshot: { support: "supported", permission: "denied", subscription: null },
    });
    view.rerender(<TaskReminderDeliveryStatus online />);
    expect(screen.getByRole("status")).toHaveTextContent("permission is blocked");
    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings");

    mocks.browser = browser({
      snapshot: { support: "supported", permission: "default", subscription: null },
    });
    view.rerender(<TaskReminderDeliveryStatus online />);
    expect(screen.getByRole("status")).toHaveTextContent("not enrolled for delivery");
  });

  it("keeps saved-state language honest while offline or status checks fail", () => {
    const view = render(<TaskReminderDeliveryStatus online={false} />);
    expect(screen.getByRole("status")).toHaveTextContent("saved reminder is unchanged");

    mocks.capability = capability({ isError: true, data: undefined });
    view.rerender(<TaskReminderDeliveryStatus online />);
    expect(screen.getByRole("status")).toHaveTextContent("Delivery status is unavailable");
    expect(screen.getByRole("link", { name: "Open Settings" })).toBeInTheDocument();
  });

  it("does not infer account enrollment from a local browser subscription", () => {
    mocks.enrollment = "unverified";
    render(<TaskReminderDeliveryStatus online />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "local subscription, but its association with this account is not verified",
    );
    expect(screen.getByRole("link", { name: "Open Settings" })).toHaveAttribute("href", "/settings");
  });
});

function capability(overrides: Record<string, unknown> = {}) {
  return { data: capabilityData(), isPending: false, isError: false, ...overrides };
}

function capabilityData(overrides: Record<string, unknown> = {}) {
  return {
    provider: "configured",
    storageEncryption: "configured",
    worker: "configured_unverified",
    vapidPublicKey: "test-public-key",
    ...overrides,
  };
}

function browser(overrides: Record<string, unknown> = {}) {
  return {
    snapshot: {
      support: "supported",
      permission: "granted",
      subscription: { endpoint: "https://push.invalid/subscription" } as PushSubscription,
    },
    checked: true,
    error: false,
    ...overrides,
  };
}
