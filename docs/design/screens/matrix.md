# Eisenhower matrix

## Purpose and route

`/matrix` is a derived prioritization view of open task occurrences. It never stores a quadrant,
duplicate priority, occurrence due field, or second schedule. Classification is exactly the rule in
`docs/SCOPE.md` and `docs/modules/planning.md`:

- important = high priority;
- urgent = its derived schedule due boundary is overdue or falls within the user's next 24 hours;
- every task belongs to one of the remaining combinations.

The due boundary is the timed end or exclusive all-day end interpreted at midnight in the user's
saved IANA timezone. For a recurring series, classify its next eligible open occurrence within the
bounded projection and do not render the series twice. The boundary is derived from the canonical
schedule/rule and never persisted as a second field; unscheduled tasks are not urgent.

Use plain secondary labels so the surface is actionable without implying collaboration:

1. **Do now** — Important + urgent;
2. **Plan** — Important + not urgent;
3. **Time-sensitive** — Not important + urgent;
4. **Later** — Not important + not urgent.

## Layout

Desktop uses a 2 by 2 grid of labeled regions below a header that states the local 24-hour boundary. Each quadrant has a title, rule label, task count, and compact task rows. The matrix can fill the work area; selecting a task opens the inspector.

Tablet/mobile stacks quadrants in the order above. A sticky jump control navigates among headings without hiding quadrants. This is a list of four regions, not a visual-only chart.

Rows emphasize title, current schedule, and priority. Never use quadrant background color as the only classification cue. A subtle category surface may distinguish quadrants, but headings/rule labels remain the source of meaning.

## Actions

- Open task details, complete/undo, or cancel/restore through existing task actions.
- Change priority through a labeled menu.
- Change all-day/timed schedule through the canonical schedule form.
- Quick-add is available through the global command palette; the matrix does not guess a quadrant from drop location.

Drag between quadrants is explicitly not part of active scope. Do not render drag handles or empty-zone drop targets.

Changing priority or schedule may move a row to a different quadrant after server confirmation. Announce the destination and move focus to the task in its new quadrant when it remains visible; otherwise move focus to the source heading.

## State contract

| State | Required presentation |
|---|---|
| Default | Four labeled regions, rule explanation, counts, task rows, and priority/schedule menu actions. |
| Empty | An empty quadrant keeps its heading and says “No tasks in this quadrant”. If all four are empty, use one page-level “No open tasks to prioritize” state while retaining the rule explanation and Add task route. |
| Loading | Preserve the 2 by 2/stacked geometry with row skeletons and one page status. Do not show temporary zero counts. |
| Error | Keep safe cached classifications labeled stale, show Retry, and avoid placing partially loaded tasks into a guessed quadrant. Failed mutation restores the row to its authoritative region. |
| Offline | Loaded quadrants remain visible and read-only under the global banner. Disable status, priority, and schedule mutations; navigation/details may remain available. |
| Permission | Unauthenticated access routes to sign-in. Removed/foreign task records disappear without metadata; direct task access uses the generic unavailable state. |
| Conflict | Restore the current server-derived quadrant, identify the task as changed elsewhere, and offer Open details. Do not preserve a stale visual classification. |

## Keyboard, touch, and accessibility

- Headings form a logical `h2` sequence inside the page `h1`; a skip/jump list targets each region.
- Task rows and menus follow the shared component contract.
- Every classification change is possible through labeled menus/forms with keyboard and touch; no drag behavior exists.
- Quadrant identity is included in screen-reader list labels and move announcements.
- At 200% zoom the grid collapses to the stacked layout without horizontal scrolling.

## Acceptance evidence

Verify all four classification combinations, exactly-24-hour/overdue boundaries in the saved timezone, live priority/schedule reclassification, partially and fully empty states, loading/error/offline/permission/conflict, keyboard menus, focus restoration, and 1440/1024/390 px layouts.
