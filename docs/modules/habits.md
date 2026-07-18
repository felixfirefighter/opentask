# Habits module contract

`modules/habits` owns personal habit definitions, supported schedules, local-day logs, and derived streak/history projections.

## Responsibilities

- Create, edit, archive, and restore habits with boolean or numeric goals.
- Configure daily, selected-weekday, or target-per-week schedules.
- Check in, edit quantity/note, undo, skip, or mark unachieved for one local date.
- Produce Today rows, current/best streaks, seven-day strips, and compact monthly heat-map data.

## Owned persistence

- `habits`.
- `habit_schedules`.
- `habit_logs`.

## Public use cases and contracts

- `createHabit`, `updateHabit`, `archiveHabit`, and `restoreHabit`.
- `setHabitSchedule(actor, habitId, expectedVersion, schedule)`.
- `recordHabitDay`, `editHabitDay`, and `undoHabitDay`.
- `getHabitToday`, `getHabitHistory`, `getHabitStreaks`, and `getHabitMonth`.
- Public contracts: `HabitDto`, `HabitScheduleDto`, `HabitLogDto`, `HabitTodayRow`, `HabitStreakProjection`, and `HabitSnapshotReader` for planning/focus/portability.

## Invariants

- Every habit, schedule, and log query is constrained by `user_id`.
- A habit has exactly one supported schedule row and at most one effective log per `habit_id`/`local_date`.
- Calendar days are evaluated in the habit's stored IANA timezone and persisted as `date`, not an instant.
- `daily`, `weekdays`, and `weekly_target` accept only their documented discriminant fields; database checks reject mixed schedule data.
- Boolean goals do not require a quantity. Numeric completion requires a valid nonnegative quantity and is successful only when it meets the positive `target_value` in the effective completed log.
- Daily/weekday streaks advance only on scheduled successful local days; skipped/unachieved scheduled days break them. Weekly-target streaks count consecutive local weeks meeting `target_per_week`.
- Editing a schedule increments the owning habit `version` exactly once. Log mutations increment only the log version.
- Streaks and heat maps are derived; counters are never stored on `habits`.
- Archive preserves logs and removes the habit from active Today projections.

## Dependencies

- `shared/auth`, `shared/db`, `shared/logging`, `shared/time`, and `shared/validation`.
- No task or focus repository dependency; consumers use this module's public snapshots.

## Non-responsibilities

- Task recurrence, reminders, focus-session timing, AI scheduling, social sharing, gallery templates, Apple Health, mood analytics, or achievements.
- Unsupported custom cadence rules or storing projection counters.

## Required tests

- Goal/schedule discriminant validation and database constraint tests.
- Cross-user denial and unique habit/local-date concurrency tests.
- Deterministic daily, selected-weekday, and weekly-target streak fixtures across week boundaries and DST.
- Quantity threshold, edit, undo, skipped, and unachieved behavior tests.
- Archive/restore history and Today-projection integration tests.
- Seven-day and monthly heat-map projection tests without persisted counters.

