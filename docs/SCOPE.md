# Scope contract

Research breadth and implementation scope are intentionally different. `docs/research/TICKTICK_FEATURES.md` catalogs the competitor surface; this document is the only authority for what the active goal builds.

## Active release: Hackathon Release

The release is complete only when every committed capability below meets its acceptance criteria and the gates in `docs/QUALITY.md` pass. There are no hidden “nice-to-haves” inside the active goal.

### 1. Identity and first run

- Email/password sign-up, sign-in, sign-out, and protected app routes using Better Auth.
- On first account creation, atomically create an Inbox and default user preferences.
- A clearly marked demo entry creates or resets an isolated seeded demo account dataset without exposing shared credentials.
- User preference editing for IANA timezone, week start, 12/24-hour display, light/dark/system theme, and reduced motion.
- No email verification, password reset email, social login, passkeys, or multi-factor authentication in this release.

Acceptance:

- An unauthenticated request cannot read or mutate domain data.
- Two test users cannot access each other's lists, tasks, habits, focus sessions, planner runs, or export.
- First run lands in a usable Inbox with no manual setup.

### 2. Task and organization core

- Folder and regular-list CRUD with soft delete and immediate Undo/restore; section CRUD with deletion only when empty; and an immutable personal Inbox. There is no general Trash screen in this release.
- Task CRUD with title, Markdown description, four priorities, status (`open`, `completed`, `cancelled`/won't-do), tags, list/section, one level of full-feature subtasks, and lightweight checklist items.
- All-day date or timed start/end schedule with explicit IANA timezone semantics.
- Recurrence presets: daily, weekdays, weekly on selected days, monthly by day-of-month. Series editing and completing/skipping the current occurrence are supported; arbitrary RRULE editing and completion-relative recurrence are not.
- One browser-push reminder per task, either absolute or relative to its scheduled start. The UI degrades clearly when push permission or worker configuration is unavailable.
- Quick add with English natural-language date/time recognition from `chrono-node`; recognized values remain visible and editable before save.
- Complete, undo completion, cancel, restore, move, and manual reorder.
- Search across task title/description and tag name, scoped to the user.
- Smart destinations: Inbox, Today, Upcoming (next 7 days), and Completed/Cancelled.
- Optimistic interactions with conflict recovery based on row version.

Acceptance:

- All task mutations validate ownership and optimistic version on the server.
- Local-day smart views and recurrence behave across a documented DST boundary test.
- Completing one recurring occurrence does not complete the series.
- Quick-add parsing never silently removes or changes user text.
- Delete is soft-delete during the release; destructive purge is not exposed.

### 3. Active planning surfaces

- Desktop three-pane task shell: module rail/context sidebar, task list, task inspector.
- Responsive mobile shell with one content surface, bottom module navigation, and full-screen task detail.
- Calendar month, week/day, and agenda projections using FullCalendar standard/MIT packages.
- Drag/resize a scheduled task on the calendar, plus non-drag date/time editing for keyboard and touch parity.
- Eisenhower view derived from priority and urgency rules:
  - important = high priority;
  - urgent = overdue or due within the user's next 24 hours;
  - due boundary is derived, never stored separately: timed `end_at`, or the exclusive all-day `end_date` at midnight in the schedule timezone; an unscheduled task is not urgent.
  - all other tasks fall into the remaining quadrants.
- Matrix actions can edit priority and schedule through accessible menus; drag between quadrants is not committed.
- Global command/search palette with keyboard navigation for destinations, task search, and quick add.

Acceptance:

- List, calendar, agenda, and matrix are projections of the same task records; none stores a second task status or date.
- Every drag/resize operation has a visible keyboard-accessible alternative.
- Calendar queries are range-bounded and do not load the entire task history.

### 4. Habits

- Create, edit, archive, and restore a habit with title, icon/emoji, color token, boolean or numeric goal, unit, and daily/selected-weekday/target-per-week schedule.
- Check in, edit quantity/note, undo, skip, and mark unachieved for a local date.
- Today surface integration, current streak, best streak, seven-day strip, and compact monthly heat map.
- No gallery, Apple Health, mood analytics, or social habit sharing.

Acceptance:

- At most one effective log exists for a habit/local date.
- Streak calculations are deterministic for each supported schedule and covered by unit tests.
- Archive preserves history and removes the habit from active Today projections.

### 5. Focus

- Pomodoro and stopwatch modes linked optionally to a task or habit.
- Start, pause, resume, finish, and discard one active timer per user; refresh/reconnect reconstructs state from timestamps rather than relying on an in-memory countdown.
- Configurable focus and break duration, today's total, seven-day total, and a list of recent sessions.
- Completed sessions can be corrected or deleted by their owner.
- No white noise, app blocking, cross-device native controls, estimates-vs-actual charts, or achievement system.

Acceptance:

- A database constraint/application transaction prevents two active timers for one user.
- Client clock drift cannot change the authoritative recorded duration.
- A completed linked task remains readable in historical focus records.

### 6. Reality-aware AI planner

- Optional feature, hidden/disabled with an explanatory state when `OPENAI_API_KEY` is absent.
- User can paste a brain dump, select open unscheduled tasks, set a work window, default duration, buffer, and planning date.
- Server sends minimal selected context to the OpenAI Responses API using `gpt-5.6`, Structured Outputs backed by the same Zod schema as the application, and `store: false`.
- Model extracts proposed tasks, constraints, estimates, priority, deadlines, and uncertainty. It does not produce database IDs or execute writes.
- Deterministic scheduling code assigns eligible proposals to free intervals and reports overflow/conflicts.
- Review screen displays create/update/schedule/defer actions, rationale, uncertainties, and before/after values. User can edit or deselect each action.
- Apply endpoint re-fetches current state, revalidates ownership and constraints, detects stale proposals, and commits selected changes atomically with an idempotency key.
- Planner may create, clarify, prioritize, schedule, or defer; it may not delete, complete, cancel, share, or notify another person.

Acceptance:

- No OpenAI response can mutate data without an explicit second user action.
- Invalid, refused, timed-out, or schema-incompatible responses produce a recoverable UI and no writes.
- Deterministic validation rejects overlapping output, out-of-window blocks, unknown records, and stale versions.
- Golden eval fixtures cover vague input, multiple tasks, fixed appointments, overflow, impossible constraints, and irrelevant input.

### 7. PWA, reminders, portability, and demo readiness

- Installable web manifest and service worker used for app-shell caching and web push.
- Honest offline state: previously loaded shell may open, but domain writes are disabled with a clear banner; full offline mutation sync is not claimed.
- Web-push subscription management and pg-boss worker delivery for the one supported reminder.
- Versioned JSON export of all user-owned release data with documented schema version.
- No import in the active release.
- Original landing page, onboarding/empty states, demo seed, health endpoint, structured redacted logs, Docker Compose self-host path, Railway demo deployment, and submission assets/checklist.

Acceptance:

- Export contains no other user's records or server secrets.
- A reminder job is idempotent and records success/failure without logging content or push credentials.
- The production demo has a health check and reproducible setup instructions.

## Explicitly out of the active goal

Do not implement these under the Hackathon Release goal:

- Native iOS, Android, macOS, Windows, watch, browser extension, widgets, global shortcuts, location reminders, voice capture, or OS integrations.
- Full offline-first mutation queue or sync/conflict UI.
- Collaboration, invitations, assignees, comments, activity history, permissions, shared links, or real-time multi-user updates.
- Separate note type, summaries/reports, attachments, recordings, transcription, templates, countdowns, achievements, themes/background galleries, white noise, constant/email/location/checklist reminders.
- Kanban, project timeline/Gantt, year/multi-week calendar, split task/calendar view, arbitrary saved filters, advanced group/sort, batch edit, task merge, custom fields, or advanced statistics.
- External calendars, CalDAV, Notion, Telegram, email-to-task, Siri, Zapier/IFTTT, import from competitors, public API, CLI, or MCP server.
- Arbitrary/custom RRULE editor, completion-relative recurrence, future-instance overrides beyond current occurrence, or reminders on multiple future occurrences.
- Billing, plans, quotas, advertisements, or “premium” gates.
- Autonomous agent behavior or AI deletion/completion.

## Post-hackathon parity roadmap (not part of current goal)

Order matters; an earlier stage must be stable before the next begins.

### Stage A: task depth and portability

Advanced recurrence/exceptions, multiple reminder channels, saved filter DSL, group/sort, batch actions, templates, notes, countdowns, richer statistics, TickTick/Todoist/CSV import, and documented restore.

### Stage B: project views and collaboration

Kanban, timeline, side-by-side calendar planning, attachments through S3-compatible storage, list sharing, roles, assignees, comments, activity history, notification center, and real-time/polling strategy.

### Stage C: integrations and agent surface

Google/Outlook/iCloud/CalDAV adapters, email/Telegram capture, Notion adapter, OAuth application management, stable public REST API, CLI, and authenticated Streamable HTTP MCP server.

### Stage D: offline and platform reach

IndexedDB mutation log, sync protocol/tombstones/conflict UI, native wrapper evaluation, share targets, platform shortcuts, widgets, voice, health/location capabilities, and native notification enhancements.

## Scope-change protocol

A scope change requires all of the following in one reviewable change:

1. User explicitly authorizes the addition, cut, or substitution.
2. `docs/SCOPE.md` acceptance criteria change.
3. `docs/GOAL.md` completion contract changes.
4. Owning module and data-model contracts change if affected.
5. Implementation plan effort and deadline risk are re-audited.

Without all five, the active scope is unchanged.
