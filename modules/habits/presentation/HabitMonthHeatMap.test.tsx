import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { habitMonth } from "./habit-presentation-test-support";
import { HabitMonthHeatMap } from "./HabitMonthHeatMap";

describe("HabitMonthHeatMap", () => {
  it("renders a semantic month table with full date and value status text", () => {
    render(<HabitMonthHeatMap month={habitMonth()} title="Morning walk" unit={null} />);

    const table = screen.getByRole("table", { name: "July 2026 history for Morning walk" });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(7);
    expect(within(table).getByText("Monday, July 20, 2026: Completed")).toBeInTheDocument();
    expect(within(table).getAllByRole("cell")).toHaveLength(31);
  });
});
