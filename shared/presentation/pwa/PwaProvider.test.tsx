import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ConnectivityStatus } from "../connectivity-store";
import type * as PwaCapabilityModule from "./pwa-capability";
import type { ServiceWorkerRegistrationObserver } from "./service-worker-registration";
import { PwaProvider, usePwaCapability } from "./PwaProvider";

const mocks = vi.hoisted(() => ({
  activate: vi.fn(),
  checkForUpdate: vi.fn(),
  cleanup: vi.fn(),
  confirmUnsaved: vi.fn(),
  connectivity: "online" as ConnectivityStatus,
  mode: "ready" as "error" | "ready",
  observe: vi.fn(),
  observer: undefined as ServiceWorkerRegistrationObserver | undefined,
  reloadPage: vi.fn(),
  repair: vi.fn(),
  standalone: false,
  supported: true,
}));

vi.mock("../unsaved-navigation", () => ({
  confirmUnsavedNavigation: mocks.confirmUnsaved,
}));

vi.mock("../useOnlineStatus", () => ({
  useConnectivityStatus: () => mocks.connectivity,
}));

vi.mock("./pwa-capability", async (importOriginal) => {
  const original = await importOriginal<typeof PwaCapabilityModule>();
  return {
    ...original,
    isStandaloneDisplay: () => mocks.standalone,
  };
});

vi.mock("./service-worker-registration", () => ({
  activateWaitingServiceWorker: mocks.activate,
  checkForServiceWorkerUpdate: mocks.checkForUpdate,
  currentOpenTaskBuildVersion: "current-build-version",
  observeOpenTaskServiceWorker: mocks.observe,
  reloadOpenTaskPage: mocks.reloadPage,
  repairStaticShell: mocks.repair,
  serviceWorkersSupported: () => mocks.supported,
}));

const waitingWorker = { postMessage: vi.fn() } as unknown as ServiceWorker;
const registration = {
  waiting: waitingWorker,
  update: vi.fn(async () => undefined),
} as unknown as ServiceWorkerRegistration;

beforeEach(() => {
  mocks.activate.mockReset().mockReturnValue(true);
  mocks.checkForUpdate.mockReset().mockResolvedValue(false);
  mocks.cleanup.mockReset();
  mocks.confirmUnsaved.mockReset().mockReturnValue(true);
  mocks.connectivity = "online";
  mocks.mode = "ready";
  mocks.observer = undefined;
  mocks.reloadPage.mockReset();
  mocks.repair.mockReset().mockResolvedValue(true);
  mocks.standalone = false;
  mocks.supported = true;
  mocks.observe.mockReset().mockImplementation(async (observer: ServiceWorkerRegistrationObserver) => {
    mocks.observer = observer;
    if (mocks.mode === "error") observer.onRegistrationError();
    else observer.onReady(registration);
    return mocks.cleanup;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PwaProvider", () => {
  it("publishes the browser-managed state after registration and repairs the static shell", async () => {
    renderProvider();

    await waitFor(() => expect(screen.getByTestId("registration-state")).toHaveTextContent("ready"));
    expect(screen.getByTestId("install-state")).toHaveTextContent("manual");
    expect(screen.getByText(/app shell is ready/u)).toBeInTheDocument();
    expect(mocks.repair).toHaveBeenCalledWith(registration);
  });

  it("reports unsupported and standalone-installed browsers without registering a worker", async () => {
    mocks.supported = false;
    const view = renderProvider();

    await waitFor(() => expect(screen.getByTestId("registration-state")).toHaveTextContent("unsupported"));
    expect(screen.getByTestId("install-state")).toHaveTextContent("manual");
    expect(mocks.observe).not.toHaveBeenCalled();

    view.unmount();
    mocks.standalone = true;
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("install-state")).toHaveTextContent("installed"));
    expect(screen.getByText(/running as an installed app/u)).toBeInTheDocument();
  });

  it.each([
    ["accepted", "installed", /was installed/iu],
    ["dismissed", "manual", /installation was dismissed/iu],
  ] as const)("handles an %s browser install choice", async (outcome, expectedState, message) => {
    const user = userEvent.setup();
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("registration-state")).toHaveTextContent("ready"));
    const prompt = vi.fn(async () => undefined);
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome, platform: "test" }),
    });

    act(() => window.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByTestId("install-state")).toHaveTextContent("available");

    await user.click(screen.getByRole("button", { name: "Install" }));
    await waitFor(() => expect(screen.getByTestId("install-state")).toHaveTextContent(expectedState));
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it("postpones an update for an unsaved draft, then activates it after confirmation", async () => {
    const user = userEvent.setup();
    mocks.confirmUnsaved.mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderProvider();
    await waitFor(() => expect(mocks.observer).toBeDefined());

    act(() => mocks.observer?.onUpdateAvailable(registration));
    expect(screen.getByTestId("update-state")).toHaveTextContent("available");

    await user.click(screen.getByRole("button", { name: "Apply update" }));
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(screen.getByText(/update postponed so your draft stays available/iu)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Apply update" }));
    expect(mocks.confirmUnsaved).toHaveBeenCalledTimes(2);
    expect(mocks.activate).toHaveBeenCalledWith(registration);
    expect(screen.getByTestId("update-state")).toHaveTextContent("applying");
  });

  it("asks a non-initiating tab to reload after another tab activates a newer build", async () => {
    const user = userEvent.setup();
    renderProvider();
    await waitFor(() => expect(mocks.observer).toBeDefined());

    act(() => mocks.observer?.onUpdateActivated("newer-build-version"));
    expect(screen.getByTestId("update-state")).toHaveTextContent("reload-required");
    expect(screen.getByText(/another opentask tab applied an update/iu)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Apply update" }));
    expect(mocks.confirmUnsaved).toHaveBeenCalledTimes(1);
    expect(mocks.reloadPage).toHaveBeenCalledTimes(1);
    expect(mocks.activate).not.toHaveBeenCalled();
  });

  it("keeps update activation unavailable while connectivity is degraded", async () => {
    mocks.connectivity = "network-unreachable";
    const user = userEvent.setup();
    renderProvider();
    await waitFor(() => expect(mocks.observer).toBeDefined());
    act(() => mocks.observer?.onUpdateAvailable(registration));

    await user.click(screen.getByRole("button", { name: "Apply update" }));
    expect(mocks.confirmUnsaved).not.toHaveBeenCalled();
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(screen.getByTestId("update-state")).toHaveTextContent("available");
  });

  it("retries a failed registration and replaces the capability error", async () => {
    const user = userEvent.setup();
    mocks.mode = "error";
    renderProvider();
    await waitFor(() => expect(screen.getByTestId("registration-state")).toHaveTextContent("error"));
    expect(screen.getByText(/app setup could not finish/iu)).toBeInTheDocument();

    mocks.mode = "ready";
    await user.click(screen.getByRole("button", { name: "Retry setup" }));
    await waitFor(() => expect(screen.getByTestId("registration-state")).toHaveTextContent("ready"));
    expect(mocks.observe).toHaveBeenCalledTimes(2);
    expect(mocks.cleanup).toHaveBeenCalledTimes(1);
  });
});

function renderProvider() {
  return render(
    <PwaProvider>
      <CapabilityProbe />
    </PwaProvider>,
  );
}

function CapabilityProbe() {
  const capability = usePwaCapability();
  return (
    <>
      <span data-testid="registration-state">{capability.registration}</span>
      <span data-testid="install-state">{capability.install}</span>
      <span data-testid="update-state">{capability.update}</span>
      <p>{capability.message}</p>
      <button type="button" onClick={() => void capability.installApp()}>
        Install
      </button>
      <button type="button" onClick={() => void capability.updateAndReload()}>
        Apply update
      </button>
      <button type="button" onClick={capability.retrySetup}>
        Retry setup
      </button>
    </>
  );
}
