# Scope contract

Research breadth and implementation scope are intentionally different. `docs/research/TICKTICK_FEATURES.md`
catalogs the competitor surface; this document alone authorizes product behavior for the active goal.

## Active release: Local-first Full Release

The Local-first Full Release turns the implemented core into a polished, self-hostable
personal planning product with recurrence, habits, Focus, installability, and one reliable browser
reminder. “Full” means every capability committed below is complete; it does not claim full TickTick
parity. “Local-first” means local/self-host operation is the completion path and no hosted deployment
is required. It does **not** mean offline mutation sync; that remains Stage D.

Manual tasks, planning, habits, Focus, export, and already loaded UI must remain useful when OpenAI
or push configuration is absent. Every capability below must meet its acceptance criteria and the
gates in `docs/QUALITY.md`.

### 1. Approved Editorial Focus baseline

Editorial Focus is already implemented and user-approved across the current product. It is a
release invariant, not an unfinished work package.

- Preserve the GetDesign-informed, OpenTask-owned application direction in
  `docs/design/editorial-focus.md` without changing behavior or information architecture merely for
  visual novelty.
- Keep the self-hosted editorial display face limited to major moments and the readable sans face in
  working UI, with committed font sources and license notices.
- Retain comfortable task text, productive density, strong form boundaries, semantic status colors,
  44 px touch targets, dark/system themes, and keyboard equivalence.
- Keep atmospheric decoration on public, first-run, major empty, and restrained planner-framing
  surfaces only; never use it as task, calendar, or status decoration.
- Extend this baseline to later feature UI. Any broad restyling or shared-foundation change requires
  explicit user approval and new visual evidence.

Acceptance:

- Every current and later active route passes the responsive, theme, zoom, keyboard, accessibility,
  and executable design gates.
- Visual-only maintenance does not add or change a route, API, schema, authorization rule, or
  product feature.
- No ElevenLabs/GetDesign branding, copy, asset, proprietary font, exact palette/layout, audio motif,
  or trade dress appears in the shipped product.

### 2. Stable personal-planning core

- Email/password identity, isolated demo entry, preferences, protected routes, and cross-user
  authorization from the existing core remain committed.
- Folder/list/section/tag/task/checklist/one-level-subtask CRUD; search; Markdown; optimistic
  conflict recovery; soft-delete/restore; completion/cancel/undo; manual reorder; and command palette.
- All-day/timed schedules, quick-add recognition, Today, Upcoming, Calendar month/week/day/agenda,
  Matrix, and accessible non-drag schedule editing remain projections of canonical task data.
- Matrix classification remains exact: important means high priority; urgent means the derived
  schedule/occurrence due boundary is overdue or within the user's next 24 hours; timed `end_at` or
  the exclusive all-day `end_date` in the saved IANA timezone supplies that boundary, and an
  unscheduled task is not urgent.
- Optional GPT-5.6 planner remains a proposal/review/apply pipeline with no write before explicit
  Apply and a complete no-key/manual fallback.
- Close the audited local-core gaps: contextual quick add uses the current Inbox or regular list with
  no schedule, Today with an all-day schedule for today, and Upcoming with an all-day schedule for
  the next local day. A visibly recognized, editable date/time may override that default before the
  atomic create-with-schedule command. Calendar uses the full task create/schedule form; Matrix uses
  the global palette and never guesses a quadrant. Also add local-midnight/timezone projection
  refresh, task inspection from planning surfaces, stable planner navigation/refetch, visible AI
  capability in Settings, and robust local origin/configuration guidance.

Acceptance:

- G1–G4 pass locally at required desktop/mobile widths with two-user denial coverage.
- A task created with a schedule is either fully committed or not created; partial create/schedule
  failure is impossible.
- Today/Upcoming/Matrix boundaries refresh after local midnight and a preference timezone change
  without requiring a full browser restart.
- Planning surfaces open the same authorized task details and recover from stale/network/offline
  writes without losing user input.
- The application starts and all manual workflows function with no `OPENAI_API_KEY`.

### 3. Task recurrence and occurrence state

- One optional schedule-based recurrence rule for an eligible scheduled root task.
- Initial presets: daily, weekdays, weekly on selected weekdays, monthly by day of month, and yearly
  by month/day, with a bounded interval and never/until/count ending.
- Range-bounded recurrence expansion for Today, Upcoming, Calendar, agenda, and Matrix without
  cloning task rows or storing a second schedule/status representation.
- Complete, skip, and undo one occurrence through deterministic occurrence identity and append-only
  effective occurrence state.
- Edit or end the series at a server-chosen future cutover while preserving prior recorded occurrence
  events. The active release does not reconstruct unrecorded occurrences before the current rule's
  cutover.
- All-day/timed and IANA-zone semantics remain stable across DST and month/year boundaries.

Acceptance:

- Cross-user recurrence and occurrence access is denied in SQL/application tests.
- Expansion is deterministic, bounded by query range and a documented safety cap, and never loads an
  unbounded series.
- Completing/skipping one occurrence does not complete the series or another occurrence; undo
  restores only that occurrence.
- Rule edits preserve recorded past occurrence state and produce no duplicate occurrence identity.
- Completion-relative recurrence, individual occurrence rescheduling, recurring checklist/subtask
  state, and arbitrary raw RRULE entry are not exposed in this release.

### 4. Habits

- Boolean and numeric habits with daily, selected-weekday, or target-per-week schedules.
- Target-per-week uses ISO Monday-Sunday weeks and appears in Today on every in-range local day until
  achieved. Successful days count once; skip/unachieved does not fail an open week, which fails only
  after Sunday closes below target. Current/best weekly streaks remain derived.
- Create/edit/archive/restore; Today check-in; quantity/note editing; undo, skip, and unachieved.
- Derived current/best streaks, seven-day strip, and compact monthly heat-map data.
- Local calendar days are evaluated in the habit's stored IANA timezone.

Acceptance:

- At most one effective log exists per habit/local date under concurrent writes.
- Daily/weekday and weekly-target streak fixtures are deterministic across week and DST boundaries;
  streak/heat-map counters are never stored.
- Archive preserves history and removes the habit from active Today; restore returns it to schedule.
- Every definition, schedule, log, Today, and history query is user-scoped and covers default, empty,
  loading, error, offline, permission, and conflict states.

### 5. Focus

- One authoritative timer row per user: a Pomodoro/stopwatch focus interval optionally linked to one
  owned task or habit, or an explicitly started Pomodoro break with no item link.
- Start, pause, reconnect, resume, finish, and discard focus or break intervals; correction and
  deletion of completed focus sessions. Break rows are excluded from focus totals and portable focus
  history.
- Server timestamps and accumulated active seconds own duration; client ticks are display only.
- Derived today/seven-day totals and recent-session history.

Acceptance:

- A database race test proves at most one active/paused session per user.
- Refresh/reconnect and hostile client-clock tests reconstruct the authoritative timer without
  double-counting pause/resume/finish.
- Cross-user task/habit links and session mutations are denied; historical rows remain safe when a
  linked item becomes unavailable.
- Offline UI never claims a locally projected duration was saved and disables timer mutations until
  the server is reachable.

### 6. Installable PWA shell

- Original app icons, web app manifest, installable display metadata, service worker lifecycle, and
  an honest offline fallback shell.
- Cache only versioned public/static application assets needed to reopen the shell. Do not cache
  authenticated API payloads or queue domain writes.
- Show update-available, offline, and recovery states without trapping the user on an old build.

Acceptance:

- Browser installability checks pass with original icons/metadata and no misleading native claim.
- A fresh offline navigation reaches the fallback; an already open page keeps rendered data visible
  and read-only; no offline mutation is accepted or described as synchronized.
- Cache version upgrade and removal tests prevent stale asset buildup and cross-user content
  exposure.

### 7. One browser-push task reminder

- Zero or one reminder per owned task: an absolute instant for a non-recurring task, or relative to an
  eligible task/occurrence start. A recurring task accepts only the relative-start form.
- Web Push subscription registration/revocation, encrypted endpoint/key material, capability and
  permission states, and optional VAPID/provider configuration. Enrollment/revocation accepts the
  current browser's subscription material inbound; stored server reads never echo it. The public
  VAPID key is intentionally browser-visible, while private VAPID and encryption keys remain secret.
- pg-boss enqueue/delivery/retry/no-op/cleanup behavior in an active worker process.
- Schedule, recurrence, status, and deletion changes reconcile the next eligible delivery.

Acceptance:

- Missing permission, VAPID configuration, or known-disabled worker configuration produces an
  explicit degraded state and never prevents task/manual startup. The web UI does not claim to detect
  unexpected worker-process death; operators verify runtime liveness through the worker check and
  readiness log.
- Reminder changes and logical job creation are transactionally consistent and idempotent. A job
  records `delivering` before the remote call; duplicate execution cannot claim it twice. Explicit
  retryable provider responses may retry within bounds, while timeout/statusless/crash ambiguity is
  terminal and is never resent. Duplicate jobs cannot create an unclassified extra provider call;
  explicit negative retryable responses may still produce bounded additional calls.
- The worker reloads current state and no-ops stale, completed, deleted, disabled, rescheduled, or
  already-delivered work.
- Push endpoints/auth material and task content never appear in job payloads, exports, stored server
  responses, push payloads, or logs; permanent subscription failures revoke safely and only explicit
  retryable responses retry with bounds.

### 8. Portability, demo, and local release trust

- Versioned JSON export expands to recurrence rules/events, habits/schedules/logs, completed
  focus-only history, and portable reminder specifications; break rows, provider secrets,
  subscriptions, delivery records,
  active queue internals, and credentials remain excluded.
- Deterministic isolated demo/reset covers the full release without exposing shared credentials.
- Local web, PostgreSQL, migrations, active reminder worker, production build, and health checks run
  reproducibly through documented commands and Docker Compose.
- Submission/demo material distinguishes the implemented baseline from later unmerged work and
  claims only verified behavior.

Acceptance:

- A fresh clone can install, migrate, seed-readiness-check, run web/worker, enter an isolated demo,
  complete the named golden paths, and export without undocumented services.
- Export validates one declared version, preserves relationships/time semantics, and contains only
  the authenticated user's portable records.
- The full local release passes every mandatory audit in `docs/QUALITY.md`; no hosted deployment is
  required for goal completion.

## Explicitly outside the active release

- Full offline-first mutation log, sync/change feed, tombstones, background sync, or conflict UI.
- Advanced recurrence exceptions, completion-relative recurrence, per-occurrence schedule override,
  recurring checklist/subtask instances, or raw RRULE editing.
- Multiple reminders, email/SMS/location/constant reminders, notification center, or native push.
- Collaboration, invitations, roles, assignees, comments, activity history, shared links, or realtime
  multi-user updates.
- Kanban, Gantt/timeline, split task/calendar view, arbitrary saved filters, advanced group/sort,
  batch edit, task merge, custom fields, or advanced analytics.
- Attachments, recordings/transcription, separate notes, templates, countdowns, achievements,
  background/theme galleries, white noise, app blocking, or health integrations.
- External calendars, CalDAV, Notion, Telegram, email capture, Siri, Zapier/IFTTT, competitor import,
  public API, CLI, or MCP server.
- Native/mobile/desktop/watch applications, browser extensions, widgets, OS global shortcuts, voice,
  location, or share-target integrations beyond the installable web app.
- Billing, subscriptions, quotas, advertisements, premium gates, autonomous agent behavior, or AI
  deletion/completion.

## Later roadmap — not part of the active goal

Order remains advisory; each stage requires a new user-authorized scope change.

### Stage A: task depth and restore

Advanced recurrence/exceptions, multiple reminder channels, saved filter DSL, group/sort, batch
actions, templates, notes, countdowns, richer statistics, TickTick/Todoist/CSV import, and documented
restore.

### Stage B: project views and collaboration

Kanban, timeline, side-by-side calendar planning, attachments through S3-compatible storage, list
sharing, roles, assignees, comments, activity history, notification center, and bounded realtime or
polling.

### Stage C: integrations and agent surface

Google/Outlook/iCloud/CalDAV adapters, email/Telegram capture, Notion adapter, OAuth application
management, stable public REST API, CLI, and authenticated Streamable HTTP MCP server.

### Stage D: offline and platform reach

IndexedDB mutation log, sync protocol/tombstones/conflict UI, native wrapper evaluation, share
targets, platform shortcuts, widgets, voice, health/location capabilities, and native notification
enhancements.

## Scope-change protocol

Any addition, cut, or substitution requires all five in one reviewable change:

1. The user explicitly authorizes it.
2. This file's capabilities and acceptance criteria change.
3. `docs/GOAL.md` completion changes.
4. Owning module, data, design, stack, and quality contracts change where affected.
5. `docs/IMPLEMENTATION_PLAN.md` effort, dependency order, and delivery risk are re-audited.

Without all five, active scope is unchanged. Time pressure, an available agent, or a researched
competitor feature is not authorization.
