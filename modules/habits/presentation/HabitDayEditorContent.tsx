"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import type { HabitGoal, HabitLogValue } from "../application/contracts";
import { reconcileHabitDraft } from "./habit-draft-reconciliation";
import {
  habitDayDraftFromValue,
  habitDayValueFromDraft,
  type HabitDayValidation,
} from "./habit-day-editor-policy";
import { HabitDayEditorForm } from "./HabitDayEditorForm";
import styles from "./HabitDayEditorDialog.module.css";
import { fullLocalDate } from "./habit-view-model";

export type HabitDayEditorContentProps = Readonly<{
  conflictPendingReview: boolean;
  errorMessage?: string | null | undefined;
  goal: HabitGoal;
  initialValue?: HabitLogValue | null | undefined;
  localDate: string;
  onOpenChange: (open: boolean) => void;
  onReviewLatest?: (() => Promise<HabitLogValue | null>) | undefined;
  onSubmit: (value: HabitLogValue) => void;
  pending: boolean;
  title: string;
  writeDisabled: boolean;
}>;

export function HabitDayEditorContent({
  conflictPendingReview,
  errorMessage,
  goal,
  initialValue,
  localDate,
  onOpenChange,
  onReviewLatest,
  onSubmit,
  pending,
  title,
  writeDisabled,
}: HabitDayEditorContentProps) {
  const [draft, setDraft] = useState(() => habitDayDraftFromValue(initialValue, goal));
  const [baseDraft, setBaseDraft] = useState(() => habitDayDraftFromValue(initialValue, goal));
  const [validation, setValidation] = useState<HabitDayValidation | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [reviewedLatest, setReviewedLatest] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const errorId = "habit-day-editor-error";

  const reviewRequired = conflictPendingReview && !reviewedLatest;

  useEffect(() => {
    if (errorMessage) requestAnimationFrame(() => summaryRef.current?.focus());
  }, [errorMessage]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || writeDisabled || reviewRequired || reviewing) return;
    const value = habitDayValueFromDraft(draft, goal);
    if (!value.success) {
      setValidation({ field: value.field, message: value.message });
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setValidation(null);
    setReviewedLatest(false);
    onSubmit(value.value);
  }

  async function reviewLatest() {
    if (!onReviewLatest || reviewing) return;
    setReviewing(true);
    setReviewMessage(null);
    try {
      const latest = habitDayDraftFromValue(await onReviewLatest(), goal);
      setDraft((current) => reconcileHabitDraft(baseDraft, current, latest));
      setBaseDraft(latest);
      setReviewedLatest(true);
      setValidation(null);
    } catch {
      setReviewMessage("The latest check-in could not be loaded. Reconnect and review again before saving.");
      requestAnimationFrame(() => summaryRef.current?.focus());
    } finally {
      setReviewing(false);
    }
  }

  const displayedError =
    validation?.message ??
    reviewMessage ??
    errorMessage ??
    (reviewRequired ? "This check-in changed elsewhere. Review latest before saving again." : null);
  const saveDisabled = pending || writeDisabled || reviewRequired || reviewing;

  return (
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content className={styles.dialog} aria-describedby="habit-day-description">
        <header>
          <div>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Description id="habit-day-description">{fullLocalDate(localDate)}</Dialog.Description>
          </div>
          <Dialog.Close className={styles.close} aria-label="Close check-in editor" disabled={pending}>
            <X size={18} aria-hidden="true" />
          </Dialog.Close>
        </header>
        <HabitDayEditorForm
          displayedError={displayedError}
          draft={draft}
          errorId={errorId}
          goal={goal}
          onCancel={() => onOpenChange(false)}
          onDraftChange={setDraft}
          onReviewLatest={onReviewLatest ? reviewLatest : undefined}
          onSubmit={submit}
          pending={pending}
          reviewRequired={reviewRequired}
          reviewing={reviewing}
          saveDisabled={saveDisabled}
          summaryRef={summaryRef}
          validation={validation}
          writeDisabled={writeDisabled}
        />
      </Dialog.Content>
    </Dialog.Portal>
  );
}
