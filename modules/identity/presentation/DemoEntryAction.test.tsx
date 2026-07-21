import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DemoEntryAction } from "./DemoEntryAction";

describe("DemoEntryAction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses a non-simple JSON mutation request and blocks duplicate entry", async () => {
    const fetchRequest = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchRequest);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    const user = userEvent.setup();

    render(<DemoEntryAction />);
    const action = screen.getByRole("button", { name: "Try demo" });
    await user.click(action);

    expect(fetchRequest).toHaveBeenCalledOnce();
    expect(fetchRequest).toHaveBeenCalledWith("/api/v1/demo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(screen.getByRole("button", { name: "Preparing demo…" })).toBeDisabled();
    expect(screen.getByText("Preparing an isolated demo workspace…")).toBeInTheDocument();
  });

  it("disables entry while offline without attempting a write", () => {
    const fetchRequest = vi.fn();
    vi.stubGlobal("fetch", fetchRequest);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });

    render(<DemoEntryAction />);

    expect(screen.getByRole("button", { name: "Try demo" })).toBeDisabled();
    expect(screen.getByText("A connection is required to create an isolated demo.")).toBeInTheDocument();
    expect(fetchRequest).not.toHaveBeenCalled();
  });

  it("keeps the visitor on the entry surface with a safe retry after failure", async () => {
    const fetchRequest = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchRequest);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    const user = userEvent.setup();

    render(<DemoEntryAction />);
    await user.click(screen.getByRole("button", { name: "Try demo" }));

    expect(
      await screen.findByText("No demo workspace was opened. Try again or create your own account."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try demo" })).toBeEnabled();
  });

  it("distinguishes an unreachable server and verifies recovery before enabling demo entry", async () => {
    const fetchRequest = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network unreachable"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchRequest);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    const user = userEvent.setup();

    render(<DemoEntryAction />);
    await user.click(screen.getByRole("button", { name: "Try demo" }));

    const retry = await screen.findByRole("button", { name: "Try connection" });
    expect(screen.getByText(/can’t reach the server/iu)).toBeInTheDocument();
    await user.click(retry);

    expect(await screen.findByRole("button", { name: "Try demo" })).toBeEnabled();
    expect(fetchRequest).toHaveBeenNthCalledWith(2, "/api/health/live", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal: expect.any(AbortSignal),
    });
  });
});
