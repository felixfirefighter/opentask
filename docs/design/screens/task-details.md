# Task details

## Purpose and routes

Task details is the canonical editor for a task and the accessible alternative to every compact/drag interaction. On large desktop it appears in the 360 px inspector; at 1024–1279 px and tablet it is a right/full-height sheet; on mobile it is `/tasks/[taskId]` as a full page.

Creating a richer task may use the same form in create mode. One level of full-feature subtasks is supported; subtasks cannot contain further subtasks.

## Information architecture

Sticky header:

- status control and status text;
- compact task context/title when the editable title has scrolled;
- close/back and overflow actions.

Body order:

1. editable title;
2. schedule: all-day date or timed start/end and IANA timezone;
3. optional approved recurrence preset/end behavior for an eligible scheduled root task;
4. optional one-task reminder, including capability/degraded explanation;
5. priority, list, section, and tags;
6. one-level subtasks and lightweight checklist;
7. Markdown description with safe preview;
8. status/occurrence metadata limited to values in current scope.

Never show attachments, comments, assignees, activity history, templates, estimates, or custom
fields.

## Actions and save behavior

- Edit fields, complete/undo or skip/reopen an occurrence, cancel/restore, move, and soft-delete.
- Opening a projected occurrence carries only its opaque identity; task details resolves its
  authoritative date/time and effective state server-side, labels that selected occurrence, and
  keeps Complete/Skip/Undo scoped to it. Cross-local-date timed occurrences name both dates;
  multi-day all-day occurrences name their inclusive displayed range. Invalid or foreign identities
  reveal no occurrence data.
  A recorded key outside the current rule remains visible as preserved read-only history after Undo;
  Complete/Skip are offered only when the server marks the open occurrence transition-eligible.
  Terminal history offers Undo only while the owning series task is open; completed or cancelled
  owners show honest read-only guidance until the task is reopened or restored to an open state.
  Deleted owners use the generic unavailable treatment defined below.
- Edit/end a recurrence series for future expansion only; no individual occurrence reschedule,
  recurring checklist state, raw RRULE, or “this and future” fork.
- The recurring schedule editor keeps its all-day or specific-time type fixed. To change type, end
  recurrence and clear the ended definition with its schedule before adding a new schedule.
- Recurrence offers only Daily, Weekdays, selected-weekday Weekly, anchor-day Monthly, and
  anchor-month/day Yearly, with interval, inclusive end date, or count inside the documented bounds.
  The interpreted cadence/timezone/end is visible before commit. Weekday mismatch, recurring
  duration, DST-fold-anchor, and exhausted-rule errors preserve every entered value.
- Completing the series task and clearing its schedule are unavailable until the user explicitly
  ends recurrence. Cancel/delete may keep the definition dormant; reopening/restoring resumes from
  a server-chosen future occurrence and states that dormant missed occurrences were not recreated.
  End recurrence confirms that future expansion stops at a server-chosen exclusive boundary while
  the ended definition and recorded occurrence history remain. Completing is then available; clearing
  its schedule removes the ended definition and schedule atomically without deleting event history.
- Set, replace, enable/disable, or remove one absolute reminder for an eligible non-recurring task or
  one relative-start reminder for an eligible start. A recurring task requires relative-start; a
  non-recurring all-day task offers absolute only because it has no persisted reminder-intent
  timezone. The form explains the derived instant before submit and rejects a past/equal-now result.
  Permission enrollment remains a separate Settings action.
- Adding recurrence while an absolute reminder exists opens one explicit reviewed choice: convert it
  to a valid relative-start offset or remove it in the same transaction. Cancel preserves both the
  recurrence draft and existing reminder. Nothing silently reinterprets the instant. An ended
  retained recurrence remains relative-only until its definition and schedule clear.
- Field commits show Saving/Saved/Error close to the changed group. A changed row version triggers the conflict state before any overwrite.
- Soft-delete exits the inspector/route only after confirmation and server success.

Subtasks reuse the full task editor at one level and display a clear “Subtasks cannot be nested” boundary instead of a dead Add action. Checklist items have label, checked state, reorder, and remove only.

## Responsive behavior

- Large desktop inspector keeps high-frequency fields visible and uses compact popovers for simple choices.
- Sheets/full page use a single column, sticky top bar, and full-width schedule forms rather than nested popovers that exceed the viewport.
- The mobile keyboard never covers the active field or final dialog actions.
- Closing/back with unsaved or failed input asks whether to keep editing; confirmed server-saved edits do not require a redundant Save button.

## State contract

| State | Required presentation |
|---|---|
| Default | Loaded editable fields, explicit status, canonical schedule controls, and save feedback near changed groups. |
| Empty | With no desktop selection, the inspector is absent rather than showing a permanent placeholder. Empty description/checklist/subtask areas show one quiet Add action. Create mode starts with a labeled blank title field. |
| Loading | Inspector/sheet geometry appears immediately with field-shaped skeletons and a named status. Mobile retains a usable Back action. |
| Error | Initial load shows generic unavailable + retry/close. Field failure preserves input and identifies the unsaved field. Soft-delete failure leaves the task open and unchanged. |
| Offline | Details already loaded in the open page are read-only under the global banner. All mutations, including status and checklist changes, are disabled with one explanatory message; no unsynced draft is described as saved. |
| Permission | Missing, deleted, or foreign IDs use the same generic unavailable treatment. No title, list, or existence metadata leaks. |
| Conflict | Freeze further autosaves for the affected field, preserve the user's value, show before/latest values, and offer Keep editing, Use latest, or retry through a validated conflict flow. Never last-write-wins silently. |

The reminder group independently represents no reminder, enabled, disabled, saving, provider/
enrollment unavailable, offline, validation error, permission-safe unavailable task, and
version-conflict states. Provider or subscription absence explains that delivery cannot occur but
does not hide or corrupt a saved reminder specification. A reminder conflict preserves the draft,
reloads the authoritative version, and requires explicit retry. A saved reminder whose task is
terminal/deleted, whose relative schedule is absent, or whose recurrence is exhausted is shown as
dormant with the exact reason: its definition and enabled choice are retained, missed instants will
not be caught up, and only an explicit reminder action disables or removes it.

A lost or unreadable create, replace, enable/disable, or remove response is labeled unconfirmed,
never described as unchanged. The panel retains the pending command state, offers **Check saved
reminder**, and reloads the actor-scoped reminder before the next action; exact command replay is
idempotent whether the original write committed or not. A typed version conflict uses the separate
**Load latest reminder** path.

A browser-local push subscription is reported as unverified after reload until Settings explicitly
associates it with the current account; task details never infer enrollment from `PushManager` alone.

Recurrence create/edit/end and recurring schedule changes use an explicit submit boundary rather
than per-field autosave because the rule, cutover, and task version commit atomically. A response-lost
result keeps the draft, reloads authoritative series state, and only offers exact retry when the
server did not apply it.

Occurrence commands use the same authoritative recovery standard. The panel re-resolves the exact
actor-scoped key after task or series version changes. A response-lost result is called unconfirmed,
retains the exact versioned command for idempotent retry, and keeps ordinary transitions gated until
the user retries it or explicitly continues from the freshly loaded server state.

## Keyboard, touch, and accessibility

- Focus enters at the `h1`/title context and returns to the selected row on close.
- Every field has a visible label; grouped date/time inputs expose the plain-language interpreted result.
- Status, date, priority, list, and overflow menus implement full keyboard patterns.
- Reordering subtasks/checklist uses keyboard drag plus “Move…” controls and live announcements.
- Markdown preview maintains heading/link/list semantics; raw HTML is not rendered.
- Save and conflict changes are announced without announcing every keystroke.

## Acceptance evidence

Cover create/edit, all status/occurrence transitions, all-day/timed timezone forms, recurrence
presets/edit/end, reminder eligible/degraded/remove, tags/list/section, subtask depth boundary,
checklist reorder, Markdown rendering, soft delete, conflict recovery, offline, and unauthorized IDs
across inspector/sheet/mobile route.
