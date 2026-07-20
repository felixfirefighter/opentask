import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { markWorkspaceRoutesStale, WorkspaceRouteFreshness } from "./WorkspaceRouteFreshness";

const navigation = vi.hoisted(() => ({ pathname: "/today", refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => navigation,
}));

afterEach(() => {
  navigation.pathname = "/today";
  navigation.refresh.mockReset();
});

describe("WorkspaceRouteFreshness", () => {
  it("refreshes after a workspace mutation, normal route change, and browser history navigation", async () => {
    const view = render(<WorkspaceRouteFreshness />);

    markWorkspaceRoutesStale();
    expect(navigation.refresh).not.toHaveBeenCalled();

    navigation.pathname = "/calendar";
    view.rerender(<WorkspaceRouteFreshness />);
    expect(navigation.refresh).toHaveBeenCalledTimes(1);

    navigation.pathname = "/upcoming";
    view.rerender(<WorkspaceRouteFreshness />);
    expect(navigation.refresh).toHaveBeenCalledTimes(1);

    markWorkspaceRoutesStale();
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(2));

    navigation.pathname = "/today";
    view.rerender(<WorkspaceRouteFreshness />);
    expect(navigation.refresh).toHaveBeenCalledTimes(2);

    view.unmount();
    markWorkspaceRoutesStale();
    expect(navigation.refresh).toHaveBeenCalledTimes(2);

    const remounted = render(<WorkspaceRouteFreshness />);
    expect(navigation.refresh).toHaveBeenCalledTimes(3);
    remounted.unmount();
  });
});
