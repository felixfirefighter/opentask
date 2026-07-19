import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DataExportCard } from "./DataExportCard";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DataExportCard", () => {
  it("downloads the authorized attachment and reports its schema", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{"schemaVersion":1}', {
        headers: {
          "content-disposition": 'attachment; filename="opentask-export-2026-07-19.json"',
          "content-type": "application/json",
          "x-opentask-export-schema-version": "1",
        },
      }),
    );
    const createObjectUrl = vi.fn(() => "blob:private-export");
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", { ...URL, createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<DataExportCard online />);

    await user.click(screen.getByRole("button", { name: "Export my data" }));

    expect(await screen.findByText(/Downloaded opentask-export-2026-07-19\.json · schema v1/u)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/export", { method: "GET", cache: "no-store" });
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:private-export");
  });

  it("explains failure and disables export while offline", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<DataExportCard online />);

    await user.click(screen.getByRole("button", { name: "Export my data" }));
    expect(await screen.findByText(/No export file was downloaded/u)).toBeVisible();

    rerender(<DataExportCard online={false} />);
    expect(screen.getByRole("button", { name: "Export my data" })).toBeDisabled();
    expect(screen.getByText(/reconnect before requesting an export/u)).toBeVisible();
  });
});
