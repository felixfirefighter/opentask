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
  its series task ID and opaque `occurrenceKey`; non-recurring rows omit it.

## Invariants

- Every surface projects canonical task rows and tasks-owned occurrence state; it never stores or
  invents a second status, priority, schedule, recurrence rule, or occurrence state.
- Calendar and agenda queries require explicit finite ranges and preserve the tasks module's range,
  row-cap, and truncation contract.
- Local-day boundaries and “next seven days” use saved user timezone/week preferences.
- Eisenhower `important` means high priority. `urgent` means the derived schedule/occurrence boundary
  is overdue or falls within the user's next 24 hours; unscheduled tasks are not urgent. Other
  combinations map to the remaining quadrants. The derived boundary is never persisted as a second
  due field.
- Calendar drag/resize ultimately calls the same versioned tasks schedule command as keyboard/touch editing.
- Every drag/resize action has a visible non-drag alternative.
- Complete, skip, and undo actions on a recurring row call the tasks occurrence commands with both
  task ID and occurrence identity; they never transition the series task as a substitute.
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
