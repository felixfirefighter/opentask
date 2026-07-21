import { afterEach, describe, expect, it, vi } from "vitest";

import {
  activateWaitingServiceWorker,
  checkForServiceWorkerUpdate,
  currentOpenTaskBuildVersion,
  observeOpenTaskServiceWorker,
  repairStaticShell,
  serviceWorkersSupported,
  type ServiceWorkerRegistrationObserver,
} from "./service-worker-registration";

const originalServiceWorker = Object.getOwnPropertyDescriptor(window.navigator, "serviceWorker");

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalServiceWorker) {
    Object.defineProperty(window.navigator, "serviceWorker", originalServiceWorker);
  } else {
    Reflect.deleteProperty(window.navigator, "serviceWorker");
  }
});

describe("service-worker registration adapter", () => {
  it("returns a no-op observer when service workers are unsupported", async () => {
    Reflect.deleteProperty(window.navigator, "serviceWorker");
    const observer = createObserver();

    expect(serviceWorkersSupported()).toBe(false);
    const cleanup = await observeOpenTaskServiceWorker(observer);
    cleanup();
    expect(observer.onReady).not.toHaveBeenCalled();
    expect(observer.onRegistrationError).not.toHaveBeenCalled();
  });

  it("registers at the root scope and exposes an already waiting update", async () => {
    const waiting = new FakeWorker("installed");
    const registration = new FakeRegistration();
    registration.waiting = waiting;
    const container = new FakeContainer(registration);
    container.controller = new FakeWorker("activated");
    installContainer(container);
    const calls = { activated: 0, controller: 0, error: 0, ready: 0, update: 0 };
    const observer: ServiceWorkerRegistrationObserver = {
      onControllerChange: () => {
        calls.controller += 1;
      },
      onReady: () => {
        calls.ready += 1;
      },
      onRegistrationError: () => {
        calls.error += 1;
      },
      onUpdateActivated: () => {
        calls.activated += 1;
      },
      onUpdateAvailable: () => {
        calls.update += 1;
      },
    };

    const cleanup = await observeOpenTaskServiceWorker(observer);

    expect(container.register).toHaveBeenCalledWith(
      `/sw.js?build=${encodeURIComponent(currentOpenTaskBuildVersion)}`,
      {
        scope: "/",
        updateViaCache: "none",
      },
    );
    await vi.waitFor(() => expect(calls.ready).toBe(1));
    expect(calls.error).toBe(0);
    expect(calls.update).toBeGreaterThanOrEqual(1);

    container.dispatchEvent(new Event("controllerchange"));
    expect(calls.controller).toBe(1);
    container.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "OPENTASK_UPDATE_ACTIVATED", version: "1784615000000-a1b2c3d4" },
      }),
    );
    expect(calls.activated).toBe(1);
    cleanup();
    container.dispatchEvent(new Event("controllerchange"));
    expect(calls.controller).toBe(1);
    container.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "OPENTASK_UPDATE_ACTIVATED", version: "1784615000001-a1b2c3d4" },
      }),
    );
    expect(calls.activated).toBe(1);
  });

  it("observes an installing worker and reports the update only after it is waiting", async () => {
    const installing = new FakeWorker("installing");
    const registration = new FakeRegistration();
    registration.installing = installing;
    const container = new FakeContainer(registration);
    container.controller = new FakeWorker("activated");
    installContainer(container);
    const observer = createObserver();

    const cleanup = await observeOpenTaskServiceWorker(observer);
    expect(observer.onUpdateAvailable).not.toHaveBeenCalled();

    registration.waiting = installing;
    installing.transitionTo("installed");
    expect(observer.onUpdateAvailable).toHaveBeenCalledWith(registration);
    cleanup();

    installing.transitionTo("activated");
    expect(observer.onUpdateAvailable).toHaveBeenCalledTimes(1);
  });

  it("reports registration failure without leaving a controller-change listener", async () => {
    const container = new FakeContainer(new FakeRegistration());
    container.register.mockRejectedValueOnce(new Error("registration failed"));
    installContainer(container);
    const observer = createObserver();

    const cleanup = await observeOpenTaskServiceWorker(observer);
    expect(observer.onRegistrationError).toHaveBeenCalledTimes(1);
    container.dispatchEvent(new Event("controllerchange"));
    expect(observer.onControllerChange).not.toHaveBeenCalled();
    cleanup();
  });

  it("checks for and activates only a waiting worker", async () => {
    const registration = new FakeRegistration();
    expect(await checkForServiceWorkerUpdate(asRegistration(registration))).toBe(false);
    expect(registration.update).toHaveBeenCalledTimes(1);
    expect(activateWaitingServiceWorker(asRegistration(registration))).toBe(false);

    const waiting = new FakeWorker("installed");
    registration.waiting = waiting;
    expect(await checkForServiceWorkerUpdate(asRegistration(registration))).toBe(true);
    expect(activateWaitingServiceWorker(asRegistration(registration))).toBe(true);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("repairs the static shell through the active worker without sending user data", async () => {
    let channel: FakeMessageChannel | undefined;
    const captureChannel = (nextChannel: FakeMessageChannel) => {
      channel = nextChannel;
    };
    class InstalledMessageChannel extends FakeMessageChannel {
      constructor() {
        super();
        captureChannel(this);
      }
    }
    vi.stubGlobal("MessageChannel", InstalledMessageChannel);
    const active = new FakeWorker("activated");
    const registration = new FakeRegistration();
    registration.active = active;

    const repair = repairStaticShell(asRegistration(registration));
    expect(active.postMessage).toHaveBeenCalledWith({ type: "REPAIR_STATIC_SHELL" }, [channel?.port2]);
    channel?.respond({ ok: true });
    await expect(repair).resolves.toBe(true);
  });
});

class FakeWorker extends EventTarget {
  state: ServiceWorkerState;
  readonly postMessage = vi.fn();

  constructor(state: ServiceWorkerState) {
    super();
    this.state = state;
  }

  transitionTo(state: ServiceWorkerState) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

class FakeRegistration extends EventTarget {
  active: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  readonly update = vi.fn(async () => undefined);
}

class FakeContainer extends EventTarget {
  controller: FakeWorker | null = null;
  readonly ready: Promise<ServiceWorkerRegistration>;
  readonly register: ReturnType<typeof vi.fn>;

  constructor(registration: FakeRegistration) {
    super();
    const typedRegistration = asRegistration(registration);
    this.ready = Promise.resolve(typedRegistration);
    this.register = vi.fn(async () => typedRegistration);
  }
}

class FakeMessageChannel {
  readonly port1 = {
    onmessage: null as ((event: MessageEvent<unknown>) => void) | null,
  };
  readonly port2 = {};

  respond(data: unknown) {
    this.port1.onmessage?.({ data } as MessageEvent<unknown>);
  }
}

function createObserver() {
  return {
    onControllerChange: vi.fn(),
    onReady: vi.fn(),
    onRegistrationError: vi.fn(),
    onUpdateActivated: vi.fn(),
    onUpdateAvailable: vi.fn(),
  } satisfies ServiceWorkerRegistrationObserver;
}

function installContainer(container: FakeContainer) {
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: container as unknown as ServiceWorkerContainer,
  });
}

function asRegistration(registration: FakeRegistration) {
  return registration as unknown as ServiceWorkerRegistration;
}
