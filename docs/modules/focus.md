# Focus module contract

**Status:** Active in the Local-first Full Release. Implementation begins only in P4; this contract
does not authorize later-scope Focus features.

`modules/focus` owns authoritative Pomodoro/stopwatch focus and break session state and derived focus
totals. Countdown animation is presentation only.

## Responsibilities

- Start, pause, resume, finish, and discard one active focus-or-break timer per user.
- Link a focus session optionally to one owned task or one owned habit, never both. A break links to
  neither.
- Reconstruct active state after refresh/reconnect from persisted timestamps and accumulated active seconds.
- Correct or delete completed sessions and project today's total, seven-day total, and recent sessions.
- Accept validated per-run focus and break durations. Both intervals are authoritative session rows;
  only completed focus rows contribute to totals and portable history.

## Owned persistence

- `focus_sessions`.

## Public use cases and contracts

- `startFocusSession`, `pauseFocusSession`, `resumeFocusSession`, `finishFocusSession`, and `discardFocusSession`.
- `correctCompletedSession` and `deleteCompletedSession`.
- `getActiveFocusSession`, `getFocusSummary`, and `listRecentFocusSessions`.
- Public contracts: `FocusSessionDto`, `FocusStartInput`, `FocusTimerSnapshot`, `FocusSummary`, and `FocusLinkValidator` adapters supplied by tasks/habits.

## Invariants

- A partial unique database index plus application transaction permits at most one `active` or `paused` session per user.
- A session links to at most one of `task_id` or `habit_id`, enforced by a database check, and the
  link must belong to the same user when created or corrected.
- State transitions are closed: start to active; active to paused/completed; paused to
  active/completed; discard hard-deletes only the caller's unfinished session. A completed session
  never returns to active/paused.
- Server timestamps and accumulated active seconds are authoritative. Client countdown ticks and clock changes cannot alter recorded duration.
- Pause/resume/finish derive elapsed time from the injected server clock, update accumulated active
  seconds exactly once under optimistic `version` checks, and reject hostile client timestamps.
  `created_at` retains the overall session origin; resume resets `started_at` as the new active-
  segment anchor so no extra tick/history column is needed.
- `planned_seconds` is validated for Pomodoro; stopwatch may omit it. Break countdowns do not inflate focus totals.
- `kind=break` requires Pomodoro mode and no task/habit link. A user explicitly starts it after a
  focus interval; finishing focus never creates or starts a break as a hidden mutation. Focus and
  break durations are per-run inputs, not persisted Settings preferences.
- Completed sessions remain readable when linked tasks/habits are soft-deleted. Correction changes
  only completed duration/link fields allowed by its use case; deletion removes only an owned
  completed row. Totals are derived, never stored.
- While offline, presentation may display the last authoritative snapshot plus a clearly local tick,
  but disables timer mutations and never claims projected time was persisted.

## Dependencies

- `shared/auth`, `shared/db`, `shared/logging`, `shared/time`, and `shared/validation`.
- Narrow public ownership/link validators from tasks and habits; no deep repository imports.

## Non-responsibilities

- Task completion, habit check-in, estimates-vs-actual analytics, white noise, app blocking, native
  controls, achievements, or offline/cross-device synchronization.
- Persisting client countdown ticks or counting/exporting break sessions as focus time.

## Required tests

- State-machine unit tests with an injected clock, including repeated/idempotent pause/resume/finish attempts.
- Database race test proving one active/paused session per user.
- Cross-user task/habit link and session mutation denial tests.
- Refresh/reconnect reconstruction and hostile client-clock tests.
- Pomodoro/stopwatch duration, pause accumulation, break exclusion, correction, deletion, and summary-window tests.
- Historical-link readability after task/habit archive or soft deletion.
