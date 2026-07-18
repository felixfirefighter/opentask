# Focus module contract

`modules/focus` owns authoritative Pomodoro/stopwatch session state and derived focus totals. Countdown animation is presentation only.

## Responsibilities

- Start, pause, resume, finish, and discard one active timer per user.
- Link a session optionally to one owned task or one owned habit.
- Reconstruct active state after refresh/reconnect from persisted timestamps and accumulated active seconds.
- Correct or delete completed sessions and project today's total, seven-day total, and recent sessions.
- Accept validated focus and break durations for a Pomodoro run; only the focus interval contributes a persisted focus session/totals.

## Owned persistence

- `focus_sessions`.

## Public use cases and contracts

- `startFocusSession`, `pauseFocusSession`, `resumeFocusSession`, `finishFocusSession`, and `discardFocusSession`.
- `correctCompletedSession` and `deleteCompletedSession`.
- `getActiveFocusSession`, `getFocusSummary`, and `listRecentFocusSessions`.
- Public contracts: `FocusSessionDto`, `FocusStartInput`, `FocusTimerSnapshot`, `FocusSummary`, and `FocusLinkValidator` adapters supplied by tasks/habits.

## Invariants

- A partial unique database index plus application transaction permits at most one `active` or `paused` session per user.
- A session links to at most one of `task_id` or `habit_id`, and the link must belong to the same user when created or corrected.
- State transitions are closed: start to active; active to paused/completed; paused to active/completed; discard removes only the caller's unfinished session.
- Server timestamps and accumulated active seconds are authoritative. Client countdown ticks and clock changes cannot alter recorded duration.
- Pause/resume/finish update elapsed duration exactly once under optimistic `version` checks.
- `planned_seconds` is validated for Pomodoro; stopwatch may omit it. Break countdowns do not inflate focus totals.
- Completed sessions remain readable when linked tasks/habits are soft-deleted. Totals are derived, never stored.

## Dependencies

- `shared/auth`, `shared/db`, `shared/logging`, `shared/time`, and `shared/validation`.
- Narrow public ownership/link validators from tasks and habits; no deep repository imports.

## Non-responsibilities

- Task completion, habit check-in, estimates-vs-actual analytics, white noise, app blocking, native controls, achievements, or cross-device timer synchronization.
- Persisting client countdown ticks or break sessions as focus time.

## Required tests

- State-machine unit tests with an injected clock, including repeated/idempotent pause/resume/finish attempts.
- Database race test proving one active/paused session per user.
- Cross-user task/habit link and session mutation denial tests.
- Refresh/reconnect reconstruction and hostile client-clock tests.
- Pomodoro/stopwatch duration, pause accumulation, break exclusion, correction, deletion, and summary-window tests.
- Historical-link readability after task/habit archive or soft deletion.

