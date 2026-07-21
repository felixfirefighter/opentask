"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/shared/presentation";

import type { CreateHabitRequest } from "../application/contracts";
import { reconcileHabitDraft } from "./habit-draft-reconciliation";
import { HabitFormFields } from "./HabitFormFields";
import { parseHabitDraft, type HabitFormDraft } from "./habit-form-policy";
import styles from "./HabitEditorDialog.module.css";

export function HabitEditorDialog({
  conflictPendingReview = false,
  errorMessage,
  fieldsDisabled = false,
  initialDraft,
  mode,
  onOpenChange,
  onReviewLatest,
  onSubmit,
  open,
  pending,
  uncertainOutcome = false,
  writeDisabled = false,
  writeDisabledReason,
}: Readonly<{
  conflictPendingReview?: boolean;
  errorMessage?: string | null | undefined;
  fieldsDisabled?: boolean;
  initialDraft: HabitFormDraft;
  mode: "create" | "edit";
  onOpenChange: (open: boolean) => void;
  onReviewLatest?: (() => Promise<HabitFormDraft>) | undefined;
  onSubmit: (input: CreateHabitRequest, draft: HabitFormDraft) => void;
  open: boolean;
  pending: boolean;
  uncertainOutcome?: boolean;
  writeDisabled?: boolean;
  writeDisabledReason?: string | undefined;
}>) {
  const title = mode === "create" ? "Create habit" : "Edit habit";
  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !pending && onOpenChange(nextOpen)}>
      {open ? (
        <HabitEditorContent
          conflictPendingReview={conflictPendingReview}
          errorMessage={errorMessage}
          fieldsDisabled={fieldsDisabled}
          initialDraft={initialDraft}
          mode={mode}
          onOpenChange={onOpenChange}
          onReviewLatest={onReviewLatest}
          onSubmit={onSubmit}
          pending={pending}
          title={title}
          uncertainOutcome={uncertainOutcome}
          writeDisabled={writeDisabled}
          writeDisabledReason={writeDisabledReason}
        />
      ) : null}
    </Dialog.Root>
  );
}

function HabitEditorContent({
  conflictPendingReview,
  errorMessage,
  fieldsDisabled,
  initialDraft,
  mode,
  onOpenChange,
  onReviewLatest,
  onSubmit,
  pending,
  title,
  uncertainOutcome,
  writeDisabled,
  writeDisabledReason,
}: Readonly<{
  conflictPendingReview: boolean;
  errorMessage?: string | null | undefined;
  fieldsDisabled: boolean;
  initialDraft: HabitFormDraft;
  mode: "create" | "edit";
  onOpenChange: (open: boolean) => void;
  onReviewLatest?: (() => Promise<HabitFormDraft>) | undefined;
  onSubmit: (input: CreateHabitRequest, draft: HabitFormDraft) => void;
  pending: boolean;
  title: string;
  uncertainOutcome: boolean;
  writeDisabled: boolean;
  writeDisabledReason?: string | undefined;
}>) {
  const [draft, setDraft] = useState(initialDraft);
  const [baseDraft, setBaseDraft] = useState(initialDraft);
  const [fieldError, setFieldError] = useState<keyof HabitFormDraft | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [reviewedLatest, setReviewedLatest] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const errorSummaryId = "habit-editor-error-summary";

  useEffect(() => {
    if (errorMessage) requestAnimationFrame(() => summaryRef.current?.focus());
  }, [errorMessage]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending || writeDisabled || reviewRequired || reviewing) return;
    const parsed = parseHabitDraft(draft);
    if (!parsed.success) {
      setFieldError(parsed.field);
      setValidationMessage(parsed.message);
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setFieldError(null);
    setValidationMessage(null);
    setReviewedLatest(false);
    onSubmit(parsed.value, draft);
  }

  async function reviewLatest() {
    if (!onReviewLatest || reviewing) return;
    setReviewing(true);
    setReviewMessage(null);
    try {
      const latest = await onReviewLatest();
      setDraft((current) => reconcileHabitDraft(baseDraft, current, latest));
      setBaseDraft(latest);
      setReviewedLatest(true);
      setFieldError(null);
      setValidationMessage(null);
    } catch {
      setReviewMessage("The latest habit could not be loaded. Reconnect and review again before saving.");
      requestAnimationFrame(() => summaryRef.current?.focus());
    } finally {
      setReviewing(false);
    }
  }

  const reviewRequired = conflictPendingReview && !reviewedLatest;
  const displayedError =
    validationMessage ??
    reviewMessage ??
    errorMessage ??
    (reviewRequired ? "This habit changed elsewhere. Review latest before saving again." : null);
  const saveDisabled = pending || writeDisabled || reviewRequired || reviewing;

  return (
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content className={styles.dialog} aria-describedby="habit-editor-description">
        <header className={styles.header}>
          <div>
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Description id="habit-editor-description">
              Choose one goal and one supported schedule. Existing history is never rewritten.
            </Dialog.Description>
          </div>
          <Dialog.Close
            className={styles.close}
            aria-label={`Close ${title.toLocaleLowerCase()}`}
            disabled={pending}
          >
            <X size={18} aria-hidden="true" />
          </Dialog.Close>
        </header>
        <form onSubmit={submit} noValidate>
          {displayedError ? (
            <div
              className={styles.errorSummary}
              id={errorSummaryId}
              ref={summaryRef}
              role="alert"
              tabIndex={-1}
            >
              <strong>{validationMessage ? "Review the highlighted field" : "Changes were not saved"}</strong>
              <span>{displayedError}</span>
              {reviewRequired && onReviewLatest ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={reviewing || writeDisabled}
                  onClick={reviewLatest}
                >
                  {reviewing ? "Loading latest…" : "Review latest in this form"}
                </Button>
              ) : null}
            </div>
          ) : null}
          {writeDisabled ? (
            <p className={styles.writeDisabled} role="status">
              {writeDisabledReason ??
                "Reconnect before saving. You can still review this draft or close the editor."}
            </p>
          ) : null}
          <HabitFormFields
            disabled={fieldsDisabled}
            draft={draft}
            errorField={fieldError}
            errorMessageId={validationMessage ? errorSummaryId : undefined}
            setDraft={setDraft}
          />
          <footer className={styles.footer}>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
              {uncertainOutcome && errorMessage ? "Close and review habits" : "Cancel"}
            </Button>
            <Button type="submit" disabled={saveDisabled}>
              {pending
                ? "Saving habit…"
                : uncertainOutcome
                  ? "Retry unchanged habit"
                  : mode === "create"
                    ? "Create habit"
                    : "Save habit"}
            </Button>
          </footer>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
