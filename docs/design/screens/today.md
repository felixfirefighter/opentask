# Today

## Purpose and route

`/today` answers “What can I act on now?” by combining today's open task projection and scheduled habit check-ins in the user's saved timezone. It does not store a separate daily plan or duplicate task/habit state.

The title includes the local weekday/date and, when useful, a compact timezone indicator. A date-boundary refresh updates the projection without discarding open input.

## Layout

Desktop uses a bounded main column within the standard shell and optional task inspector. Order the work sections:

1. **Overdue** open scheduled tasks, when any;
2. **Timed** tasks in chronological order;
3. **Anytime** all-day tasks;
4. **Habits** scheduled for the local date.

Hide empty subsections when other work exists. Keep an explicit destination-level empty state when every section is empty. A compact summary reports remaining tasks and habits using text, not a progress ring that implies a score.

Mobile uses one vertical stream. Timed/all-day metadata stays visible; habit quantity forms open as an accessible sheet. Opening a task uses the full-page task detail route.

## Primary actions

- Quick-add a task scheduled to today by default; recognized time remains editable.
- Complete/undo, cancel/restore, open/edit, reschedule, change priority, or start focus from a task.
- Check in/undo, enter numeric quantity and note, skip, or mark unachieved for a habit.
- Navigate to Calendar for range planning or Habits for configuration.

Completing a recurring task affects only the current occurrence. Archiving/configuring habits happens in the Habits screen, not through an overloaded Today row.

## State contract

| State | Required presentation |
|---|---|
| Default | Local date, useful summary, non-empty task sections, scheduled habit section, quick add, and row actions. |
| Empty | “Nothing planned for today” with “Add a task” as the primary action and links to Upcoming or Habits only when useful. Avoid celebration/shame language. |
| Loading | Keep the date/header stable. Use separate task and habit skeleton groups so one query can resolve without blocking the other; announce completion once. |
| Error | Identify whether tasks, habits, or both failed. Keep successfully loaded sections usable and provide a scoped retry. Failed optimistic actions restore the row and say what was not saved. |
| Offline | Previously loaded sections remain visible and labeled read-only. Disable task/habit/focus mutations under the global offline explanation; do not queue local check-ins. |
| Permission | Unauthenticated access routes to sign-in. A linked task/habit that is no longer authorized disappears through a safe refresh without revealing owner information. |
| Date changed | Announce that Today moved to the new local date and provide “Return to Today” if the user was editing a stale route state; preserve unsaved quick-add text. |

## Keyboard, touch, and accessibility

- Section headings expose item counts in text and are navigation targets without becoming unnecessary accordions.
- Tab order follows visual chronology. Starting focus from a row is a labeled menu/action, not hidden behind hover.
- Habit status and task priority use labels/icons in addition to color.
- Quantity/note validation returns focus to the field and preserves input.
- Completing the last row moves focus to the next section heading or empty-state heading and announces Undo.
- Touch targets meet 44 px; no gesture is required.

## Acceptance evidence

Verify mixed, tasks-only, habits-only, and fully empty days; overdue/timed/all-day ordering; recurring completion; numeric habit entry; local-midnight refresh; partial error; offline state; and task-inspector focus at 1440, 1024, and 390 px.
