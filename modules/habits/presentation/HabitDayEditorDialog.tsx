"use client";

import * as Dialog from "@radix-ui/react-dialog";

import type { HabitGoal, HabitLogValue } from "../application/contracts";
import { HabitDayEditorContent, type HabitDayEditorContentProps } from "./HabitDayEditorContent";

export function HabitDayEditorDialog({
  conflictPendingReview = false,
  errorMessage,
  goal,
  initialValue,
  localDate,
  onOpenChange,
  onReviewLatest,
  onSubmit,
  open,
  pending,
  title,
  writeDisabled = false,
}: Readonly<{
  conflictPendingReview?: boolean;
  errorMessage?: string | null | undefined;
  goal: HabitGoal;
  initialValue?: HabitLogValue | null | undefined;
  localDate: string;
  onOpenChange: (open: boolean) => void;
  onReviewLatest?: (() => Promise<HabitLogValue | null>) | undefined;
  onSubmit: (value: HabitLogValue) => void;
  open: boolean;
  pending: boolean;
  title: string;
  writeDisabled?: boolean;
}>) {
  const contentProps: HabitDayEditorContentProps = {
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
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      {open ? <HabitDayEditorContent {...contentProps} /> : null}
    </Dialog.Root>
  );
}
