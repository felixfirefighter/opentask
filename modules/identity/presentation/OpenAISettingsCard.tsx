"use client";

import { useState } from "react";

import styles from "./SettingsScreen.module.css";

export type OpenAISettingsState = Readonly<{
  configured: boolean;
  source: "account" | "server" | "none";
}>;

export function OpenAISettingsCard({
  initialSettings,
  online,
}: Readonly<{ initialSettings: OpenAISettingsState; online: boolean }>) {
  const [settings, setSettings] = useState(initialSettings);
  const [apiKey, setApiKey] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState(statusMessage(initialSettings));

  async function save(nextApiKey: string | null) {
    if (!online || state === "saving") return;
    setState("saving");
    setMessage("Saving…");
    try {
      const response = await fetch("/api/v1/assistant/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ apiKey: nextApiKey }),
      });
      if (!response.ok) throw new Error("OpenAI settings save failed");
      const next = parseSettings(await response.json());
      setSettings(next);
      setApiKey("");
      setState("idle");
      setMessage(statusMessage(next));
    } catch {
      setState("error");
      setMessage("This key was not saved. Check your connection and try again.");
    }
  }

  const canSave = online && state !== "saving" && apiKey.trim().length > 0;

  return (
    <section className={styles.card} aria-labelledby="openai-settings-title">
      <div className={styles.cardHeading}>
        <div>
          <p className="eyebrow">Optional AI</p>
          <h2 id="openai-settings-title">OpenAI API key</h2>
        </div>
      </div>
      <p className={styles.cardDescription}>
        Add a personal key to enable AI planning for this profile. The key is sent only to the server and is
        encrypted before it is stored. Manual planning and task workflows remain available without it.
      </p>
      <label className={styles.field} htmlFor="openai-api-key">
        <span>API key</span>
        <input
          id="openai-api-key"
          aria-label="API key"
          type="password"
          value={apiKey}
          autoComplete="new-password"
          placeholder="sk-…"
          onChange={(event) => setApiKey(event.target.value)}
        />
        <small>Leave blank unless you are adding or replacing a personal key.</small>
      </label>
      <div className={styles.cardActions}>
        <p className={styles.saveStatus} aria-live="polite">
          {!online ? "Offline · reconnect before changing the API key." : message}
        </p>
        {settings.source === "account" ? (
          <button
            type="button"
            className="secondary-button"
            disabled={!online || state === "saving"}
            onClick={() => void save(null)}
          >
            Remove personal key
          </button>
        ) : null}
        <button
          type="button"
          className="primary-button"
          disabled={!canSave}
          onClick={() => void save(apiKey)}
        >
          {state === "saving" ? "Saving…" : "Save API key"}
        </button>
      </div>
    </section>
  );
}

function statusMessage(settings: OpenAISettingsState): string {
  if (settings.source === "account")
    return "Personal key saved. It overrides the server key for this profile.";
  if (settings.source === "server") return "Using the server-configured key.";
  return "No OpenAI key configured.";
}

function parseSettings(value: unknown): OpenAISettingsState {
  if (!isRecord(value) || typeof value.configured !== "boolean") throw new Error("Invalid OpenAI settings");
  if (value.source !== "account" && value.source !== "server" && value.source !== "none") {
    throw new Error("Invalid OpenAI settings");
  }
  return { configured: value.configured, source: value.source };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
