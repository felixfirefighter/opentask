# Habits module contract

**Status:** Active in the Local-first Full Release. Implementation begins only in P3 under its own
package gate; this contract does not authorize later-scope habit capabilities.

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
- Calendar days are evaluated in the habit's stored IANA timezone and persisted as `date`, not an
  instant. Schedule `start_date` and optional `end_date` are inclusive local-day bounds.
- `daily`, `weekdays`, and `weekly_target` accept only their documented discriminant fields;
  selected weekdays are unique ISO weekday numbers and a weekly target is positive; database checks
  reject mixed schedule data.
- Boolean goals do not require a quantity. Numeric completion requires a valid nonnegative quantity and is successful only when it meets the positive `target_value` in the effective completed log.
- Daily/weekday streaks advance only on scheduled successful local days; skipped/unachieved scheduled days break them. Weekly-target streaks count consecutive local weeks meeting `target_per_week`.
- Weekly-target weeks are ISO Monday-Sunday weeks, independent of the user's presentation week-start
  preference. The habit appears in Today on every in-range local day. Each successful local day
  counts once toward `target_per_week`; skip/unachieved records do not themselves close or fail the
  week. The current week is “in progress” below target, becomes successful immediately on reaching
  target, and fails only after Sunday closes below target. After target is reached, Today shows the
  achieved state and still permits editing/undoing existing daily logs, but does not prompt another
  check-in as required work. All weekly progress and streak values remain derived.
- Editing a definition or schedule increments the owning habit `version` exactly once. Log mutations
  increment only the log version; a concurrent second write for the same habit/local date resolves
  through the unique key and optimistic conflict policy rather than creating another effective row.
- Streaks and heat maps are derived; counters are never stored on `habits`.
- Archive preserves logs and removes the habit from active Today projections.
- Restore returns the habit to schedule without rewriting prior logs; the saved schedule determines
  whether it appears on the current local day.

## Dependencies

- `shared/auth`, `shared/db`, `shared/logging`, `shared/time`, and `shared/validation`.
- No task or focus repository dependency; consumers use this module's public snapshots.

## Non-responsibilities

- Task recurrence, reminders, focus-session timing, AI scheduling, social sharing, gallery templates, Apple Health, mood analytics, or achievements.
- Unsupported custom cadence rules or storing projection counters.
- Multiple check-ins per day, subtasks/checklists for habits, social challenges, reminders, or
  completion side effects on tasks/Focus.

## Required tests

- Goal/schedule discriminant validation and database constraint tests.
- Cross-user denial and unique habit/local-date concurrency tests.
- Deterministic daily, selected-weekday, and weekly-target streak fixtures across week boundaries and DST.
- Quantity threshold, edit, undo, skipped, and unachieved behavior tests.
- Archive/restore history and Today-projection integration tests.
- Seven-day and monthly heat-map projection tests without persisted counters.
