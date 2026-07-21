import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthenticatedShell } from "./AuthenticatedShell";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/inbox",
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(),
}));

const identity = {
  actor: { userId: "user_01" },
  displayName: "Ada Lovelace",
  email: "ada@example.com",
} as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AuthenticatedShell", () => {
  it("renders only release destinations in a stable landmark order", () => {
    renderShell();

    const skip = screen.getByRole("link", { name: "Skip to main content" });
    const rail = screen.getByRole("navigation", { name: "Primary navigation" });
    const account = screen.getAllByRole("button", { name: /Open account actions/ })[0];
    const context = screen.getByRole("complementary", { name: "Inbox navigation" });
    const main = screen.getByRole("main");
    const topBar = document.querySelector("header");
    const mobile = screen.getByRole("navigation", { name: "Mobile navigation" });

    expect(skip).toHaveAttribute("href", "#main-content");
    expect(account).toBeDefined();
    expect(topBar).not.toBeNull();
    expect(precedes(skip, rail)).toBe(true);
    expect(precedes(rail, account!)).toBe(true);
    expect(precedes(account!, context)).toBe(true);
    expect(precedes(context, main)).toBe(true);
    expect(precedes(topBar!, main)).toBe(true);
    expect(precedes(main, mobile)).toBe(true);
    expect(screen.getAllByRole("link", { name: "Today" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Calendar" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Habits" })).toHaveAttribute("href", "/habits");
    expect(screen.getByRole("link", { name: "Focus" })).toHaveAttribute("href", "/focus");
    expect(screen.getAllByRole("link", { name: "Plan" })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /reminder/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/fixture/i)).not.toBeInTheDocument();
  });

  it("keeps Habits reachable and current through the mobile More menu", async () => {
    const user = userEvent.setup();
    renderShell("habits");

    const more = screen.getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-current", "page");
    await user.click(more);

    expect(screen.getByRole("menuitem", { name: "Habits" })).toHaveAttribute("href", "/habits");
    expect(screen.getByRole("menuitem", { name: "Habits" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps Focus reachable and current through the mobile More menu", async () => {
    const user = userEvent.setup();
    renderShell("focus");

    const more = screen.getByRole("button", { name: "More" });
    expect(more).toHaveAttribute("aria-current", "page");
    await user.click(more);

    expect(screen.getByRole("menuitem", { name: "Focus" })).toHaveAttribute("href", "/focus");
    expect(screen.getByRole("menuitem", { name: "Focus" })).toHaveAttribute("aria-current", "page");
  });

  it("never marks nullable More destinations as the current page", async () => {
    const user = userEvent.setup();
    renderShell();

    const more = screen.getByRole("button", { name: "More" });
    expect(more).not.toHaveAttribute("aria-current");
    await user.click(more);

    for (const name of ["Priority matrix", "Upcoming", "Completed / cancelled"]) {
      expect(screen.getByRole("menuitem", { name })).not.toHaveAttribute("aria-current");
    }
    expect(screen.queryByRole("menuitem", { current: "page" })).not.toBeInTheDocument();
  });

  it("supports keyboard navigation and focus return for account actions", async () => {
    const user = userEvent.setup();
    renderShell("settings");
    const trigger = screen.getAllByRole("button", { name: /Open account actions/ })[0]!;

    await user.click(trigger);
    const menu = screen.getByRole("menu", { name: "Account actions" });
    const settings = within(menu).getByRole("menuitem", { name: "Settings" });
    const signOut = within(menu).getByRole("menuitem", { name: "Sign out" });

    expect(settings).toHaveAttribute("aria-current", "page");
    expect(settings).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(signOut).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("menu", { name: "Account actions" })).not.toBeInTheDocument();
  });

  it("posts sign-out and keeps a recoverable error inside the account menu", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", fetchMock);
    renderShell();

    await user.click(screen.getAllByRole("button", { name: /Open account actions/ })[0]!);
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/auth/sign-out", {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Sign out failed");
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

function renderShell(currentDestination: "tasks" | "habits" | "focus" | "settings" = "tasks") {
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
