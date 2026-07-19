import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceRouteError } from "./WorkspaceRouteError";

describe("WorkspaceRouteError", () => {
  it("keeps private error details hidden and offers a retry", async () => {
    const onRetry = vi.fn();
    render(
      <WorkspaceRouteError
        error={Object.assign(new Error("private database detail"), { digest: "opaque-digest" })}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Your data was not changed");
    expect(screen.queryByText(/private database detail/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
