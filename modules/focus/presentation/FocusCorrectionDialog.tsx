"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";

import { FOCUS_CORRECTION_SECONDS_MAX } from "../application/contracts";
import type { FocusCorrectionView, FocusLinkSearchView, FocusLinkView } from "./focus-screen-model";
import { FocusLinkPicker } from "./FocusLinkPicker";
import styles from "./FocusDialogs.module.css";

export function FocusCorrectionDialog({
  completedAtLabel,
  initialDurationSeconds,
  initialLink,
  linkSearch,
  onConfirm,
  onLinkSearch,
  onOpenChange,
  open,
  pending,
  returnFocusRef,
}: Readonly<{
  completedAtLabel: string;
  initialDurationSeconds: number;
  initialLink: FocusLinkView | null;
  linkSearch: FocusLinkSearchView;
  onConfirm: (correction: FocusCorrectionView) => Promise<boolean>;
  onLinkSearch: (query: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}>) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (!next) onLinkSearch("");
        onOpenChange(next);
      }}
    >
      {open ? (
        <FocusCorrectionDialogContent
          completedAtLabel={completedAtLabel}
          initialDurationSeconds={initialDurationSeconds}
          initialLink={initialLink}
          linkSearch={linkSearch}
          onConfirm={onConfirm}
          onLinkSearch={onLinkSearch}
          onOpenChange={onOpenChange}
          pending={pending}
          returnFocusRef={returnFocusRef}
        />
      ) : null}
    </Dialog.Root>
  );
}

function FocusCorrectionDialogContent({
  completedAtLabel,
  initialDurationSeconds,
  initialLink,
  linkSearch,
  onConfirm,
  onLinkSearch,
  onOpenChange,
  pending,
  returnFocusRef,
}: Readonly<{
  completedAtLabel: string;
  initialDurationSeconds: number;
  initialLink: FocusLinkView | null;
  linkSearch: FocusLinkSearchView;
  onConfirm: (correction: FocusCorrectionView) => Promise<boolean>;
  onLinkSearch: (query: string) => void;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}>) {
  const id = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<FocusLinkView | null>(initialLink);
  const [linkChanged, setLinkChanged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const busy = pending || submitting;

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const duration = Number(inputRef.current?.value);
    if (!Number.isInteger(duration) || duration < 0 || duration > FOCUS_CORRECTION_SECONDS_MAX) {
      setError(`Enter a whole number from 0 through ${FOCUS_CORRECTION_SECONDS_MAX}.`);
      return;
    }
    if (busy) return;
    setError(null);
    setSubmitting(true);
    let confirmed = false;
    try {
      confirmed = await onConfirm({
        durationSeconds: duration,
        ...(linkChanged ? { link: link === null ? null : { id: link.id, kind: link.kind } } : {}),
      });
    } catch {
      confirmed = false;
    }
    setSubmitting(false);
    if (!confirmed) {
      setError("The correction was not confirmed. Your draft is still here; review it and try again.");
      return;
    }
    onLinkSearch("");
    onOpenChange(false);
  }

  return (
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content
        className={styles.dialog}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <Dialog.Title>Correct focus duration</Dialog.Title>
        <Dialog.Description>
          Update the session completed {completedAtLabel}. Today and seven-day totals will be recalculated.
        </Dialog.Description>
        <form className={styles.form} onSubmit={submit}>
          <label htmlFor={`${id}-duration`}>Duration (seconds)</label>
          <input
            ref={inputRef}
            id={`${id}-duration`}
            aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
            defaultValue={initialDurationSeconds}
            inputMode="numeric"
            max={FOCUS_CORRECTION_SECONDS_MAX}
            min={0}
            required
            step={1}
            type="number"
            onChange={() => error && setError(null)}
          />
          <p id={`${id}-hint`}>
            Use a whole number of seconds from 0 through {FOCUS_CORRECTION_SECONDS_MAX}.
          </p>
          {error ? (
            <p ref={errorRef} className={styles.error} id={`${id}-error`} role="alert" tabIndex={-1}>
              {error}
            </p>
          ) : null}
          <FocusLinkPicker
            disabled={busy}
            link={link}
            onChange={(next) => {
              setError(null);
              setLink(next);
              setLinkChanged(true);
            }}
            onSearch={onLinkSearch}
            search={linkSearch}
          />
          <div className={styles.actions}>
            <Dialog.Close asChild>
              <button className="secondary-button" type="button" disabled={busy}>
                Cancel
              </button>
            </Dialog.Close>
            <button className="primary-button" type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save correction"}
            </button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
