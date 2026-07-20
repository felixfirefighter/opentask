"use client";

import * as Dialog from "@radix-ui/react-dialog";
import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { BrandMark, ThemeToggle, useOnlineStatus } from "@/shared/presentation";

import styles from "./ProfileSetupLauncher.module.css";
import { readProfileUsername, saveProfileUsername, validateProfileUsername } from "./profile-storage";

type LaunchStage = "checking" | "setup" | "submitting" | "error";
type Navigate = (destination: string) => void;

export function ProfileSetupLauncher({
  navigate = (destination) => window.location.replace(destination),
  resumeTo,
}: {
  navigate?: Navigate | undefined;
  resumeTo?: string | null | undefined;
}) {
  const storedUsername = useSyncExternalStore(subscribeToNothing, readProfileUsername, () => null);
  const [stage, setStage] = useState<LaunchStage>("checking");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const online = useOnlineStatus();

  const bootstrap = useCallback(
    async (value: string, destination: string) => {
      if (!online) {
        setStage("error");
        setError("Connect to the workspace once to finish setup.");
        return;
      }

      setStage("submitting");
      setError("");
      try {
        const response = await fetch("/api/v1/demo", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!response.ok) throw new Error("Workspace bootstrap failed");
        const result = (await response.json()) as { redirectTo?: unknown };
        if (result.redirectTo !== "/inbox") throw new Error("Unexpected workspace destination");
        saveProfileUsername(value);
        navigate(destination);
      } catch {
        setStage("error");
        setError("Your workspace could not be opened. Check your connection and try again.");
      }
    },
    [navigate, online],
  );

  useEffect(() => {
    if (!storedUsername) return;
    if (!resumeTo) {
      navigate("/inbox");
      return;
    }
    const timer = window.setTimeout(() => void bootstrap(storedUsername, resumeTo), 0);
    return () => window.clearTimeout(timer);
  }, [bootstrap, navigate, resumeTo, storedUsername]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateProfileUsername(username);
    if (validationError) {
      setError(validationError);
      inputRef.current?.focus();
      return;
    }
    await bootstrap(username.trim(), resumeTo ?? "/inbox");
  }

  const isSetup = !storedUsername || stage === "error";

  return (
    <div className={styles.page}>
      <a className="skip-link" href="#profile-setup">
        Skip to profile setup
      </a>
      <div className={styles.brand}>
        <BrandMark />
      </div>
      <div className={styles.theme}>
        <ThemeToggle />
      </div>
      <main className={styles.fallbackContent} id="profile-setup">
        <p className="eyebrow">Your planning space</p>
        <h1>Make room for what matters.</h1>
        <p>Open your workspace directly. Your profile name stays on this device.</p>
      </main>

      <Dialog.Root open>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content
            className={styles.content}
            aria-describedby="profile-setup-description"
            onEscapeKeyDown={(event) => event.preventDefault()}
            onPointerDownOutside={(event) => event.preventDefault()}
            onOpenAutoFocus={(event) => {
              if (isSetup) {
                event.preventDefault();
                inputRef.current?.focus();
              }
            }}
          >
            <Dialog.Title asChild>
              <h1>{isSetup ? "Set up your profile" : "Opening your workspace"}</h1>
            </Dialog.Title>
            <Dialog.Description className={styles.description} id="profile-setup-description">
              {isSetup
                ? "Choose the name you want to see in OpenTask. It is cached locally and is not an account or sign-in."
                : "Preparing your private workspace…"}
            </Dialog.Description>

            {isSetup ? (
              <form className={styles.form} onSubmit={submit} noValidate>
                <label className={styles.label} htmlFor="profile-username">
                  Profile username
                </label>
                <input
                  ref={inputRef}
                  className={styles.input}
                  id="profile-username"
                  name="username"
                  value={username || storedUsername || ""}
                  maxLength={64}
                  autoComplete="nickname"
                  aria-invalid={Boolean(error)}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    if (error) setError("");
                  }}
                />
                <p className={styles.hint}>You can use your first name or any label you prefer.</p>
                {error && (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                )}
                {!online && <p className={styles.offline}>Connect once to open the workspace.</p>}
                <div className={styles.actions}>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={!online || stage === "submitting"}
                  >
                    {stage === "submitting" ? "Opening…" : "Open workspace"}
                  </button>
                </div>
              </form>
            ) : (
              <p className={styles.status} role="status" aria-live="polite">
                {stage === "submitting" ? "Preparing your private workspace…" : "Checking your profile…"}
              </p>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function subscribeToNothing() {
  return () => undefined;
}
