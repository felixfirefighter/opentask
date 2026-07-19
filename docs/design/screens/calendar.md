# Calendar

## Purpose and route

`/calendar` is an active planning projection of task schedules. It supports month, week, day, and agenda views using the same task records as lists. It does not include external calendars, an unscheduled backlog, a year/multi-week view, or premium FullCalendar features.

Queries are bounded to the visible range plus the minimum expansion buffer required by the current view.

## Layout

The screen header contains:

- previous, Today, and next navigation;
- current range label;
- Month, Week, Day, and Agenda view control;
- one “Add task” action.

Desktop gives the calendar the full work area; selecting an event opens the task inspector. Month uses a standard grid, Week/Day use a time grid, and Agenda is an ordered accessible list by local date/time.

At compact desktop/tablet the inspector overlays. On mobile, Agenda is the first safe fallback for a new visit, while the saved view remains respected. Month remains available with abbreviated visual labels and full accessible names. Week/Day may scroll within the time grid; the page itself must not acquire a second horizontal scroll. Selecting an event opens full-page task details.

## Event presentation

- All-day tasks occupy the all-day area/date cell; timed tasks use start/end placement.
- Event block shows time when useful, title, status, and list/category context.
- Category token uses its paired readable foreground; selection adds outline and does not rely on color.
- Overdue/open and completed/cancelled states include text/icon/decoration beyond color.
- Overlapping events remain individually focusable and legible; no hidden aggregate is the only access path.

## Actions

- Navigate date range and switch the four committed views.
- Open/create/edit a task through task details.
- Pointer-drag a scheduled task to a valid date/time and resize a timed task.
- Use “Edit schedule” in the event menu/inspector for complete keyboard and touch parity.

Drag/resize uses optimistic feedback only after a clear drop. On server rejection/conflict, restore the event to its authoritative slot, retain focus, and state what was not saved. Invalid all-day/timed mixtures are never presented as droppable results.

## State contract

| State | Required presentation |
|---|---|
| Default | Toolbar, visible-range calendar, task events, current-day marker, and task inspector/detail behavior. |
| Empty | Keep the full calendar orientation and say “No scheduled tasks in this range” near the grid/agenda with Add task. Empty is never a blank white canvas. |
| Loading | Preserve toolbar/range/grid geometry and show a subtle overlay or event skeletons; navigation remains stable and duplicate range requests do not flash empty state. |
| Error | Keep the range and safe loaded events labeled as stale, show Retry, and avoid rendering a partial range as authoritative. Failed drag/resize snaps back with a named error. |
| Offline | The range already loaded in the open page is read-only under the global banner. Range navigation is unavailable without a connection. Disable create, drag, resize, and schedule edits. |
| Permission | Unauthenticated access routes to sign-in. Events disappearing due to authorization refresh leave no metadata. Foreign/deleted event routes use generic unavailable detail state. |
| Conflict | Restore the current server slot, outline the affected event, and offer Open details to review latest values. Do not choose local or server time silently. |

## Keyboard and touch parity

- Toolbar order follows previous/Today/next, range, view selector, Add task.
- Users can reach each event, hear full title/date/time/status, and open details with Enter.
- Agenda is the complete non-grid representation and never omits events shown in the visual range.
- No keyboard user must simulate drag: Edit schedule exposes the exact date, start, end, all-day, and timezone controls.
- Touch users open events and edit schedules through forms; long press/drag is optional enhancement only.
- Range/view changes announce the new view and date range without moving focus unexpectedly.

## Acceptance evidence

Verify all four views, all-day/timed/overlapping events, bounded navigation, local DST transition, drag and resize success/failure/conflict, form-based schedule parity, empty/loading/error/offline/permission states, event focus, and mobile time-grid/agenda behavior at the required widths.
