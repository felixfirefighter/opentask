import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { markWorkspaceRoutesStale, WorkspaceRouteFreshness } from "./WorkspaceRouteFreshness";

const navigation = vi.hoisted(() => ({ pathname: "/today", refresh: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => navigation,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

afterEach(() => {
  navigation.pathname = "/today";
  navigation.search = "";
  window.history.replaceState({}, "", "/today");
  navigation.refresh.mockReset();
});

describe("WorkspaceRouteFreshness", () => {
  it("refreshes after a workspace mutation, normal route change, and browser history navigation", async () => {
    const view = render(<WorkspaceRouteFreshness />);

    markWorkspaceRoutesStale();
    expect(navigation.refresh).not.toHaveBeenCalled();

    navigation.pathname = "/calendar";
    window.history.replaceState({}, "", "/calendar");
    view.rerender(<WorkspaceRouteFreshness />);
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(1));

    navigation.pathname = "/upcoming";
    window.history.replaceState({}, "", "/upcoming");
    view.rerender(<WorkspaceRouteFreshness />);
    expect(navigation.refresh).toHaveBeenCalledTimes(1);

    markWorkspaceRoutesStale();
    act(() => {
      window.history.replaceState({}, "", "/today?from=history");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    expect(navigation.refresh).toHaveBeenCalledTimes(1);

    navigation.pathname = "/today";
    navigation.search = "from=history";
    view.rerender(<WorkspaceRouteFreshness />);
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(2));

    navigation.pathname = "/calendar";
    navigation.search = "";
    window.history.replaceState({}, "", "/calendar");
    view.rerender(<WorkspaceRouteFreshness />);
    expect(navigation.refresh).toHaveBeenCalledTimes(2);

    view.unmount();
    markWorkspaceRoutesStale();
    expect(navigation.refresh).toHaveBeenCalledTimes(2);

    navigation.pathname = "/today";
    window.history.replaceState({}, "", "/today");
    const remounted = render(<WorkspaceRouteFreshness />);
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(3));
    remounted.unmount();
  });
});
