# Planning module contract

`modules/planning` owns read-only task-planning projections and the deterministic interval scheduler. It stores no duplicate task or planner state.

## Responsibilities

- Today and Upcoming seven-day projections.
- Range-bounded calendar month, week/day, and agenda projections over one-off schedules and recurring
  occurrences.
- Range-bounded timed busy-interval reads, including recurring occurrences, for the assistant's
  deterministic planner context.
- Eisenhower quadrant projection and accessible priority/schedule actions through tasks commands.
- Deterministic allocation of proposed work into free intervals for the assistant.

## Owned persistence

- None. PostgreSQL rows remain owned by tasks, identity, and assistant.
- No materialized projection, calendar-event, quadrant, or schedule-plan table may be added in the active release.

## Public use cases and contracts

- `getSmartDestination(actor, destination, localNow)` returns a bounded task projection.
- `getCalendarRange(actor, range)` and `getAgendaRange(actor, range)` return calendar event DTOs.
- `getEisenhower(actor, localNow)` returns four derived quadrants.
- `getToday(actor, localDate)` returns due task rows without persisting a combined view.
- `getBusyIntervals(actor, range)` returns authorized timed task/occurrence intervals for a finite
  planning window; all-day due boundaries are not treated as occupied time.
- `buildDeterministicPlan(input)` returns placed blocks, overflow, and conflicts without writing.
- Public contracts: `PlanningTaskRow`, `CalendarEventDto`, `AgendaRow`, `EisenhowerProjection`,
  `BusyInterval`, `SchedulingInput`, and `SchedulingResult`. A projected recurring row/event carries
  its series task ID, opaque `occurrenceKey`, and effective `occurrenceState`; a recurrence-summary
  Matrix row with no occurrence in the bounded horizon omits only the key/state. Non-recurring rows
  omit all recurrence fields. `PlanningTaskRow.id` is the one canonical series task ID and
  `projectionId` is the distinct render identity; rows do not duplicate `id` under a `taskId` alias.
  Calendar events use `taskId` because their `projectionId` is the event identity.

## Invariants

- Every surface projects canonical task rows and tasks-owned occurrence state; it never stores or
  invents a second status, priority, schedule, recurrence rule, or occurrence state.
- Calendar and agenda queries require explicit finite ranges and preserve the tasks module's range,
  row-cap, and truncation contract.
- Local-day boundaries and “next seven days” use saved user timezone/week preferences.
- Today preserves the existing unbounded-through-today one-off overdue read, while its separate
  recurring read expands only occurrences overlapping the current local day and pads backward by the
  maximum recurring duration. It does not accumulate a historical backlog of missed recurring
  occurrences; an occurrence whose due boundary passed earlier today is still overdue. Upcoming
  exposes open occurrences in its next seven local days. Calendar and Agenda expose open, completed,
  and skipped occurrences in the requested range so state and Undo remain discoverable.
- Eisenhower `important` means high priority. `urgent` means the derived schedule/occurrence boundary
  is overdue or falls within the user's next 24 hours; unscheduled tasks are not urgent. Other
  combinations map to the remaining quadrants. The derived boundary is never persisted as a second
  due field. Matrix performs two independently capped half-open reads and propagates truncation from
  either: an overlap read `[today - 31 local days, today)` and a forward read
  `[today, today + 62 local days)`, with paired instant bounds derived from saved user timezone. It
  discards overlap rows whose end boundary is at or before today's start, merges by task plus
  occurrence key, and classifies the earliest eligible open occurrence. The lookback catches a long
  occurrence due today/within 24 hours without creating historical backlog, while the forward read is
  exactly 62 local days rather than 63. When no occurrence exists in the forward horizon or overlaps
  today, render the series once as nonurgent with “No occurrence in the next 62 days”; priority alone
  chooses Plan or Later.
- Calendar drag/resize ultimately calls the same versioned tasks schedule command as keyboard/touch
  editing for one-off tasks. Recurring events do not expose drag/resize because per-occurrence
  overrides are excluded; their labeled form action edits the future series schedule atomically.
- Every drag/resize action has a visible non-drag alternative.
- Complete, skip, and undo actions on a recurring row call the tasks occurrence commands with both
  task ID and occurrence identity; they never transition the series task as a substitute.
- Planner busy context contains open timed occurrences only. Completed/skipped occurrences and
  all-day boundaries do not occupy time. A truncated tasks occurrence read fails proposal creation
  with an explicit incomplete-context result; deterministic planning never proceeds on a partial
  calendar.
- The deterministic scheduler alone owns overlap, work-window, buffer, and overflow decisions. Given the same normalized input, it returns the same result.
- Scheduler output contains semantic references supplied by the caller, never trusted database ownership claims, and performs no write.

## Dependencies

- Public tasks query/mutation contracts.
- Public identity preferences reader.
- `shared/time`, `shared/validation`, and generic presentation primitives.
- FullCalendar standard/MIT packages only in presentation.

## Non-responsibilities

- Inbox, regular-list, or Completed/Cancelled task projections; task search, quick add, and the task-backed global palette.
- Task, recurrence, occurrence, habit, or proposal persistence.
- OpenAI calls, proposal review/apply, reminder delivery, external calendars, saved filters, Kanban, timeline/Gantt, or multi-week/year views.
- Autonomous rescheduling or background planning.

## Required tests

- Smart-destination boundary tests in the user's local timezone, including a documented DST transition.
- Finite-range calendar/agenda tests for all-day, timed, overlapping, empty, and boundary ranges.
- Finite-range recurring projection tests for completion/skip/undo state, truncation, rule edits,
  DST, month-end, and stable occurrence identity across Today/Upcoming/Calendar/Agenda/Matrix.
- Planner-context fixtures proving recurring timed occurrences are busy, skipped occurrences are
  absent, and all-day due boundaries remain non-blocking.
- Eisenhower tests at overdue, exactly-24-hour, priority, unscheduled, completed, and cancelled boundaries.
- Deterministic scheduler golden fixtures for fixed busy intervals, buffers, overflow, impossible constraints, and repeatability.
- Integration tests proving calendar/matrix actions mutate canonical tasks and surface version conflicts.
- Keyboard/touch parity and range-bounded query E2E tests.
