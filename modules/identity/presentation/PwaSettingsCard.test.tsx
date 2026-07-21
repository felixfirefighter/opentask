import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PwaCapability } from "@/shared/presentation/pwa/pwa-capability";

import { PwaSettingsCard } from "./PwaSettingsCard";

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

describe("PwaSettingsCard", () => {
  it.each([
    [{ registration: "checking", install: "checking" }, "Checking"],
    [{ registration: "unsupported", install: "manual" }, "Browser only"],
    [{ registration: "ready", install: "manual" }, "App shell ready"],
    [{ registration: "ready", install: "installed" }, "Installed"],
    [{ registration: "ready", install: "available" }, "Ready to install"],
    [{ registration: "ready", install: "installing" }, "Ready to install"],
    [{ registration: "ready", update: "available" }, "Update ready"],
    [{ registration: "ready", update: "reload-required" }, "Update ready"],
    [{ registration: "ready", update: "applying" }, "Updating"],
    [{ registration: "error", install: "manual" }, "Setup issue"],
  ] as const)("renders the %s capability as %s", (overrides, label) => {
    mocks.capability = capability(overrides);
    render(<PwaSettingsCard />);
    expect(screen.getByRole("status")).toHaveTextContent(label);
  });

  it("explains the deliberately limited offline boundary without implying task storage", () => {
    render(<PwaSettingsCard />);

    const card = screen.getByRole("heading", { name: "App" }).closest("section");
    expect(card).not.toBeNull();
    expect(card).toHaveTextContent("It does not store your tasks for offline editing");
    expect(card).toHaveTextContent("Already loaded pages stay visible and read-only");
    expect(card).toHaveTextContent("content-free fallback with no account or task data");
    expect(screen.queryByText(/reminder/iu)).not.toBeInTheDocument();
  });

  it.each([
    ["unsupported", "does not support the installable app shell"],
    ["error", "app shell did not finish setup"],
  ] as const)("does not promise an offline shell when registration is %s", (registration, message) => {
    mocks.capability = capability({ registration });
    render(<PwaSettingsCard />);

    expect(screen.getByText(new RegExp(message, "iu"))).toBeInTheDocument();
    expect(screen.queryByText(/cold offline open/iu)).not.toBeInTheDocument();
    expect(screen.queryByText(/already loaded pages/iu)).not.toBeInTheDocument();
  });

  it("invokes the browser install prompt once and blocks duplicate activation", async () => {
    const user = userEvent.setup();
    const installApp = vi.fn(async () => undefined);
    mocks.capability = capability({ install: "available", installApp });
    const view = render(<PwaSettingsCard />);

    await user.click(screen.getByRole("button", { name: "Install OpenTask" }));
    expect(installApp).toHaveBeenCalledTimes(1);

    mocks.capability = capability({ install: "installing", installApp });
    view.rerender(<PwaSettingsCard />);
    expect(screen.getByRole("button", { name: "Opening browser prompt…" })).toBeDisabled();
  });

  it("gives an available update precedence over installation", async () => {
    const user = userEvent.setup();
    const installApp = vi.fn(async () => undefined);
    const updateAndReload = vi.fn(async () => undefined);
    mocks.capability = capability({
      install: "available",
      update: "available",
      installApp,
      updateAndReload,
    });
    render(<PwaSettingsCard />);

    expect(screen.queryByRole("button", { name: "Install OpenTask" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Update and reload" }));
    expect(updateAndReload).toHaveBeenCalledTimes(1);
    expect(installApp).not.toHaveBeenCalled();
  });

  it("keeps install and update actions visible but disabled with an offline explanation", () => {
    mocks.online = false;
    mocks.capability = capability({ install: "available" });
    const view = render(<PwaSettingsCard />);

    expect(screen.getByText("Reconnect before installing or applying an update.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Install OpenTask" })).toBeDisabled();

    mocks.capability = capability({ update: "available" });
    view.rerender(<PwaSettingsCard />);
    expect(screen.getByRole("button", { name: "Update and reload" })).toBeDisabled();
  });

  it("offers retry only for setup failure and disables it offline", async () => {
    const user = userEvent.setup();
    const retrySetup = vi.fn();
    mocks.capability = capability({ registration: "error", retrySetup });
    const view = render(<PwaSettingsCard />);

    await user.click(screen.getByRole("button", { name: "Retry setup" }));
    expect(retrySetup).toHaveBeenCalledTimes(1);

    mocks.online = false;
    view.rerender(<PwaSettingsCard />);
    expect(screen.getByRole("button", { name: "Retry setup" })).toBeDisabled();
  });
});

function capability(overrides: Partial<PwaCapability> = {}): PwaCapability {
  return {
    registration: "ready",
    install: "manual",
    update: "current",
    message: "The app shell is ready. Install from your browser when that option is offered.",
    installApp: async () => undefined,
    updateAndReload: async () => undefined,
    retrySetup: () => undefined,
    ...overrides,
  };
}
