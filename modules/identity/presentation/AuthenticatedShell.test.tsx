import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthenticatedShell } from "./AuthenticatedShell";

vi.mock("next/navigation", () => ({ usePathname: () => "/inbox" }));

const identity = {
  actor: { userId: "user_01" },
  displayName: "Ada Lovelace",
  email: "ada@example.com",
} as const;

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AuthenticatedShell", () => {
  it("renders only release destinations in a stable landmark order", () => {
    renderShell();

    const skip = screen.getByRole("link", { name: "Skip to main content" });
    const rail = screen.getByRole("navigation", { name: "Primary navigation" });
    const profile = screen.getAllByRole("button", { name: /Open profile actions/ })[0];
    const context = screen.getByRole("complementary", { name: "Inbox navigation" });
    const main = screen.getByRole("main");
    const topBar = document.querySelector("header");
    const mobile = screen.getByRole("navigation", { name: "Mobile navigation" });

    expect(skip).toHaveAttribute("href", "#main-content");
    expect(profile).toBeDefined();
    expect(topBar).not.toBeNull();
    expect(precedes(skip, rail)).toBe(true);
    expect(precedes(rail, profile!)).toBe(true);
    expect(precedes(profile!, context)).toBe(true);
    expect(precedes(context, main)).toBe(true);
    expect(precedes(topBar!, main)).toBe(true);
    expect(precedes(main, mobile)).toBe(true);
    expect(screen.getAllByRole("link", { name: "Today" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Calendar" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Plan" })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /habit|focus|reminder/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/fixture/i)).not.toBeInTheDocument();
  });

  it("supports keyboard navigation and focus return for profile actions", async () => {
    const user = userEvent.setup();
    renderShell("settings");
    const trigger = screen.getAllByRole("button", { name: /Open profile actions/ })[0]!;

    await user.click(trigger);
    const menu = screen.getByRole("menu", { name: "Profile actions" });
    const settings = within(menu).getByRole("menuitem", { name: "Settings" });

    expect(settings).toHaveAttribute("aria-current", "page");
    expect(settings).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("menu", { name: "Profile actions" })).not.toBeInTheDocument();
  });

  it("announces offline state and removes the banner after reconnection", async () => {
    let online = true;
    vi.spyOn(window.navigator, "onLine", "get").mockImplementation(() => online);
    renderShell();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    online = false;
    act(() => window.dispatchEvent(new Event("offline")));
    expect(await screen.findByRole("status")).toHaveTextContent("Writes are disabled");

    online = true;
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
  });

  it("moves focus to the route heading after navigation content mounts", async () => {
    renderShell();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Release workspace" })).toHaveFocus());
  });
});

function renderShell(currentDestination: "tasks" | "settings" = "tasks") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthenticatedShell
        identity={identity}
        theme="light"
        reducedMotion={false}
        currentDestination={currentDestination}
        destinationTitle={currentDestination === "tasks" ? "Inbox" : undefined}
      >
        <h1 tabIndex={-1} data-route-focus>
          Release workspace
        </h1>
      </AuthenticatedShell>
    </QueryClientProvider>,
  );
}

function precedes(first: Node, second: Node) {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}
