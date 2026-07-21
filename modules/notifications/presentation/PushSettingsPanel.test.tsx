import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { usePushSettingsController as PushControllerHook } from "./use-push-settings-controller";
import { PushSettingsPanel } from "./PushSettingsPanel";

type PushController = ReturnType<typeof PushControllerHook>;

const mocks = vi.hoisted(() => ({
  controller: null as unknown as PushController,
}));

vi.mock("./use-push-settings-controller", () => ({
  usePushSettingsController: () => mocks.controller,
}));

beforeEach(() => {
  mocks.controller = controller();
});

describe("PushSettingsPanel", () => {
  it("reports unconfigured provider state and never offers enrollment", () => {
    mocks.controller = controller({
      capability: capability({
        data: capabilityData({ provider: "unconfigured", vapidPublicKey: null }),
      }),
    });
    render(<PushSettingsPanel />);

    expect(screen.getByRole("status")).toHaveTextContent("Unavailable");
    expect(screen.getByText(/has not configured browser reminders/iu)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enable in this browser/iu })).toBeDisabled();
  });

  it("makes permission enrollment an explicit enabled action", async () => {
    const user = userEvent.setup();
    const enable = vi.fn(async () => undefined);
    mocks.controller = controller({ enable });
    render(<PushSettingsPanel />);

    expect(enable).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Not enabled");
    await user.click(screen.getByRole("button", { name: /enable in this browser/iu }));
    expect(enable).toHaveBeenCalledOnce();
  });

  it("reports configured-but-unverified worker state honestly", () => {
    mocks.controller = controller({
      capability: capability({ data: capabilityData({ worker: "configured_unverified" }) }),
    });
    render(<PushSettingsPanel />);

    expect(screen.getByText(/cannot verify that it is running/iu)).toBeInTheDocument();
    expect(screen.queryByText(/worker is running/iu)).not.toBeInTheDocument();
  });

  it("blocks enrollment when worker configuration is missing", () => {
    mocks.controller = controller({
      capability: capability({ data: capabilityData({ worker: "unconfigured" }) }),
    });
    render(<PushSettingsPanel />);

    expect(screen.getByRole("status")).toHaveTextContent("Worker unconfigured");
    expect(screen.getByRole("button", { name: /enable in this browser/iu })).toBeDisabled();
  });

  it("blocks enrollment after browser permission is denied", () => {
    mocks.controller = controller({
      browser: { support: "supported", permission: "denied", subscription: null },
    });
    render(<PushSettingsPanel />);

    expect(screen.getByRole("status")).toHaveTextContent("Permission blocked");
    expect(screen.getByRole("button", { name: /enable in this browser/iu })).toBeDisabled();
  });

  it("offers a safe retry when browser status inspection fails", async () => {
    const user = userEvent.setup();
    const refreshBrowser = vi.fn(async () => undefined);
    mocks.controller = controller({ browserCheckError: true, refreshBrowser });
    render(<PushSettingsPanel />);

    expect(screen.getByRole("status")).toHaveTextContent("Browser status unavailable");
    await user.click(screen.getByRole("button", { name: /retry browser status/iu }));
    expect(refreshBrowser).toHaveBeenCalledOnce();
  });

  it("offers revocation for the current browser subscription", async () => {
    const user = userEvent.setup();
    const disable = vi.fn(async () => undefined);
    mocks.controller = controller({
      browser: {
        support: "supported",
        permission: "granted",
        subscription: { endpoint: "https://push.invalid/subscription" } as PushSubscription,
      },
      enrollment: "enrolled",
      disable,
    });
    render(<PushSettingsPanel />);

    expect(screen.getByRole("status")).toHaveTextContent("Enabled");
    await user.click(screen.getByRole("button", { name: /turn off in this browser/iu }));
    expect(disable).toHaveBeenCalledOnce();
  });

  it("does not treat a local subscription as proof of account enrollment", async () => {
    const user = userEvent.setup();
    const enable = vi.fn(async () => undefined);
    mocks.controller = controller({
      browser: {
        support: "supported",
        permission: "granted",
        subscription: { endpoint: "https://push.invalid/subscription" } as PushSubscription,
      },
      enrollment: "unverified",
      enable,
    });
    render(<PushSettingsPanel />);

    expect(screen.getByRole("status")).toHaveTextContent("Verification needed");
    expect(screen.queryByText("This browser can receive your saved task reminders.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Verify this browser" }));
    expect(enable).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Turn off in this browser" })).toBeEnabled();
  });
});

function controller(overrides: Partial<PushController> = {}): PushController {
  return {
    browser: { support: "supported", permission: "default", subscription: null },
    browserCheckError: false,
    browserChecked: true,
    capability: capability(),
    enrollment: "unverified",
    message: "",
    online: true,
    pending: false,
    resetRequired: false,
    disable: vi.fn(async () => undefined),
    enable: vi.fn(async () => undefined),
    refreshBrowser: vi.fn(async () => undefined),
    ...overrides,
  } as PushController;
}

function capability(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    data: capabilityData(),
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as PushController["capability"];
}

function capabilityData(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    provider: "configured",
    storageEncryption: "configured",
    worker: "configured_unverified",
    vapidPublicKey: "test-public-key",
    ...overrides,
  } as NonNullable<PushController["capability"]["data"]>;
}
