import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAISettingsCard } from "./OpenAISettingsCard";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAISettingsCard", () => {
  it("saves a personal key and only renders the redacted server response", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ configured: true, source: "account" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<OpenAISettingsCard initialSettings={{ configured: false, source: "none" }} online />);

    await user.type(screen.getByLabelText("API key"), "sk-test-secret-value");
    await user.click(screen.getByRole("button", { name: "Save API key" }));

    expect(await screen.findByText(/Personal key saved/u)).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toHaveValue("");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/assistant/settings",
      expect.objectContaining({ body: JSON.stringify({ apiKey: "sk-test-secret-value" }) }),
    );
    expect(screen.queryByText("sk-test-secret-value")).not.toBeInTheDocument();
  });

  it("removes an existing personal key", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ configured: false, source: "none" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<OpenAISettingsCard initialSettings={{ configured: true, source: "account" }} online />);

    await user.click(screen.getByRole("button", { name: "Remove personal key" }));

    await screen.findByText("No OpenAI key configured.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/assistant/settings",
      expect.objectContaining({ body: JSON.stringify({ apiKey: null }) }),
    );
  });
});
