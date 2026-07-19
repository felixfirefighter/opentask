# Scope contract

Research breadth and implementation scope are intentionally different. `docs/research/TICKTICK_FEATURES.md` catalogs the competitor surface; this document is the only authority for what the active goal builds.

## Active release: Deadline-safe Hackathon Core

The active release is deliberately centered on one complete judging story: capture and organize tasks, plan them across time, use GPT-5.6 to produce a reviewable schedule proposal, export the data, and run the product reproducibly. It is complete only when every capability below meets its acceptance criteria and the gates in `docs/QUALITY.md` pass.

### 1. Identity and first run

- Email/password sign-up, sign-in, sign-out, and protected app routes using Better Auth.
- On first account creation, atomically create an Inbox and default user preferences.
- A clearly marked demo entry creates or resets an isolated seeded demo account dataset without exposing shared credentials.
- User preference editing for IANA timezone, week start, 12/24-hour display, light/dark/system theme, and reduced motion.
- No email verification, password reset email, social login, passkeys, or multi-factor authentication in this release.

Acceptance:

- An unauthenticated request cannot read or mutate domain data.
- Two test users cannot access each other's lists, tasks, planner runs, or export.
- First run lands in a usable Inbox with no manual setup.

### 2. Task and organization core

- Folder and regular-list CRUD with soft delete and immediate Undo/restore; section CRUD with deletion only when empty; and an immutable personal Inbox. There is no general Trash screen in this release.
- Task CRUD with title, Markdown description, four priorities, status (`open`, `completed`, `cancelled`/won't-do), tags, list/section, one level of full-feature subtasks, and lightweight checklist items.
- All-day date or timed start/end schedule with explicit IANA timezone semantics.
- Quick add with English natural-language date/time recognition from `chrono-node`; recognized values remain visible and editable before save.
- Complete, undo completion, cancel, restore, move, and manual reorder.
- Search across task title/description and tag name, scoped to the user.
- Smart destinations: Inbox, Today, Upcoming (next 7 days), and Completed/Cancelled.
- Optimistic interactions with conflict recovery based on row version.

Acceptance:

- All task mutations validate ownership and optimistic version on the server.
- Local-day smart views and all-day/timed schedules behave across a documented DST boundary test.
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
  - due boundary is derived, never stored separately: timed `end_at`, or the exclusive all-day `end_date` at midnight in the user's saved IANA timezone; an unscheduled task is not urgent;
  - all other tasks fall into the remaining quadrants.
- Matrix actions can edit priority and schedule through accessible menus; drag between quadrants is not committed.
- Global command/search palette with keyboard navigation for destinations, task search, and quick add.

Acceptance:

- List, calendar, agenda, Today/Upcoming, and matrix are projections of the same task records; none stores a second task status or date.
- Every drag/resize operation has a visible keyboard-accessible alternative.
- Calendar queries are range-bounded and do not load the entire task history.

### 4. Reality-aware AI planner

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

### 5. Portability and demo readiness

- Honest runtime offline state disables domain writes with a clear banner; no offline cache or mutation sync is claimed.
- Versioned JSON export of all user-owned active-release data with a documented schema version. Import is not included.
- Original landing page, onboarding/empty states, demo seed, health endpoint, structured redacted logs, Docker Compose self-host path, Railway demo deployment, and submission assets/checklist.
- A friend-testable hosted candidate with an isolated demo entry is the first release milestone.

Acceptance:

- Export contains no other user's records or server secrets.
- The production demo has a health check, isolated deterministic seed/reset, and reproducible setup instructions.
- The friend candidate passes the core task, planning, AI review/apply, export, and sign-out paths before deferred work can be reconsidered.

## Deferred extensions — not in the active goal

The following capabilities were intentionally removed from the deadline-safe core. Their research and module contracts may remain as future references, but no route, table, migration, dependency, job, UI control, or claim may be implemented under the active goal:

- Task recurrence, occurrence exceptions, series editing, and recurring-instance completion/skip.
- Habits, habit schedules/logs, streaks, strips, and heat maps.
- Focus timers, focus sessions, task/habit timer links, and focus statistics.
- Browser-push reminders, push subscriptions, notification deliveries, and reminder worker jobs.
- Installable PWA manifest/service-worker caching or push handling.

After the hosted core candidate passes its friend-test gate, the user may promote one or more deferred extensions through the five-part scope-change protocol. Available time alone is not authorization.

## Explicitly out of the active goal

Do not implement these under the Deadline-safe Hackathon Core goal:

- Every item in “Deferred extensions” above.
- Native iOS, Android, macOS, Windows, watch, browser extension, widgets, global shortcuts, location reminders, voice capture, or OS integrations.
- Full offline-first mutation queue or sync/conflict UI.
- Collaboration, invitations, assignees, comments, activity history, permissions, shared links, or real-time multi-user updates.
- Separate note type, summaries/reports, attachments, recordings, transcription, templates, countdowns, achievements, themes/background galleries, white noise, or additional reminder channels.
- Kanban, project timeline/Gantt, year/multi-week calendar, split task/calendar view, arbitrary saved filters, advanced group/sort, batch edit, task merge, custom fields, or advanced statistics.
- External calendars, CalDAV, Notion, Telegram, email-to-task, Siri, Zapier/IFTTT, import from competitors, public API, CLI, or MCP server.
- Billing, plans, quotas, advertisements, or “premium” gates.
- Autonomous agent behavior or AI deletion/completion.

## Post-core parity roadmap (not part of current goal)

Order matters; an earlier stage must be stable before the next begins.

### Core extensions

Recurrence/occurrence handling, habits, focus, one browser-push reminder, installable PWA shell, and the associated worker/provider reliability work.

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
