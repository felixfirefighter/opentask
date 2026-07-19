"use client";

import { Search, Sun, X, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";

import styles from "./FirstRunOrientation.module.css";

const dismissalKeyPrefix = "opentask:first-run-orientation:v1";
const changeEvent = "opentask:first-run-orientation-change";

export function FirstRunOrientation({ inboxId }: Readonly<{ inboxId: string }>) {
  const readAccountVisible = useCallback(() => readVisible(inboxId), [inboxId]);
  const visible = useSyncExternalStore(subscribe, readAccountVisible, () => false);
  const [announcement, setAnnouncement] = useState("");

  function dismiss() {
    try {
      window.localStorage.setItem(dismissalKey(inboxId), "dismissed");
    } catch {
      // The non-blocking orientation may still be dismissed for this render.
    }
    setAnnouncement("Getting started tips dismissed.");
    window.dispatchEvent(new Event(changeEvent));
  }

  return (
    <>
      {visible ? (
        <aside className={styles.orientation} aria-labelledby="first-run-title">
          <div className={styles.heading}>
            <div>
              <p className="eyebrow">Start here</p>
              <h2 id="first-run-title">Three quick ways into your day</h2>
            </div>
            <button type="button" onClick={dismiss} aria-label="Dismiss getting started tips">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div className={styles.tips}>
            <Tip icon={<Zap size={17} aria-hidden="true" />} title="Quick add">
              Type below and press Enter to capture the next task.
            </Tip>
            <Tip icon={<Sun size={17} aria-hidden="true" />} title="Today">
              <Link href="/today">Open Today</Link> to see scheduled work in local time.
            </Tip>
            <Tip icon={<Search size={17} aria-hidden="true" />} title="Command search">
              Press <kbd>Ctrl/⌘ K</kbd> to find a task or destination.
            </Tip>
          </div>
        </aside>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </>
  );
}

function Tip({
  children,
  icon,
  title,
}: Readonly<{ children: React.ReactNode; icon: React.ReactNode; title: string }>) {
  return (
    <section>
      <span className={styles.icon}>{icon}</span>
      <div>
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </section>
  );
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(changeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(changeEvent, onChange);
  };
}

function readVisible(inboxId: string) {
  try {
    return window.localStorage.getItem(dismissalKey(inboxId)) !== "dismissed";
  } catch {
    return true;
  }
}

function dismissalKey(inboxId: string) {
  return `${dismissalKeyPrefix}:${inboxId}`;
}
