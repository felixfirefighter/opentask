"use client";

import { useCallback, useEffect, useState } from "react";

import { BrandMark, ThemeToggle, useOnlineStatus } from "@/shared/presentation";
import type { OnboardingState } from "../application/contracts";

import { OnboardingFlow, type CompanionSettings, type WorkspaceBootstrap } from "./OnboardingFlow";
import styles from "./ProfileSetupLauncher.module.css";
import { readProfileUsername, saveProfileUsername } from "./profile-storage";

type Navigate = (destination: string) => void;

export function ProfileSetupLauncher({
  navigate = (destination) => window.location.replace(destination),
  resumeTo,
}: {
  navigate?: Navigate | undefined;
  resumeTo?: string | null | undefined;
}) {
  const [activeUsername, setActiveUsername] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readProfileUsername(),
  );
  const online = useOnlineStatus();
  const [workspace, setWorkspace] = useState<WorkspaceBootstrap | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const loadWorkspace = useCallback(async (username: string): Promise<void> => {
    const [onboarding, companion] = await Promise.all([
      getJson<OnboardingState>("/api/v1/onboarding"),
      getJson<CompanionSettings>("/api/v1/assistant/settings"),
    ]);
    setActiveUsername(username);
    setWorkspace({ username, onboarding, companionConfigured: companion.configured });
  }, []);

  const openWorkspace = useCallback(
    async (username: string, existingProfile = false): Promise<void> => {
      if (!online) throw new Error("Connect to the workspace once to finish setup.");
      setLaunchError(null);
      if (existingProfile) {
        try {
          await loadWorkspace(username);
          return;
        } catch (error) {
          if (!(error instanceof ApiError) || (error.status !== 401 && error.status !== 403)) throw error;
          // A cached display name can outlive the internal session. Re-enter the isolated workspace only then.
        }
      }
      const response = await fetch("/api/v1/demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        if (response.status === 429)
          throw new Error("Setup has been tried too many times. Please wait and retry.");
        if (response.status === 403)
          throw new Error(
            "Workspace setup was blocked. OpenTask must be opened from its configured local URL.",
          );
        throw new Error("Your workspace could not be opened. Check your connection and try again.");
      }
      const result = (await response.json()) as { redirectTo?: unknown };
      if (result.redirectTo !== "/inbox") throw new Error("Your workspace could not be opened. Try again.");
      saveProfileUsername(username);
      await loadWorkspace(username);
    },
    [loadWorkspace, online],
  );

  useEffect(() => {
    if (!activeUsername || workspace || launchError) return;
    // Loading an existing profile is a mount-time synchronization with the server session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void openWorkspace(activeUsername, true).catch((error: unknown) => {
      setLaunchError(
        error instanceof Error ? error.message : "Your workspace could not be opened. Try again.",
      );
    });
  }, [activeUsername, launchError, openWorkspace, workspace]);

  return (
    <div className={styles.page}>
      <a className="skip-link" href="#onboarding-content">
        Skip to onboarding
      </a>
      <div className={styles.brand}>
        <BrandMark />
      </div>
      <div className={styles.theme}>
        <ThemeToggle />
      </div>

      {launchError && !workspace ? (
        <main className={styles.launchError} id="onboarding-content">
          <p className="eyebrow">OpenTask</p>
          <h1>We couldn’t open your workspace.</h1>
          <p>{launchError}</p>
          <button
            className="primary-button"
            type="button"
            disabled={!online}
            onClick={() => {
              if (activeUsername) {
                setLaunchError(null);
                void openWorkspace(activeUsername).catch((error: unknown) => {
                  setLaunchError(
                    error instanceof Error ? error.message : "Your workspace could not be opened. Try again.",
                  );
                });
              }
            }}
          >
            Try again
          </button>
        </main>
      ) : (
        <main id="onboarding-content">
          <OnboardingFlow
            workspace={workspace}
            online={online}
            initialName={activeUsername}
            onNameReady={async (name) => {
              try {
                await openWorkspace(name);
              } catch (error) {
                setLaunchError(
                  error instanceof Error ? error.message : "Your workspace could not be opened. Try again.",
                );
                throw error;
              }
            }}
            onComplete={async (goals) => {
              const next = await requestJson<OnboardingState>("/api/v1/onboarding", "POST", { goals });
              setWorkspace((current) => (current ? { ...current, onboarding: next } : current));
            }}
            onConnectKey={async (apiKey) => {
              const response = await fetch("/api/v1/assistant/settings", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ apiKey }),
              });
              const payload = (await response.json()) as {
                ok?: boolean;
                reason?: string;
              } & CompanionSettings;
              if (!response.ok)
                return { ok: false, reason: payload.reason === "invalid" ? "invalid" : "network" } as const;
              setWorkspace((current) =>
                current ? { ...current, companionConfigured: payload.configured } : current,
              );
              return { ok: true } as const;
            }}
            onCheckin={async (mood, note) => {
              const next = await requestJson<OnboardingState>("/api/v1/onboarding", "PATCH", { mood, note });
              setWorkspace((current) => (current ? { ...current, onboarding: next } : current));
            }}
            onCompanionChat={async (name) => {
              try {
                const result = await requestJson<{ ok: boolean; text?: string }>(
                  "/api/v1/assistant/companion",
                  "POST",
                  { name },
                );
                return result.ok && result.text ? result.text : null;
              } catch {
                return null;
              }
            }}
            onNavigate={(destination) => navigate(resumeTo ?? destination)}
          />
        </main>
      )}
    </div>
  );
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new ApiError(response.status);
  return (await response.json()) as T;
}

class ApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("Your workspace could not be opened. Try again.");
    this.status = status;
  }
}

async function requestJson<T>(url: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("That change was not saved. Try again.");
  return (await response.json()) as T;
}
