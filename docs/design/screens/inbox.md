# Inbox, lists, and smart task destinations

## Purpose and routes

This is the fast manual task-management surface. The contract applies to:

- `/inbox` for the immutable personal Inbox;
- `/lists/[listId]` for regular lists and their sections;
- `/upcoming` for the next seven local days;
- `/completed` for completed and cancelled tasks;
- task search results in the same list presentation.

Today and Matrix have their own contracts. These destinations are projections of the same task records.

## Layout

Desktop uses the shell rail/context sidebar, a flexible list work area, and the task inspector when a row is selected. The header shows destination title, task count when useful, overflow actions for mutable lists, and one “Add task” action. Inbox never shows rename, move, or delete controls for the list itself.

Regular lists render optional section headings with counts and section actions. Tasks without a section appear in a clearly labeled unsectioned group only when sections exist. Upcoming groups tasks by local date. Completed/Cancelled groups by status/date and gives restore actions; it does not mix open work into the result.

The mobile route uses the shared top/bottom shell, an inline/collapsible quick add, one scrolling list, and full-page task details. Folder/list management is reached through Tasks navigation and labeled menus, not drag-only gestures.

## Primary actions

- Create a task through quick add with visible editable parsed date/time chips.
- Open details, complete/undo, cancel/restore, soft-delete, edit priority/schedule, move to list/section, and manually reorder where ordering is meaningful.
- Create, rename, and reorder folders/lists/sections; soft-delete folders/lists with immediate Undo; delete sections only when empty; preserve the immutable Inbox.
- Search title, description, and tag name from the global palette/search control.

Reorder uses the component contract and a visible “Move…” fallback. Upcoming, search, and Completed/Cancelled are sorted projections and therefore do not expose arbitrary manual reorder.

## Row behavior

Use the shared task-row anatomy. Show title first, then the minimum context needed for the destination:

- Inbox/list: schedule, recurrence/reminder marker, priority, and tags.
- Upcoming: date/time is the stable leading metadata.
- Search: matching context and source list.
- Completed/Cancelled: status and completion/cancellation time where available.

Selecting a row is visually distinct from completing it. Optimistic changes retain the row in place until the server confirms the destination change, then use a stable transition rather than a sudden page jump.

## State contract

| State | Required presentation |
|---|---|
| Default | Header, quick add, ordered/grouped task rows, and relevant list/section actions. Selected task opens the inspector or mobile detail route. |
| Empty | Name the exact destination: “Inbox is empty”, “No tasks in this list”, “Nothing in the next 7 days”, “No completed or cancelled tasks”, or “No matching tasks”. Offer only an in-scope action such as add task, clear search, or choose another list. |
| Loading | Preserve shell/header and render row-shaped skeletons with a single polite status. Do not display the empty state before the query resolves. |
| Error | Keep any safe cached rows labeled as not refreshed, show a retry banner, and preserve quick-add text. Mutation failure restores the optimistic row and states what was not saved. |
| Offline | Show cached rows as read-only with the global offline banner. Disable quick add, status, reorder, move, and list/section mutations with discoverable explanations. Search may filter only already loaded rows if explicitly labeled “On this screen”; otherwise disable it. |
| Permission | Unauthenticated access routes to sign-in. Missing/foreign list/task identifiers render the same generic unavailable state without leaking title, count, or ownership. |
| Conflict | Preserve unsaved text, refetch the affected row, mark it “Changed elsewhere”, and offer Review latest/Retry rather than silently overwriting. |

## Keyboard and touch parity

- `Mod+K` opens global search/quick add; the visible quick-add control remains available.
- `Enter` on a row opens details; status, menu, and drag handle remain separate stops.
- Section/folder disclosure uses buttons with expanded state and works with Enter/Space.
- Keyboard reorder and “Move…” provide complete parity with pointer drag.
- Touch uses 44 px row action regions; no swipe or long press is required.
- After completion moves a task out of the current projection, focus advances to the next row or the destination heading and an Undo action is announced.

## Acceptance evidence

Verify Inbox, regular list with sections, Upcoming, Completed/Cancelled, and no-results search at 1440, 1024, and 390 px. Cover keyboard creation/reorder/move, touch-sized controls, quick-add token editing, empty/loading/error/offline/permission/conflict states, and inspector focus return.
