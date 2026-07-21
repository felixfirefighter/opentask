"use client";

import { MessageCircle, RefreshCw, Send, Sparkles, Trash2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import styles from "./AmethCompanion.module.css";

type State = {
  profile: {
    totalXp: number;
    level: 1 | 2 | 3;
    levelName: string;
    nextLevelXp: number | null;
    version: number;
    proactiveMessages: "enabled" | "muted";
    communicationStyle: "warm" | "focused" | "direct";
    dailyMode: "warm" | "focused" | "direct" | null;
  };
  actions: ReadonlyArray<{ type: string; label: string; xp: number }>;
  unlocks: ReadonlyArray<{
    level: number;
    name: string;
    threshold: number;
    nextThreshold: number | null;
    unlocked: boolean;
  }>;
  summary: { message: string; completionCount: number; xpEarned: number; strongestDay: string | null } | null;
  memories: ReadonlyArray<{ id: string; text: string; createdAt: string }>;
};

function avatarSource(level: number) {
  return `/ameth/level-${level}.webp`;
}

function unlockCopy(level: 2 | 3) {
  return level === 2
    ? "Weekly pattern cards and richer planning prompts are now available."
    : "Longer-range reflection and the Prompt Library are now available.";
}

export function AmethCompanion() {
  const [state, setState] = useState<State | null>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [memory, setMemory] = useState("");
  const [sessionMode, setSessionMode] = useState<"warm" | "focused" | "direct" | null>(null);
  const [celebrationLevel, setCelebrationLevel] = useState<2 | 3 | null>(null);
  const previousLevel = useRef<1 | 2 | 3 | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();

  const loadState = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/companion/state", { cache: "no-store" });
      if (!response.ok) throw new Error("state");
      const next = (await response.json()) as State;
      if (next.profile.dailyMode) {
        window.sessionStorage.setItem("ameth-daily-mode", next.profile.dailyMode);
        setSessionMode(next.profile.dailyMode);
      } else {
        const retained = window.sessionStorage.getItem("ameth-daily-mode");
        if (retained === "warm" || retained === "focused" || retained === "direct") setSessionMode(retained);
      }
      setState(next);
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadState(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadState();
    }, 20_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [loadState]);

  useEffect(() => {
    if (!state) return;
    if (previousLevel.current !== null && state.profile.level > previousLevel.current) {
      setCelebrationLevel(state.profile.level as 2 | 3);
    }
    previousLevel.current = state.profile.level;
  }, [state]);

  useEffect(() => {
    if (!celebrationLevel) return;
    const timer = window.setTimeout(() => setCelebrationLevel(null), 10_000);
    return () => window.clearTimeout(timer);
  }, [celebrationLevel]);

  const xpProgress = state?.profile.nextLevelXp
    ? Math.min(100, Math.round((state.profile.totalXp / state.profile.nextLevelXp) * 100))
    : 100;

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = message.trim();
    if (!next) return;
    setReply(null);
    const response = await fetch("/api/v1/companion/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: next,
        selectedTaskIds: [],
        mode: sessionMode ?? state?.profile.dailyMode ?? state?.profile.communicationStyle,
      }),
    });
    if (response.ok) setReply(((await response.json()) as { reply: string }).reply);
    else setReply("Ameth could not respond just now. Your work remains safely unchanged.");
    setMessage("");
  }

  async function saveDailyMode(mode: "warm" | "focused" | "direct") {
    const response = await fetch("/api/v1/companion/daily-mode", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    if (response.ok) {
      window.sessionStorage.setItem("ameth-daily-mode", mode);
      setSessionMode(mode);
      setState((await response.json()) as State);
    }
  }

  async function savePreferences(
    patch: Partial<Pick<State["profile"], "proactiveMessages" | "communicationStyle">>,
  ) {
    if (!state) return;
    const response = await fetch("/api/v1/companion/preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: state.profile.version, patch }),
    });
    if (response.ok) setState((await response.json()) as State);
  }

  async function saveMemory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = memory.trim();
    if (!text) return;
    const response = await fetch("/api/v1/companion/memories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (response.ok) {
      setMemory("");
      void loadState();
    }
  }

  async function removeMemory(memoryId: string) {
    const response = await fetch(`/api/v1/companion/memories/${memoryId}`, { method: "DELETE" });
    if (response.ok) void loadState();
  }

  async function rebuildSummary() {
    const response = await fetch("/api/v1/companion/summaries/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    if (response.ok) void loadState();
  }

  async function deleteCompanionData() {
    if (!window.confirm("Delete Ameth’s XP, summaries, and saved memory cards? This cannot be undone."))
      return;
    const response = await fetch("/api/v1/companion/data", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE COMPANION DATA" }),
    });
    if (response.ok) {
      setCelebrationLevel(null);
      void loadState();
    }
  }

  function closeDrawer() {
    setOpen(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }

  return (
    <section className={styles.root} aria-label="Ameth companion">
      <div className={styles.preview} data-open={preview} aria-hidden={!preview}>
        {state ? (
          <>
            <strong>Ameth · {state.profile.levelName}</strong>
            <span>
              {state.profile.totalXp}
              {state.profile.nextLevelXp ? ` / ${state.profile.nextLevelXp} XP` : " XP · max level"}
            </span>
            <ul>
              {state.actions.slice(0, 3).map((action) => (
                <li key={action.type}>
                  {action.label} · +{action.xp} XP
                </li>
              ))}
            </ul>
          </>
        ) : (
          <span>{loading ? "Preparing Ameth…" : "Ameth is temporarily unavailable."}</span>
        )}
      </div>
      <button
        ref={triggerRef}
        className={styles.trigger}
        type="button"
        aria-label="Open Ameth companion"
        aria-expanded={open}
        aria-describedby={labelId}
        onClick={() => setOpen(true)}
        onMouseEnter={() => setPreview(true)}
        onMouseLeave={() => setPreview(false)}
        onFocus={() => setPreview(true)}
        onBlur={() => setPreview(false)}
        data-celebrating={celebrationLevel ? "true" : undefined}
      >
        <svg className={styles.ring} viewBox="0 0 44 44" aria-hidden="true">
          <circle className={styles.ringTrack} cx="22" cy="22" r="19" />
          <circle
            className={styles.ringValue}
            cx="22"
            cy="22"
            r="19"
            pathLength="100"
            style={{ strokeDasharray: `${xpProgress} 100` }}
          />
        </svg>
        <Image
          src={avatarSource(state?.profile.level ?? 1)}
          alt=""
          width={42}
          height={42}
          unoptimized
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
        <span className={styles.fallback}>
          <Sparkles aria-hidden="true" />
        </span>
        <span id={labelId} className="sr-only">
          Level {state?.profile.level ?? 1}, {state?.profile.totalXp ?? 0} experience points.
        </span>
      </button>

      {celebrationLevel && (
        <section className={styles.levelUp} aria-live="polite" role="status">
          <Sparkles aria-hidden="true" />
          <div>
            <strong>Ameth reached level {celebrationLevel}</strong>
            <span>{unlockCopy(celebrationLevel)}</span>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Dismiss level-up message"
            onClick={() => setCelebrationLevel(null)}
          >
            <X aria-hidden="true" />
          </button>
        </section>
      )}

      {open && (
        <aside className={styles.drawer} aria-labelledby="ameth-title">
          <header>
            <div>
              <p className="eyebrow">Your companion</p>
              <h2 id="ameth-title">Ameth · {state?.profile.levelName ?? "Acquaintance"}</h2>
            </div>
            <button className="icon-button" type="button" aria-label="Close Ameth" onClick={closeDrawer}>
              <X aria-hidden="true" />
            </button>
          </header>
          <div className={styles.xpLine}>
            <span>{state?.profile.totalXp ?? 0} XP</span>
            <span>
              {state?.profile.nextLevelXp
                ? `${state.profile.nextLevelXp} to next level`
                : "Trusted companion"}
            </span>
          </div>
          <section className={styles.message}>
            <MessageCircle aria-hidden="true" />
            <p>
              {reply ??
                state?.summary?.message ??
                "Start with one small task. I’ll help you notice what works."}
            </p>
          </section>
          <section className={styles.settings} aria-label="Ameth settings">
            <label htmlFor="ameth-mode">Today’s mode</label>
            <select
              id="ameth-mode"
              value={sessionMode ?? state?.profile.dailyMode ?? state?.profile.communicationStyle ?? "warm"}
              onChange={(event) => void saveDailyMode(event.target.value as "warm" | "focused" | "direct")}
            >
              <option value="warm">Warm</option>
              <option value="focused">Focused</option>
              <option value="direct">Direct</option>
            </select>
            <small>Today’s choice resets only when you next reopen Omplish on a later local day.</small>
            <label htmlFor="ameth-default-style">Default style</label>
            <select
              id="ameth-default-style"
              value={state?.profile.communicationStyle ?? "warm"}
              onChange={(event) =>
                void savePreferences({
                  communicationStyle: event.target.value as "warm" | "focused" | "direct",
                })
              }
            >
              <option value="warm">Warm</option>
              <option value="focused">Focused</option>
              <option value="direct">Direct</option>
            </select>
            <label className={styles.toggle} htmlFor="ameth-proactive">
              <input
                id="ameth-proactive"
                type="checkbox"
                checked={state?.profile.proactiveMessages === "enabled"}
                onChange={(event) =>
                  void savePreferences({ proactiveMessages: event.target.checked ? "enabled" : "muted" })
                }
              />
              Show proactive encouragement
            </label>
          </section>
          <section className={styles.progression} aria-label="Ameth progression">
            {state?.unlocks.map((unlock) => (
              <div key={unlock.level} data-unlocked={unlock.unlocked}>
                <strong>Level {unlock.level}</strong>
                <span>{unlock.name}</span>
              </div>
            ))}
          </section>
          <section className={styles.dataControls} aria-label="Companion data controls">
            <button className="secondary-button" type="button" onClick={() => void rebuildSummary()}>
              <RefreshCw aria-hidden="true" /> Rebuild what Ameth learned
            </button>
            <button className="secondary-button" type="button" onClick={() => void deleteCompanionData()}>
              <Trash2 aria-hidden="true" /> Delete companion data
            </button>
          </section>
          {state?.profile.level && state.profile.level > 1 && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setCelebrationLevel(state.profile.level as 2 | 3)}
            >
              Replay latest unlock
            </button>
          )}
          {state?.profile.level === 3 && (
            <Link className="secondary-button" href="/prompts" onClick={closeDrawer}>
              Open Prompt Library
            </Link>
          )}
          <form className={styles.chat} onSubmit={sendMessage}>
            <label htmlFor="ameth-message">Talk with Ameth</label>
            <div>
              <input
                id="ameth-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={1000}
                placeholder="Reflect or prepare a plan…"
              />
              <button className="primary-button" type="submit" aria-label="Send message">
                <Send aria-hidden="true" />
              </button>
            </div>
            <small>Ameth cannot change tasks. Planning suggestions always require review.</small>
          </form>
          <form className={styles.memory} onSubmit={saveMemory}>
            <label htmlFor="ameth-memory">Remember for Ameth</label>
            <div>
              <input
                id="ameth-memory"
                value={memory}
                onChange={(event) => setMemory(event.target.value)}
                maxLength={500}
                placeholder="Only save details you approve…"
              />
              <button className="secondary-button" type="submit">
                Save
              </button>
            </div>
            <small>
              Memory cards are editable companion context, not chat history. Oldest cards are removed after 30
              MiB.
            </small>
            {state?.memories.length ? (
              <ul className={styles.memoryList} aria-label="Saved Ameth memory cards">
                {state.memories.map((item) => (
                  <li key={item.id}>
                    <span>{item.text}</span>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label="Delete saved memory"
                      onClick={() => void removeMemory(item.id)}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </form>
        </aside>
      )}
    </section>
  );
}
