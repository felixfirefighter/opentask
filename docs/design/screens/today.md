# Today

## Purpose and route

`/today` answers “What can I act on now?” with today's open task occurrences and, after P3, scheduled
habit check-ins in the user's saved timezone. It does not store a separate daily plan, duplicate task
state, or habit streak counters.

The title includes the local weekday/date. A date-boundary or system-timezone refresh updates the
projection without discarding open input.

## Layout

Desktop uses a bounded main column within the standard shell and optional task inspector. Order the work sections:

1. **Overdue** open scheduled task occurrences, when any;
2. **Timed** task occurrences in chronological order;
3. **Anytime** all-day task occurrences;
4. **Habits** scheduled for the local day after P3, with compact boolean/numeric check-in controls.

Hide empty subsections when other work exists. Keep an explicit destination-level empty state when every section is empty. A compact summary reports remaining tasks using text, not a progress ring that implies a score.

Mobile uses one vertical stream. Timed/all-day metadata stays visible; opening a task uses the full-page task detail route.

## Primary actions

- Quick-add a task all-day today by default; a visibly recognized, editable date/time may override
  that default before the atomic create-with-schedule command.
- Complete/undo or skip an occurrence, cancel/restore a series task where allowed, open/edit,
  reschedule, or change priority.
- Check in/edit/undo/skip/unachieved a scheduled habit after P3; numeric habits open a quantity form.
- Navigate to Calendar for range planning or Upcoming for later work.

## State contract

| State | Required presentation |
|---|---|
| Default | Local date, useful summary, non-empty task and active habit sections, quick add, and row/check-in actions. |
| Empty | “Nothing planned for today” with “Add a task” as the primary action and a link to Upcoming when useful. If tasks are empty but habits are scheduled, keep the Habits section rather than showing the page-level empty state. Avoid celebration/shame language. |
| Loading | Keep the date/header stable and show task-row skeletons with one polite status. |
| Error | Keep safe loaded tasks labeled stale, provide a scoped retry, and restore failed optimistic actions with a statement of what was not saved. |
| Offline | Previously loaded tasks remain visible and labeled read-only. Disable mutations under the global offline explanation; do not queue local changes. |
| Permission | Missing internal session routes to direct app launch. A task that is no longer authorized disappears through a safe refresh without revealing owner information. |
| Date changed | Announce that Today moved to the new local date and provide “Return to Today” if the user was editing a stale route state; preserve unsaved quick-add text. |

## Keyboard, touch, and accessibility

- Section headings expose item counts in text and are navigation targets without becoming unnecessary accordions.
- Tab order follows visual chronology; task priority uses a label/icon in addition to color.
- Completing the last row moves focus to the next section heading or empty-state heading and announces Undo.
- Touch targets meet 44 px; no gesture is required.

## Acceptance evidence

Verify one-off/recurring tasks, habits-only, tasks-only, and fully empty days; overdue/timed/all-day
ordering; occurrence and habit actions; local-midnight refresh; error/offline/permission/conflict
states; and task/habit detail focus at 1440, 1024, and 390 px.
