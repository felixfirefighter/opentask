# Planning module contract

`modules/planning` owns read-only planning projections and the deterministic interval scheduler. It stores no duplicate task, habit, or planner state.

## Responsibilities

- Inbox, Today, Upcoming seven-day, and Completed/Cancelled projections.
- Range-bounded calendar month, week/day, and agenda projections with recurrence expansion and occurrence-event overlays.
- Eisenhower quadrant projection and accessible priority/schedule actions through tasks commands.
- Global destination/task-search/quick-add command palette composition.
- Deterministic allocation of proposed work into free intervals for the assistant.
- Today composition of due task and active habit projections.

## Owned persistence

- None. PostgreSQL rows remain owned by tasks, habits, identity, and assistant.
- No materialized projection, calendar-event, quadrant, or schedule-plan table may be added in the active release.

## Public use cases and contracts

- `getSmartDestination(actor, destination, localNow)` returns a bounded task projection.
- `getCalendarRange(actor, range)` and `getAgendaRange(actor, range)` return calendar event DTOs.
- `getEisenhower(actor, localNow)` returns four derived quadrants.
- `getToday(actor, localDate)` composes task and habit rows without persisting a combined view.
- `buildDeterministicPlan(input)` returns placed blocks, overflow, and conflicts without writing.
- Public contracts: `PlanningTaskRow`, `CalendarEventDto`, `AgendaRow`, `EisenhowerProjection`, `BusyInterval`, `SchedulingInput`, and `SchedulingResult`.

## Invariants

- Every surface projects canonical task/habit rows; it never stores or invents a second status, priority, or schedule.
- Calendar and agenda queries require explicit finite ranges. Recurrence expands only inside that range before occurrence events are overlaid.
- Local-day boundaries and “next seven days” use saved user timezone/week preferences.
- Eisenhower `important` means high priority. `urgent` means the derived schedule due boundary is overdue or falls within the user's next 24 hours; unscheduled tasks are not urgent. Other combinations map to the remaining quadrants. The derived boundary is never persisted as a second due field.
- Calendar drag/resize ultimately calls the same versioned tasks schedule command as keyboard/touch editing.
- Every drag/resize action has a visible non-drag alternative.
- The deterministic scheduler alone owns overlap, work-window, buffer, and overflow decisions. Given the same normalized input, it returns the same result.
- Scheduler output contains semantic references supplied by the caller, never trusted database ownership claims, and performs no write.

## Dependencies

- Public tasks query/mutation contracts and public habits Today projection.
- Public identity preferences reader.
- `shared/time`, `shared/validation`, and generic presentation primitives.
- FullCalendar standard/MIT packages only in presentation.

## Non-responsibilities

- Task, recurrence, occurrence, habit, or proposal persistence.
- OpenAI calls, proposal review/apply, reminder delivery, external calendars, saved filters, Kanban, timeline/Gantt, or multi-week/year views.
- Autonomous rescheduling or background planning.

## Required tests

- Smart-destination boundary tests in the user's local timezone, including a documented DST transition.
- Finite-range calendar/agenda tests, recurrence expansion, series edits, and occurrence-event overlay tests.
- Eisenhower tests at overdue, exactly-24-hour, priority, unscheduled, completed, and cancelled boundaries.
- Deterministic scheduler golden fixtures for fixed busy intervals, buffers, overflow, impossible constraints, and repeatability.
- Integration tests proving calendar/matrix actions mutate canonical tasks and surface version conflicts.
- Keyboard/touch parity and range-bounded query E2E tests.
