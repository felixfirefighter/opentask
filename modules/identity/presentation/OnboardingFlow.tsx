"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useMediaQuery } from "@/shared/presentation";
import type { CheckInMood, OnboardingGoal, OnboardingState } from "../application/contracts";

import styles from "./OnboardingFlow.module.css";
import { RichText, Typeline } from "./Typewriter";

export type CompanionSettings = Readonly<{ configured: boolean; source: "account" | "server" | "none" }>;
export type WorkspaceBootstrap = Readonly<{
  username: string;
  onboarding: OnboardingState;
  companionConfigured: boolean;
}>;

type Phase =
  | "greeting"
  | "name"
  | "ack"
  | "key"
  | "skip"
  | "intro"
  | "goals"
  | "summary"
  | "returning"
  | "mood"
  | "bridge";
type KeyResult = Readonly<{ ok: true } | { ok: false; reason: "invalid" | "network" }>;

const minimumAutoPhaseDurationMs = 3_000;

const goalOptions: readonly { key: OnboardingGoal; label: string }[] = [
  { key: "discipline", label: "building discipline" },
  { key: "tasks", label: "tracking tasks" },
  { key: "habits", label: "building habits" },
  { key: "reminders", label: "reminders" },
  { key: "daily_planning", label: "planning daily tasks" },
  { key: "scheduling", label: "scheduling ahead" },
  { key: "other", label: "something else" },
];

export function OnboardingFlow({
  workspace,
  initialName,
  online,
  onNameReady,
  onComplete,
  onConnectKey,
  onCheckin,
  onCompanionChat,
  onNavigate,
}: Readonly<{
  workspace: WorkspaceBootstrap | null;
  initialName: string | null;
  online: boolean;
  onNameReady: (name: string) => Promise<void>;
  onComplete: (goals: readonly string[]) => Promise<void>;
  onConnectKey: (apiKey: string) => Promise<KeyResult>;
  onCheckin: (mood: CheckInMood, note?: string) => Promise<void>;
  onCompanionChat: (name: string) => Promise<string | null>;
  onNavigate: (destination: string) => void;
}>) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const initialPhase: Phase = workspace
    ? workspace.onboarding.complete
      ? "returning"
      : workspace.companionConfigured
        ? "intro"
        : "key"
    : "greeting";
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [name, setName] = useState(initialName ?? "");
  const [goals, setGoals] = useState<OnboardingGoal[]>([]);
  const [otherGoal, setOtherGoal] = useState("");
  const [apiKey, setApiKey] = useState("");
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const [keyError, setKeyError] = useState<"invalid" | "network" | null>(null);
  const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState<CheckInMood | null>(null);
  const [note, setNote] = useState("");
  const [companionLine, setCompanionLine] = useState<string | null>(null);
  const [chatTried, setChatTried] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameReady = name.trim().length >= 2;

  useEffect(() => {
    if (workspace && (phase === "greeting" || (phase === "name" && Boolean(initialName)))) {
      // Workspace data arrives after the launch shell mounts; this advances the flow to its persisted step.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase(
        workspace.onboarding.complete
          ? "returning"
          : initialName
            ? workspace.companionConfigured
              ? "intro"
              : "key"
            : "ack",
      );
    }
  }, [initialName, phase, workspace]);

  useEffect(() => {
    if (phase !== "returning" || chatTried || !workspace) return;
    // This guard prevents a second provider request for the same returning session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChatTried(true);
    if (workspace.onboarding.todayCheckin) {
      setCompanionLine(
        `we've already checked in today, *${safeName(workspace.username)}*. let's see what's on deck.`,
      );
      return;
    }
    const response = workspace.companionConfigured
      ? onCompanionChat(workspace.username)
      : Promise.resolve(null);
    void response.then((line) => {
      setCompanionLine(line ?? `morning, *${safeName(workspace.username)}*. how are you arriving today?`);
    });
  }, [chatTried, onCompanionChat, phase, workspace]);

  useEffect(() => {
    if (keyError && !busy) {
      apiKeyRef.current?.focus();
      apiKeyRef.current?.select();
    }
  }, [busy, keyError]);

  const selectedGoalKeys = useMemo(() => {
    if (!goals.includes("other") || !otherGoal.trim()) return goals;
    return goals.map((goal) => (goal === "other" ? `other:${otherGoal.trim()}` : goal));
  }, [goals, otherGoal]);

  function toggleGoal(goal: OnboardingGoal) {
    setGoals((current) =>
      current.includes(goal) ? current.filter((value) => value !== goal) : [...current, goal],
    );
  }

  async function submitName(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 64) return;
    setBusy(true);
    setNameError(null);
    try {
      await onNameReady(trimmed);
      setName(trimmed);
      setPhase("ack");
    } catch (error) {
      setNameError(error instanceof Error ? error.message : "Your workspace could not be opened. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function connectKey() {
    if (!apiKey.trim() || busy) return;
    setBusy(true);
    setKeyError(null);
    const result = await onConnectKey(apiKey);
    setBusy(false);
    if (result.ok) {
      setApiKey("");
      setPhase("intro");
    } else setKeyError(result.reason);
  }

  function skipKey() {
    if (busy) return;
    setKeyError(null);
    setPhase("skip");
  }

  async function saveGoals() {
    if (selectedGoalKeys.length === 0 || busy) return;
    setBusy(true);
    try {
      await onComplete(selectedGoalKeys);
      setPhase("summary");
    } finally {
      setBusy(false);
    }
  }

  async function saveCheckin() {
    if (!mood || busy) return;
    if (workspace?.onboarding.todayCheckin) {
      onNavigate("/today");
      return;
    }
    setBusy(true);
    try {
      await onCheckin(mood, note.trim() || undefined);
      setPhase("bridge");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={`${styles.flow} ${phase === "name" || phase === "goals" ? styles.inputPhase : ""}`}
      aria-label="OpenTask onboarding"
    >
      {phase === "greeting" && (
        <MessageSequence
          lines={["hey. welcome to *OpenTask*", "before anything else — what should i call you?"]}
          reducedMotion={reducedMotion}
          onFinished={() => setPhase("name")}
        />
      )}
      {phase === "name" && (
        <div className={styles.nameStep}>
          <div className={styles.namePrompt} aria-live="polite">
            <RichText value="hey. welcome to *OpenTask*" />
            <RichText value="before anything else — what should i call you?" />
          </div>
          <div className={styles.controls}>
            <form className={styles.nameForm} onSubmit={submitName}>
              <label className="sr-only" htmlFor="onboarding-name">
                Your name
              </label>
              <input
                id="onboarding-name"
                className={styles.underlineInput}
                value={name}
                maxLength={64}
                autoFocus
                placeholder="your name"
                onChange={(event) => setName(event.target.value)}
              />
              {nameReady && (
                <div className={styles.nameActions}>
                  <button className={styles.nameContinue} type="submit" disabled={busy}>
                    Continue
                  </button>
                </div>
              )}
            </form>
            {nameError && (
              <p className={styles.error} role="alert">
                {nameError}
              </p>
            )}
          </div>
        </div>
      )}
      {phase === "key" && (
        <ConversationStep
          lines={
            keyError === "invalid"
              ? ["hmm, that key didn't work. mind double-checking it? it usually starts with *sk-*. "]
              : keyError === "network"
                ? [
                    "i couldn't reach OpenAI to check that just now. you can retry, or skip and add it later in Settings.",
                  ]
                : [
                    "one optional thing.",
                    "if you connect your own *OpenAI API key*, you unlock your companion — that's *Ameth*, who plans and checks in with you.",
                    "or you can add a key anytime in *Settings* later.",
                  ]
          }
          reducedMotion={reducedMotion}
          onFinished={() => undefined}
          compactLineIndexes={keyError ? [] : [2]}
          controls={
            <div className={styles.controls}>
              <label className="sr-only" htmlFor="onboarding-api-key">
                OpenAI API key
              </label>
              <input
                id="onboarding-api-key"
                ref={apiKeyRef}
                className={styles.underlineInput}
                type="password"
                value={apiKey}
                placeholder="sk-…"
                autoComplete="new-password"
                disabled={busy}
                onChange={(event) => setApiKey(event.target.value)}
              />
              <div className={`${styles.actions} ${styles.keyActions}`}>
                <button
                  className={`${styles.quietLink} ${styles.keyActionButtonNoPadding}`}
                  type="button"
                  disabled={busy}
                  onClick={skipKey}
                >
                  Skip for now
                </button>
                <button
                  className={`primary-button ${styles.keyActionButton}`}
                  type="button"
                  disabled={busy || !apiKey.trim() || !online}
                  onClick={() => void connectKey()}
                >
                  {busy ? "Checking…" : "Connect"}
                </button>
              </div>
            </div>
          }
        />
      )}
      {phase === "skip" && (
        <MessageSequence
          lines={["no problem. you're all set to plan on your own — i'll be here for the rest."]}
          reducedMotion={reducedMotion}
          onFinished={() => setPhase("intro")}
        />
      )}
      {phase === "ack" && (
        <MessageSequence
          lines={[`good to meet you, *${safeName(name)}*.`]}
          reducedMotion={reducedMotion}
          onFinished={() => setPhase(workspace?.companionConfigured ? "intro" : "key")}
        />
      )}
      {phase === "intro" && (
        <MessageSequence
          lines={[
            "i'm *Ameth*, your companion inside OpenTask.",
            "i'll help you plan small, start sooner, and keep moving — for the wins and the off days both.",
            "quick question so i can help well —",
            "*what do you want OpenTask to help you with?* pick as many as fit.",
          ]}
          reducedMotion={reducedMotion}
          onFinished={() => setPhase("goals")}
        />
      )}
      {phase === "goals" && (
        <div className={styles.goalStep}>
          <div className={styles.goalPrompt}>
            <RichText value="*what do you want OpenTask to help you with?* pick as many as fit." />
          </div>
          <div className={styles.controls}>
            <div className={styles.chips} role="group" aria-label="Your goals">
              {goalOptions.map((option) => (
                <button
                  key={option.key}
                  className={styles.chip}
                  type="button"
                  data-selected={goals.includes(option.key)}
                  aria-pressed={goals.includes(option.key)}
                  onClick={() => toggleGoal(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {goals.includes("other") && (
              <>
                <label className="sr-only" htmlFor="onboarding-other-goal">
                  Something else
                </label>
                <input
                  id="onboarding-other-goal"
                  className={styles.underlineInput}
                  value={otherGoal}
                  maxLength={160}
                  placeholder="a little more detail, if you want"
                  onChange={(event) => setOtherGoal(event.target.value)}
                />
              </>
            )}
            <div className={`${styles.actions} ${styles.goalActions}`}>
              <button
                className="primary-button"
                type="button"
                disabled={selectedGoalKeys.length === 0 || busy}
                onClick={() => void saveGoals()}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
      {phase === "summary" && (
        <MessageSequence
          lines={[
            `got it — you're here for ${formatGoals(selectedGoalKeys)}.`,
            "that's a solid place to start. i think we can do this together.",
            workspace?.companionConfigured
              ? "let's begin."
              : "i'll be quietly along for the ride until you add a key — then i can really get to work. let's begin.",
          ]}
          reducedMotion={reducedMotion}
          onFinished={() => undefined}
          controls={
            <button className="primary-button" type="button" onClick={() => onNavigate("/today")}>
              Let&apos;s start
            </button>
          }
        />
      )}
      {phase === "returning" && companionLine && (
        <ConversationStep
          lines={[companionLine]}
          reducedMotion={reducedMotion}
          onFinished={() => setPhase("mood")}
          controls={
            workspace?.onboarding.todayCheckin ? (
              <button className="primary-button" type="button" onClick={() => onNavigate("/today")}>
                Open today
              </button>
            ) : undefined
          }
        />
      )}
      {phase === "mood" && (
        <div className={styles.controls}>
          <div className={styles.chips} role="group" aria-label="How you are arriving today">
            {(["good", "tired", "heavy", "ready"] as const).map((value) => (
              <button
                key={value}
                className={styles.chip}
                type="button"
                data-selected={mood === value}
                aria-pressed={mood === value}
                onClick={() => setMood(value)}
              >
                {value}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="checkin-note">
            A note, if you want
          </label>
          <input
            id="checkin-note"
            className={styles.underlineInput}
            maxLength={500}
            value={note}
            placeholder="anything else, if you want"
            onChange={(event) => setNote(event.target.value)}
          />
          <button
            className="primary-button"
            type="button"
            disabled={!mood || busy || !online}
            onClick={() => void saveCheckin()}
          >
            Continue
          </button>
        </div>
      )}
      {phase === "bridge" && (
        <MessageSequence
          lines={[
            mood === "heavy" || mood === "tired"
              ? "thanks for telling me. no pressure today — we’ll take it one step at a time."
              : "love that. here's what's on deck.",
          ]}
          reducedMotion={reducedMotion}
          onFinished={() => onNavigate("/today")}
        />
      )}
      {!online && phase !== "returning" && (
        <p className={styles.status}>You’re offline. Manual workspace setup needs one connection.</p>
      )}
    </section>
  );
}

function MessageSequence({
  lines,
  reducedMotion,
  onFinished,
  controls,
  compactLineIndexes,
}: Readonly<{
  lines: readonly string[];
  reducedMotion: boolean;
  onFinished: () => void;
  controls?: React.ReactNode;
  compactLineIndexes?: readonly number[];
}>) {
  const [index, setIndex] = useState(0);
  const finished = index >= lines.length;
  const compactLine = compactLineIndexes?.includes(index) ?? false;
  const startedAtRef = useRef<number | undefined>(undefined);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    if (!finished) return;
    const startedAt = startedAtRef.current ?? Date.now();
    const remaining = Math.max(0, minimumAutoPhaseDurationMs - (Date.now() - startedAt));
    const timer = window.setTimeout(() => onFinishedRef.current(), remaining);
    return () => window.clearTimeout(timer);
  }, [finished]);

  return (
    <div className={styles.messages}>
      {lines.slice(0, index).map((line, lineIndex) => (
        <div
          className={`${styles.messageLine} ${compactLineIndexes?.includes(lineIndex) ? styles.compactMessageLine : ""}`}
          key={`${line}-${lineIndex}`}
        >
          <RichText value={line} />
        </div>
      ))}
      {!finished && (
        <Typeline
          key={`${lines[index]}-${index}`}
          text={lines[index] ?? ""}
          className={`${styles.messageLine} ${compactLine ? styles.compactMessageLine : ""}`}
          reducedMotion={reducedMotion}
          onComplete={() => setIndex((value) => value + 1)}
        />
      )}
      {finished && controls}
      {finished && !controls && <span className="sr-only">Continue</span>}
    </div>
  );
}

function ConversationStep({
  lines,
  reducedMotion,
  onFinished,
  controls,
  compactLineIndexes,
}: Readonly<{
  lines: readonly string[];
  reducedMotion: boolean;
  onFinished: () => void;
  controls?: React.ReactNode;
  compactLineIndexes?: readonly number[];
}>) {
  return (
    <MessageSequence
      key={lines.join("\u0000")}
      lines={lines}
      reducedMotion={reducedMotion}
      onFinished={onFinished}
      {...(compactLineIndexes ? { compactLineIndexes } : {})}
      controls={controls}
    />
  );
}

function formatGoals(goals: readonly string[]): string {
  const labels = goals.map((goal) =>
    goal.startsWith("other:")
      ? goal.slice(6)
      : (goalOptions.find((option) => option.key === goal)?.label ?? goal),
  );
  if (labels.length <= 1) return labels[0] ?? "a few things";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function safeName(name: string) {
  return name.replaceAll("*", "");
}
