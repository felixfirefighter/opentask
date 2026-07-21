"use client";

import { useMemo, useRef, useState } from "react";

import { isNotificationApiError } from "./data/notification-api-request";
import { useRemoveTaskReminderMutation, useSetTaskReminderMutation } from "./data/use-notification-mutations";
import { useTaskReminderQuery } from "./data/use-notification-queries";
import {
  createReminderDraft,
  parseReminderDraft,
  type ReminderDraft,
  type ReminderKind,
} from "./reminder-form-policy";

export function useTaskReminderController({
  allowedKinds,
  taskId,
  timeZone,
}: Readonly<{ allowedKinds: readonly ReminderKind[]; taskId: string; timeZone: string }>) {
  const query = useTaskReminderQuery(taskId);
  const setReminder = useSetTaskReminderMutation(taskId);
  const removeReminder = useRemoveTaskReminderMutation(taskId);
  const [editing, setEditing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [latestReloaded, setLatestReloaded] = useState(false);
  const [draft, setDraft] = useState<ReminderDraft | null>(null);
  const draftReminderId = useRef<string | null>(null);
  const reminder = query.data ?? null;

  const interpretation = useMemo(
    () => (draft ? parseReminderDraft(draft, timeZone) : null),
    [draft, timeZone],
  );

  function beginEditing() {
    const preferredKind = allowedKinds[0] ?? "absolute";
    const currentDraft = createReminderDraft(reminder, preferredKind, timeZone);
    draftReminderId.current = reminder?.id ?? crypto.randomUUID();
    setDraft(
      allowedKinds.includes(currentDraft.kind)
        ? currentDraft
        : { ...createReminderDraft(null, preferredKind, timeZone), enabled: reminder?.enabled ?? true },
    );
    setEditing(true);
    setConfirmingRemove(false);
    setLatestReloaded(false);
    setReminder.reset();
    removeReminder.reset();
  }

  function cancelEditing() {
    setEditing(false);
    setDraft(null);
    draftReminderId.current = null;
    setLatestReloaded(false);
    setReminder.reset();
    removeReminder.reset();
  }

  async function save() {
    if (!draft || !interpretation?.valid) return;
    setLatestReloaded(false);
    const reminderId = reminder?.id ?? draftReminderId.current ?? crypto.randomUUID();
    draftReminderId.current = reminderId;
    try {
      const saved = await setReminder.mutateAsync({
        id: reminderId,
        expectedVersion: reminder?.version ?? null,
        enabled: draft.enabled,
        spec: interpretation.spec,
      });
      setDraft(createReminderDraft(saved, saved.spec.kind, timeZone));
      draftReminderId.current = saved.id;
      setEditing(false);
      setLatestReloaded(false);
    } catch {
      // The mutation retains the typed error and the form intentionally preserves its draft.
    }
  }

  async function setEnabled(enabled: boolean) {
    if (!reminder) return;
    setLatestReloaded(false);
    try {
      await setReminder.mutateAsync({
        id: reminder.id,
        expectedVersion: reminder.version,
        enabled,
        spec: reminder.spec,
      });
    } catch {
      // The summary remains on the authoritative query value and renders the typed error.
    }
  }

  async function remove() {
    if (!reminder) return;
    setLatestReloaded(false);
    try {
      await removeReminder.mutateAsync(reminder.version);
      setConfirmingRemove(false);
      setEditing(false);
      setDraft(null);
      draftReminderId.current = null;
      setLatestReloaded(false);
    } catch {
      // Keep the explicit confirmation visible so the user can safely retry or cancel.
    }
  }

  const error = setReminder.error ?? removeReminder.error;
  const conflict = isNotificationApiError(error) && error.code === "CONFLICT";

  async function reloadLatest() {
    const latest = await query.refetch();
    if (!latest.isSuccess) return;
    setReminder.reset();
    removeReminder.reset();
    if (latest.data === null) {
      setConfirmingRemove(false);
      setEditing(false);
      setDraft(null);
      draftReminderId.current = null;
    } else {
      draftReminderId.current = latest.data.id;
    }
    setLatestReloaded(true);
  }

  return {
    allowedKinds,
    confirmingRemove,
    conflict,
    latestReloaded,
    draft,
    editing,
    error,
    interpretation,
    pending: setReminder.isPending || removeReminder.isPending,
    query,
    reminder,
    beginEditing,
    cancelEditing,
    remove,
    reloadLatest,
    save,
    setConfirmingRemove,
    setDraft,
    setEnabled,
  };
}
