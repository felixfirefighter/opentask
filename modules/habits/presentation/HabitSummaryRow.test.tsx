import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { habitOverview } from "./habit-presentation-test-support";
import { HabitSummaryRow } from "./HabitSummaryRow";

vi.mock("next/link", () => ({
  default: ({
    children,
    prefetch,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & Readonly<{ children: ReactNode; prefetch?: boolean }>) => (
    <a data-prefetch={String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));

describe("HabitSummaryRow", () => {
  it("does not eagerly fetch every habit detail from the workspace list", () => {
    render(<HabitSummaryRow overview={habitOverview()} />);

    expect(screen.getByRole("link", { name: "Open Morning walk" })).toHaveAttribute("data-prefetch", "false");
  });
});
