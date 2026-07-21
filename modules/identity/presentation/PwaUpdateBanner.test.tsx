import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PwaCapability } from "@/shared/presentation/pwa/pwa-capability";

import { PwaUpdateBanner } from "./PwaUpdateBanner";

const mocks = vi.hoisted(() => ({
  capability: undefined as unknown as PwaCapability,
  online: true,
}));

vi.mock("@/shared/presentation", () => ({
  useOnlineStatus: () => mocks.online,
  usePwaCapability: () => mocks.capability,
}));

beforeEach(() => {
  mocks.online = true;
  mocks.capability = capability();
});

describe("PwaUpdateBanner", () => {
  it("renders nothing while the current worker owns the page", () => {
    render(<PwaUpdateBanner />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it.each(["available", "reload-required"] as const)(
    "offers the persistent update action for the %s state while online",
    async (update) => {
      const user = userEvent.setup();
      const updateAndReload = vi.fn(async () => undefined);
      mocks.capability = capability({ update, updateAndReload });
      render(<PwaUpdateBanner />);

      expect(screen.getByRole("status")).toHaveTextContent("An OpenTask update is ready");
      await user.click(screen.getByRole("button", { name: "Update and reload" }));
      expect(updateAndReload).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps the update visible but blocks activation while offline", async () => {
    const user = userEvent.setup();
    const updateAndReload = vi.fn(async () => undefined);
    mocks.online = false;
    mocks.capability = capability({ update: "available", updateAndReload });
    render(<PwaUpdateBanner />);

    expect(screen.getByRole("status")).toHaveTextContent("after you reconnect");
    const update = screen.getByRole("button", { name: "Update and reload" });
    expect(update).toBeDisabled();
    await user.click(update);
    expect(updateAndReload).not.toHaveBeenCalled();
  });

  it("announces activation without leaving a duplicate action", () => {
    mocks.capability = capability({ update: "applying" });
    render(<PwaUpdateBanner />);

    expect(screen.getByRole("status")).toHaveTextContent("Updating OpenTask");
    expect(screen.queryByRole("button", { name: "Update and reload" })).not.toBeInTheDocument();
  });
});

function capability(overrides: Partial<PwaCapability> = {}): PwaCapability {
  return {
    registration: "ready",
    install: "manual",
    update: "current",
    message: "The app shell is ready.",
    installApp: async () => undefined,
    updateAndReload: async () => undefined,
    retrySetup: () => undefined,
    ...overrides,
  };
}
