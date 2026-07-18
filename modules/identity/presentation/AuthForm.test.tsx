import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthForm } from "./AuthForm";
import { AuthScreen } from "./AuthScreen";
import { resolveSafeReturnTo } from "./auth-form-contract";

afterEach(() => {
  setOnline(true);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AuthScreen", () => {
  it("renders the approved sign-up fields, guidance, and alternate entry paths", async () => {
    render(<AuthScreen mode="sign-up" returnTo="/settings?section=appearance" />);

    const heading = screen.getByRole("heading", { name: "Create your account" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByLabelText("Email", { selector: "input" })).not.toHaveAttribute("autofocus");
    expect(screen.getByLabelText("Password", { selector: "input" })).toHaveAccessibleDescription(
      "Use 8–128 characters.",
    );
    expect(screen.getByLabelText("Confirm password", { selector: "input" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/sign-in?returnTo=%2Fsettings%3Fsection%3Dappearance",
    );
    expect(screen.getByRole("link", { name: "Try demo" })).toHaveAttribute("href", "/");
  });
});

describe("AuthForm validation", () => {
  it("server-renders every form control disabled until hydration is ready", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<AuthForm mode="sign-in" navigate={vi.fn()} />);

    expect(container.querySelector("form")).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector("fieldset")).toBeDisabled();
    expect(container.querySelector("input[name='email']")).toBeDisabled();
    expect(container.querySelector("button[type='submit']")).toBeDisabled();
  });

  it("focuses a linked error summary and never submits invalid input", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthForm mode="sign-up" navigate={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Create account" }));

    const summary = screen.getByRole("alert");
    await waitFor(() => expect(summary).toHaveFocus());
    const emailLink = within(summary).getByRole("link", { name: /Email: Enter your email address/u });
    await user.click(emailLink);
    expect(screen.getByLabelText("Email", { selector: "input" })).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires matching confirmation without validating before submit", async () => {
    const user = userEvent.setup();
    render(<AuthForm mode="sign-up" navigate={vi.fn()} />);

    expect(screen.queryByText("Passwords must match.")).not.toBeInTheDocument();
    await fillCredentials(user, "person@example.test", "correct-password");
    await user.type(screen.getByLabelText("Confirm password", { selector: "input" }), "different-password");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByText("Passwords must match.")).toBeInTheDocument();
  });

  it("provides named, persistent password reveal controls", async () => {
    const user = userEvent.setup();
    render(<AuthForm mode="sign-up" navigate={vi.fn()} />);
    const password = screen.getByLabelText("Password", { selector: "input" });

    expect(password).toHaveAttribute("type", "password");
    const reveal = screen.getByRole("button", { name: "Show password" });
    await user.click(reveal);
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("AuthForm requests", () => {
  it("posts sign-in credentials and navigates only to a safe relative destination", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthForm mode="sign-in" returnTo="/settings?tab=appearance" navigate={navigate} />);

    await fillCredentials(user, "person@example.test", "correct-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/settings?tab=appearance"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("/api/auth/sign-in/email");
    expect(request).toMatchObject({ method: "POST", credentials: "same-origin", cache: "no-store" });
    expect(JSON.parse(String(request?.body))).toEqual({
      email: "person@example.test",
      password: "correct-password",
    });
  });

  it("signs up with public credentials, explicitly signs in, and then enters Inbox", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthForm mode="sign-up" navigate={navigate} />);

    await fillCredentials(user, "person@example.test", "correct-password");
    await user.type(screen.getByLabelText("Confirm password", { selector: "input" }), "correct-password");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/inbox"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [signUpUrl, signUpRequest] = fetchMock.mock.calls[0] ?? [];
    const [signInUrl, signInRequest] = fetchMock.mock.calls[1] ?? [];
    expect(signUpUrl).toBe("/api/auth/sign-up/email");
    expect(signInUrl).toBe("/api/auth/sign-in/email");
    expect(JSON.parse(String(signUpRequest?.body))).toEqual({
      email: "person@example.test",
      password: "correct-password",
    });
    expect(JSON.parse(String(signInRequest?.body))).toEqual({
      email: "person@example.test",
      password: "correct-password",
    });
  });

  it("does not navigate when the explicit post-sign-up sign-in fails", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthForm mode="sign-up" navigate={navigate} />);

    await fillCredentials(user, "person@example.test", "correct-password");
    await user.type(screen.getByLabelText("Confirm password", { selector: "input" }), "correct-password");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t create your account. Check the form and try again.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("keeps loading geometry stable and blocks duplicate requests", async () => {
    const user = userEvent.setup();
    let resolveResponse: ((response: Response) => void) | undefined;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    const navigate = vi.fn();
    const fetchMock = vi.fn<typeof fetch>().mockReturnValue(pendingResponse);
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthForm mode="sign-in" navigate={navigate} />);
    await fillCredentials(user, "person@example.test", "correct-password");

    const submit = screen.getByRole("button", { name: "Sign in" });
    await user.click(submit);
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Signing in…" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveResponse?.(new Response(null, { status: 200 }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/inbox"));
  });

  it("shows account-safe copy instead of a provider error", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ message: "EMAIL_ALREADY_IN_USE" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthForm mode="sign-up" navigate={vi.fn()} />);
    await fillCredentials(user, "person@example.test", "correct-password");
    await user.type(screen.getByLabelText("Confirm password", { selector: "input" }), "correct-password");

    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t create your account. Check the form and try again.",
    );
    expect(screen.queryByText("EMAIL_ALREADY_IN_USE")).not.toBeInTheDocument();
  });
});

describe("AuthForm offline and return behavior", () => {
  it("explains offline state and disables submission", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    setOnline(false);
    render(<AuthForm mode="sign-in" navigate={vi.fn()} />);

    expect(
      await screen.findByText("You’re offline. Connect to the internet to sign in."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects external, protocol-relative, auth-loop, and API return targets", () => {
    expect(resolveSafeReturnTo("https://attacker.example/path")).toBe("/inbox");
    expect(resolveSafeReturnTo("//attacker.example/path")).toBe("/inbox");
    expect(resolveSafeReturnTo("/\\attacker.example/path")).toBe("/inbox");
    expect(resolveSafeReturnTo("/sign-in")).toBe("/inbox");
    expect(resolveSafeReturnTo("/api/private")).toBe("/inbox");
    expect(resolveSafeReturnTo("/settings?tab=date#timezone")).toBe("/settings?tab=date#timezone");
  });
});

async function fillCredentials(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  await user.type(screen.getByLabelText("Email", { selector: "input" }), email);
  await user.type(screen.getByLabelText("Password", { selector: "input" }), password);
}

function setOnline(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value: online });
}
