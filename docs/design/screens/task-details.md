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
3. recurrence: daily, weekdays, selected weekly days, or monthly day-of-month;
4. one reminder: absolute or relative to timed start, with capability status;
5. priority, list, section, and tags;
6. one-level subtasks and lightweight checklist;
7. Markdown description with safe preview;
8. status/history-adjacent metadata limited to values in active scope.

Do not show attachments, comments, assignees, activity history, templates, estimates, custom fields, multiple reminders, or advanced recurrence controls.

## Actions and save behavior

- Edit fields, complete/undo, cancel/restore, move, and soft-delete.
- For a recurring occurrence, clearly distinguish “This occurrence” actions from editing the future series. Unsupported future-instance overrides never appear.
- Field commits show Saving/Saved/Error close to the changed group. A changed row version triggers the conflict state before any overwrite.
- Soft-delete exits the inspector/route only after confirmation and server success.
- Push permission is requested only from an explicit reminder action; blocked/unconfigured push does not prevent saving the task schedule.

Subtasks reuse the full task editor at one level and display a clear “Subtasks cannot be nested” boundary instead of a dead Add action. Checklist items have label, checked state, reorder, and remove only.

## Responsive behavior

- Large desktop inspector keeps high-frequency fields visible and uses compact popovers for simple choices.
- Sheets/full page use a single column, sticky top bar, and full-width date/recurrence forms rather than nested popovers that exceed the viewport.
- The mobile keyboard never covers the active field or final dialog actions.
- Closing/back with unsaved or failed input asks whether to keep editing; confirmed server-saved edits do not require a redundant Save button.

## State contract

| State | Required presentation |
|---|---|
| Default | Loaded editable fields, explicit status, capability-aware reminder control, and save feedback near changed groups. |
| Empty | With no desktop selection, the inspector is absent rather than showing a permanent placeholder. Empty description/checklist/subtask areas show one quiet Add action. Create mode starts with a labeled blank title field. |
| Loading | Inspector/sheet geometry appears immediately with field-shaped skeletons and a named status. Mobile retains a usable Back action. |
| Error | Initial load shows generic unavailable + retry/close. Field failure preserves input and identifies the unsaved field. Soft-delete failure leaves the task open and unchanged. |
| Offline | Cached details are read-only under the global banner. All mutations, including status and checklist changes, are disabled with one explanatory message; no unsynced draft is described as saved. |
| Permission | Missing, deleted, or foreign IDs use the same generic unavailable treatment. No title, list, reminder, or existence metadata leaks. |
| Conflict | Freeze further autosaves for the affected field, preserve the user's value, show before/latest values, and offer Keep editing, Use latest, or retry through a validated conflict flow. Never last-write-wins silently. |
| Reminder unavailable | Distinguish unscheduled task, unsupported browser, denied permission, missing subscription, and unavailable worker. Keep a visible route to browser/settings help where relevant. |

## Keyboard, touch, and accessibility

- Focus enters at the `h1`/title context and returns to the selected row on close.
- Every field has a visible label; grouped date/time and recurrence inputs expose the plain-language interpreted result.
- Status, date, priority, list, and overflow menus implement full keyboard patterns.
- Reordering subtasks/checklist uses keyboard drag plus “Move…” controls and live announcements.
- Markdown preview maintains heading/link/list semantics; raw HTML is not rendered.
- Save, conflict, recurring-occurrence, and reminder-permission changes are announced without announcing every keystroke.

## Acceptance evidence

Cover create/edit, all status transitions, all-day/timed timezone forms, each supported recurrence preset, current-occurrence completion/skip, each reminder capability state, tags/list/section, subtask depth boundary, checklist reorder, Markdown rendering, soft delete, conflict recovery, offline, and unauthorized IDs across inspector/sheet/mobile route.
