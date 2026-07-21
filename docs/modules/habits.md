# Habits module contract

**Status:** Implemented in the Local-first Full Release. This contract does not authorize
later-scope habit capabilities.

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
- `listHabits` and `listHabitOverviews`, returning opaque-cursor pages, plus the single-resource
  `getHabit` and `getHabitOverview` reads used by detail routes.
- `getHabitToday`, returning a strict opaque-cursor `HabitTodayProjection`, plus bounded
  `getHabitHistory`, exact streamed `getHabitStreaks`, and bounded `getHabitMonth`.
- Public contracts: `HabitDto`, `HabitScheduleDto`, `HabitLogDto`, `HabitDefinitionPage`,
  `HabitOverviewPage`, `HabitTodayProjection`, `HabitTodayRow`, `HabitTodayBoundary`,
  `HabitStreakProjection`, the narrow `HabitSnapshotReader` for planning/focus consumers, and the
  separate portable-habit reader used by export composition.

## Invariants

- Habit titles are NFC-normalized, trimmed, nonblank, and at most 200 Unicode code points. Icons are
  NFC-normalized, trimmed, nonblank, and at most 16 Unicode code points. The approved category
  tokens are `coral`, `amber`, `mint`, `sky`, `violet`, and `slate`.
- Quantity goals use fixed three-decimal values from `0.001` through `999999999.999`; their
  NFC-normalized unit is required, nonblank, and at most 40 Unicode code points. Boolean goals have
  neither a target value nor a unit. Logged quantities use the same scale and upper bound, may be
  zero, and are required for new or edited completions while the current goal is numeric. Notes are
  NFC-normalized, may be blank, and are at most 1,000 Unicode code points.
- Every habit, schedule, and log query is constrained by `user_id`.
- Public definition, overview, and Today reads use keyset pages of 50 by default and at most 100.
  Candidate habits are ordered by `updated_at` descending then `id` ascending. Cursors are opaque,
  versioned, and bound to their endpoint scope and lifecycle; their anchor is revalidated under the
  authenticated actor inside each repeatable-read page snapshot. A missing, moved, changed, or
  cross-actor anchor fails generically as invalid or expired rather than silently skipping data.
- `HabitTodayProjection.rows` contains only scheduled candidates from that page, so a page may have
  fewer rows than its requested candidate limit while still returning `nextCursor`. Consumers must
  continue until `nextCursor` is null rather than interpreting a short row list as exhaustion.
  `boundaries` contains one deterministic `{ timezone, localDate }` pair for every distinct active
  habit timezone/date, including active habits that are unscheduled or outside their schedule range
  that day, so clients can refresh at each relevant local midnight. This set is bounded by the
  canonical IANA timezone universe and is read without loading all active habit rows.
- A habit has exactly one supported schedule row and at most one effective log per `habit_id`/`local_date`.
- Calendar days are evaluated in the habit's stored IANA timezone and persisted as `date`, not an
  instant. Canonical local dates are limited to `0001-01-01` through `9999-12-31`; PostgreSQL
  infinity values and BC dates are invalid. Schedule `start_date` and optional `end_date` are
  inclusive local-day bounds. Timezone validation uses the generated canonical allowlist shared by
  TypeScript and the database; PostgreSQL-recognized names outside that allowlist, such as legacy
  `US/Eastern`, are not accepted as stored values.
- `daily`, `weekdays`, and `weekly_target` accept only their documented discriminant fields;
  selected weekdays contain one to seven unique ascending ISO weekday numbers and a weekly target
  is an integer from one through seven; database checks reject mixed schedule data.
- Boolean goals do not require a quantity. Numeric completion requires a valid nonnegative quantity and is successful only when it meets the positive `target_value` in the effective completed log.
- A goal-kind edit does not rewrite completed historical facts: a former numeric completion may
  retain its quantity under a current boolean goal, and a former boolean completion may retain a
  null quantity under a current numeric goal. Projections always derive success against the current
  goal. Any later edit to that historical log must conform to the current goal and therefore
  reshapes its quantity field as needed.
- Skipped and unachieved logs contain no quantity. A note may accompany any effective log state.
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
- Streaks and heat maps are derived; counters are never stored on `habits`. Lifetime streak input is
  streamed in fixed-size actor-scoped pages into constant-sized state per habit and is never
  truncated. Seven-day rows retain at most seven effective logs per projected habit. History reads
  require an inclusive range of at most 366 days, and month reads require exactly one calendar
  month; neither repository exposes an unbounded lifetime-array read.
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
- Deterministic continuation without duplicates, cursor scope/lifecycle/actor/anchor rejection,
  public page maxima, fixed-size lifetime-log streaming, and exact streak parity across batch edges.
