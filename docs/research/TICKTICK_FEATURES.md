# TickTick feature ledger

Checked: 2026-07-18

This document records competitor behavior for product and implementation planning. It is not an
implementation backlog and does not authorize work. `docs/SCOPE.md` is the sole feature authority for
the active Local-first Full Release and later Stages A-D.

The ledger was written under the earlier “Hackathon Release” taxonomy. That phrase remains a
historical disposition label in the table, not an active goal name or implementation claim. A row is
active now only when `docs/SCOPE.md` explicitly lists it; otherwise the current scope wins.

## Reading the ledger

Evidence labels:

- Verified: supported by a current official TickTick help, product, policy, or store page.
- Verified, platform-specific: supported only for the named client or operating system.
- Partial: official material supports part of the claim, but does not document complete behavior or entitlement.
- Unresolved: current official sources are absent, ambiguous, or contradictory.
- Historical only: an older official source is retained for context and must not be treated as current truth.

Scope dispositions:

- Hackathon Release (historical label): mapped only to behavior that `docs/SCOPE.md` currently
  promotes into the Local-first Full Release.
- Stage A: task depth and portability.
- Stage B: project views and collaboration.
- Stage C: integrations and agent surface.
- Stage D: offline and platform reach.
- Not scheduled: outside the current roadmap; adding it requires the scope-change protocol.

Source IDs link to docs/research/SOURCES.md.

## 1. Identity, account, and preferences

| Capability | Verified TickTick behavior | Evidence | OpenTask disposition and gap |
|---|---|---|---|
| Account access | Email registration, verification, password reset, linked-email management, and signed-in device management are documented. | Verified: [S801](SOURCES.md#s801) | Hackathon Release includes email/password sign-up, sign-in, sign-out, protected routes, and isolated account data. Verification, reset email, linked-account changes, and device management are not scheduled. |
| Two-step verification | Email-code or authenticator-app verification with backup codes; desktop setup routes through web. | Verified: [S803](SOURCES.md#s803) | Not scheduled. |
| Account deletion | Users can request account deletion; privacy documentation describes deletion and backup-retention behavior. | Verified: [S802](SOURCES.md#s802), [S811](SOURCES.md#s811) | Not scheduled for the Hackathon Release. Versioned export is committed; destructive purge is not exposed. |
| Time preferences | TickTick documents timezone handling, week/calendar preferences, and 12/24-hour presentation through client settings. | Verified: [S212](SOURCES.md#s212), [S806](SOURCES.md#s806) | Hackathon Release commits IANA timezone, week start, 12/24-hour display, and DST-tested behavior. |
| Appearance | Light, dark, automatic and custom appearance options, list backgrounds, font-size controls, and platform-dependent themes are documented. | Verified, platform-specific: [S806](SOURCES.md#s806), [S004](SOURCES.md#s004) | Hackathon Release commits light/dark/system and reduced motion using original semantic tokens. Theme and background galleries are not scheduled. |

## 2. Task model and capture

| Capability | Verified TickTick behavior | Evidence | OpenTask disposition and gap |
|---|---|---|---|
| Organization hierarchy | Folder to List to Section to Task to Subtask. TickTick supports up to five nested task levels. | Verified: [S103](SOURCES.md#s103), [S107](SOURCES.md#s107) | Hackathon Release commits folders, lists, sections, and one level of full-feature subtasks. Deeper nesting is not scheduled. |
| Inbox | Inbox is a built-in personal list and cannot be hidden or deleted. | Verified: [S107](SOURCES.md#s107) | Hackathon Release atomically creates an immutable personal Inbox. |
| Task fields | Title, rich or Markdown description, priority, schedule, recurrence, reminders, tags, checklist, subtasks, attachments, location, assignee, comments, focus records, pinning, order, task links, and activity are documented. | Verified: [S102](SOURCES.md#s102) | Hackathon Release commits title, Markdown description, four priorities, schedule, supported recurrence, one reminder, tags, checklist, one-level subtasks, status, and order. Other fields follow their staged rows below. |
| Task states | Open, completed, won't-do, restart, delete, trash restore, and duplicate actions are documented. | Verified: [S102](SOURCES.md#s102) | Hackathon Release commits open, completed, cancelled/won't-do, undo, restore, move, and soft delete. Destructive purge and duplicate are not committed. |
| Lightweight checklist | Check items are distinct from subtasks. Completing all items contributes task progress and may complete the parent; subtasks are independently scheduled tasks. | Verified: [S102](SOURCES.md#s102), [S103](SOURCES.md#s103) | Hackathon Release commits lightweight checklist items as a separate relation. Per-item reminders and advanced progress are not committed. |
| Full-feature subtasks | Subtasks can carry ordinary task behavior such as schedule, priority, tags, focus, description, and assignment. | Verified: [S103](SOURCES.md#s103) | Hackathon Release commits one full-feature child level and preserves a self-referencing model. |
| Scheduling | All-day date, timed start/end, same-day and multi-day duration, with fixed or floating time behavior. | Verified: [S102](SOURCES.md#s102), [S212](SOURCES.md#s212) | Hackathon Release commits all-day or timed start/end with explicit IANA semantics. TickTick's fixed-versus-floating travel UX is not separately committed. |
| Recurrence presets | Daily, weekly, monthly, yearly, and custom recurrence are documented. Rules may follow due date, completion date, or selected dates and may end by date or count. | Verified: [S104](SOURCES.md#s104) | Hackathon Release commits daily, weekdays, selected weekly days, and monthly day-of-month plus current-occurrence complete/skip. Stage A owns advanced rules, completion-relative recurrence, exceptions, and arbitrary RRULE editing. |
| Multiple reminders | Multiple relative or absolute reminders, default reminders, snooze, end-time reminders, email, location, and platform-specific Constant Reminder behavior exist. | Verified: [S105](SOURCES.md#s105), [S106](SOURCES.md#s106) | Hackathon Release commits one browser-push reminder per task with graceful degradation. Stage A owns multiple reminder channels. Stage D owns native/location enhancements. Email and checklist reminders are not otherwise scheduled. |
| Constant Reminder | Mobile reminder can repeat until acted upon; recent documentation describes task, habit, and anniversary-specific control. iOS and Android behavior differs. | Verified, platform-specific: [S106](SOURCES.md#s106), [S004](SOURCES.md#s004) | Not scheduled; Stage D is the earliest platform-appropriate destination if later authorized. |
| Quick add | Rapid task entry supports attributes and natural-language date/time recognition. | Verified: [S101](SOURCES.md#s101), [S001](SOURCES.md#s001) | Hackathon Release commits English parsing through chrono-node, visible editable recognition, and no silent title mutation. |
| Task defaults | New-task defaults can supply date, list, priority, reminder, and duration behavior. | Verified: [S101](SOURCES.md#s101) | Not scheduled as a separate preferences surface. Hackathon defaults remain those explicitly stated in the module and screen contracts. |
| Attachments and recordings | Task detail supports images, audio, files, video, and upload limits; recording/transcription adds a separate AI workflow. | Verified with entitlement conflict: [S102](SOURCES.md#s102), [S704](SOURCES.md#s704) | Stage B owns attachments through S3-compatible storage. Recording and transcription are not scheduled. |
| Voice capture | Mobile voice entry and AI Voice can extract multiple tasks plus title, date, time, list, tag, and priority. | Verified, platform-specific: [S701](SOURCES.md#s701) | Stage D includes voice reach, but AI extraction parity is not explicitly scheduled. |
| Email and messaging capture | Email-to-task, Spark integration, and current Telegram capture are documented. | Verified: [S607](SOURCES.md#s607), [S004](SOURCES.md#s004) | Stage C owns email and Telegram capture adapters. |
| OS capture | Siri, Apple Reminders, Shortcuts, widgets, global add shortcuts, clipboard handling, and browser extensions provide platform capture routes. | Verified, platform-specific: [S604](SOURCES.md#s604), [S606](SOURCES.md#s606), [S805](SOURCES.md#s805), [S807](SOURCES.md#s807), [S904](SOURCES.md#s904) | Stage D owns platform shortcuts, share targets, widgets, and native reach. |

## 3. Lists, retrieval, and task views

| Capability | Verified TickTick behavior | Evidence | OpenTask disposition and gap |
|---|---|---|---|
| Regular and smart lists | Documented smart lists include Inbox, All, Today, Tomorrow, Next 7 Days, Assigned to Me, Completed, Won't Do, and Trash. Visibility can be configured. | Verified: [S107](SOURCES.md#s107) | Hackathon Release commits Inbox, Today, Upcoming next seven days, and Completed/Cancelled. Other smart destinations are not committed. |
| Sections and manual order | Lists support custom sections, manual drag order, and list-level customization. | Verified: [S108](SOURCES.md#s108) | Hackathon Release commits section CRUD and manual reorder. |
| List presentation | List name, color, icon or emoji, folder placement, pinning, display state, and background options are documented. | Verified: [S107](SOURCES.md#s107), [S004](SOURCES.md#s004) | Hackathon Release commits only the folder/list/section data and original semantic presentation required by its screens. Background galleries and parity customization are not scheduled. |
| Group and sort | Grouping by custom section, list, time, priority, tag, or assignee; multiple sorting choices are documented. | Verified: [S108](SOURCES.md#s108) | Stage A owns advanced group/sort. |
| Search | Search spans tasks, lists, tags, and filters, with refinements for list, tag, priority, and date. | Verified: [S110](SOURCES.md#s110) | Hackathon Release commits user-scoped title, description, and tag search plus a global keyboard palette. Advanced refinements are not committed. |
| Saved and advanced filters | Filters can combine list, tag, date, priority, and keyword criteria with AND/OR logic and can be saved. | Verified: [S109](SOURCES.md#s109) | Stage A owns the saved filter DSL. |
| List view | Vertical list supports hierarchy, ordering, grouping, selection, and task actions. | Verified: [S112](SOURCES.md#s112) | Hackathon Release commits desktop task list and responsive mobile task surface. |
| Kanban | Lists can be displayed as draggable Kanban columns. | Verified: [S113](SOURCES.md#s113) | Stage B. |
| Timeline | Lightweight Gantt view provides day/week/month scale, duration bars, drag/resize, and an unscheduled tray. | Verified: [S114](SOURCES.md#s114) | Stage B. |
| Batch actions | Batch date, list, priority, tag, complete, merge, delete, and share actions are documented. | Verified: [S108](SOURCES.md#s108), [S112](SOURCES.md#s112) | Stage A owns batch actions. Merge and share require their later owning features and are not automatically approved. |
| Suggested Tasks | Current versions recommend tasks based on recency, postponement, overdue age, and upcoming timing. | Verified: [S111](SOURCES.md#s111) | Not scheduled. The Hackathon AI planner is a separate, review-before-apply workflow. |
| Task and note templates | Preset and custom templates can save content and tags and can be searched and reordered. | Verified: [S004](SOURCES.md#s004), [S702](SOURCES.md#s702) | Stage A. |

## 4. Calendar and active planning

| Capability | Verified TickTick behavior | Evidence | OpenTask disposition and gap |
|---|---|---|---|
| Calendar views | List/agenda, day, three-day, week, month, year, multi-day, and multi-week views are documented across clients. | Verified, platform-specific: [S201](SOURCES.md#s201), [S202](SOURCES.md#s202), [S203](SOURCES.md#s203), [S204](SOURCES.md#s204) | Hackathon Release commits month, week/day, and agenda using FullCalendar standard/MIT packages. Three-day, year, multi-day, and multi-week are not scheduled. |
| Calendar task editing | All-day and timed task placement, drag to schedule, drag/resize duration, and an unscheduled task tray are documented. | Verified: [S201](SOURCES.md#s201), [S205](SOURCES.md#s205) | Hackathon Release commits drag/resize plus visible keyboard and touch alternatives. |
| Calendar content controls | Calendar can display completed tasks, check items, future recurrence, habits, countdowns, focus records, and subscribed events, with color and detail controls. | Verified: [S205](SOURCES.md#s205) | Hackathon Release projects committed tasks and habits from canonical records. Other overlays follow their owning feature stages. |
| Split planning | Desktop can show a task list and calendar together. | Verified: [S206](SOURCES.md#s206) | Stage B side-by-side calendar planning. |
| Year density view | Year view includes task-density visualization and date/month drill-down. | Verified: [S204](SOURCES.md#s204) | Not scheduled. |
| Alternate calendar system | Calendar settings document an additional Persian calendar display. | Verified, settings-specific: [S205](SOURCES.md#s205) | Not scheduled. |
| Time zones | Fixed and floating time semantics are documented, and calendar can show the current zone plus four additional zones. | Verified: [S205](SOURCES.md#s205), [S212](SOURCES.md#s212) | Hackathon Release commits one canonical IANA time model and user timezone. Multi-zone display and separate fixed/floating modes are not scheduled. |
| External calendars | Local, Google, iCloud, Outlook, Exchange, CalDAV, and URL/ICS sources are documented. Selected TickTick lists can be exposed to other calendars. | Verified: [S207](SOURCES.md#s207), [S208](SOURCES.md#s208), [S209](SOURCES.md#s209), [S210](SOURCES.md#s210), [S211](SOURCES.md#s211), [S215](SOURCES.md#s215) | Stage C owns Google, Outlook, iCloud, and CalDAV adapters. A published calendar feed is not explicitly scheduled. |
| Google bidirectional behavior | Google events can be managed in TickTick, and selected timed TickTick tasks/lists can map to Google Calendar. Official caveats include unsupported event types and date-range limits. | Verified with documented limitations: [S208](SOURCES.md#s208) | Stage C. Provider mapping and conflict policy must be specified before implementation. |
| Eisenhower Matrix | Four quadrants derive from urgency and importance; custom rules can use list, tag, date, time, priority, and task attributes. Adding or moving a task can apply quadrant attributes. | Verified: [S213](SOURCES.md#s213), [S214](SOURCES.md#s214) | Hackathon Release commits a derived matrix: important means high priority; urgent means overdue or due in the next 24 hours. Accessible menus edit priority/schedule. Custom rules and drag are not committed. |

## 5. Habits, focus, countdowns, and personal analytics

| Capability | Verified TickTick behavior | Evidence | OpenTask disposition and gap |
|---|---|---|---|
| Habit definitions | Gallery of more than 60 habits plus custom icon, name, motivation, schedule, frequency, and amount goals. | Verified: [S401](SOURCES.md#s401) | Hackathon Release commits custom title, emoji/icon, color token, boolean or numeric goal, unit, and supported schedules. Gallery and motivation content are not committed. |
| Habit tracking | Boolean or quantity recording, reminders, logs, backfill, archive/restore, time-of-day grouping, Today/Next 7 integration, mood, and notes are documented. | Verified: [S402](SOURCES.md#s402) | Hackathon Release commits check-in, quantity/note edit, undo, skip, mark unachieved, archive/restore, and Today integration. Mood and time-of-day grouping are not scheduled. |
| Habit statistics | Weekly/monthly review, yearly heatmap, record timeline, streak-oriented views, and widgets are documented. | Verified: [S403](SOURCES.md#s403) | Hackathon Release commits current/best streak, seven-day strip, and compact monthly heatmap. Stage A owns richer statistics. |
| Pomodoro | Default 25-minute focus and five-minute break, long-break cycle, task/habit linkage, notes, session controls, and history. | Verified: [S301](SOURCES.md#s301), [S302](SOURCES.md#s302), [S305](SOURCES.md#s305) | Hackathon Release commits configurable Pomodoro linked optionally to task or habit. |
| Stopwatch and timers | Count-up Stopwatch and reusable custom Timers are documented. | Verified: [S302](SOURCES.md#s302) | Hackathon Release commits Stopwatch. Reusable named Timer presets are not scheduled. |
| Focus state and records | Start, pause, resume, finish, discard, edit/add duration, and add/delete historical records; synchronized focus state is documented. | Verified: [S303](SOURCES.md#s303) | Hackathon Release commits one authoritative active timer per user, reconnect reconstruction, recent sessions, correction, and deletion. Cross-device browser consistency follows shared database state; native controls are Stage D. |
| Focus statistics | Day/week/month/year/custom trends, timeline, productive-time analysis, year grid, and list/tag/task distributions are documented. | Verified: [S304](SOURCES.md#s304) | Hackathon Release commits today and seven-day totals. Stage A may add richer statistics; exact parity is not committed. |
| Focus environment | White noise, full-screen clock, floating window, flip start, screen-on, Strict Mode/app allowlist, and Live Activities vary by native platform. | Verified, platform-specific: [S301](SOURCES.md#s301), [S303](SOURCES.md#s303) | White noise and app blocking are not scheduled. Native controls are Stage D only if later specified. |
| Countdowns | Holiday, birthday, anniversary, or custom countdowns with reminders, repeat, count-up/down, age, list/calendar display, styling, archive, Live Activity, and widgets. | Verified, platform-specific: [S404](SOURCES.md#s404), [S405](SOURCES.md#s405), [S406](SOURCES.md#s406) | Stage A owns countdowns. Native Live Activity/widgets remain Stage D concerns. |
| Achievements | Twelve achievement tiers and a score influenced by creation, completion, timeliness, overdue work, and completion trends. | Verified: [S703](SOURCES.md#s703) | Not scheduled. |

## 6. Collaboration and shared work

| Capability | Verified TickTick behavior | Evidence | OpenTask disposition and gap |
|---|---|---|---|
| Shared-list boundary | Self-created regular lists can be shared; Inbox and smart lists cannot. Other private lists remain invisible to collaborators. | Verified: [S501](SOURCES.md#s501) | Stage B. Hackathon Release is owner-only and must not preimplement dormant membership UI. |
| Invitations | Invite by email/contact or share link; recipients accept through notifications. | Verified: [S501](SOURCES.md#s501) | Stage B. |
| Roles | Edit, comment, and read-only permission levels are documented. | Verified: [S501](SOURCES.md#s501) | Stage B roles. Exact OpenTask permission matrix requires its own module contract. |
| Assignment | A task can be assigned to one member; bulk assignment is documented. | Verified: [S502](SOURCES.md#s502) | Stage B. |
| Comments and mentions | Task comments and member mentions generate collaboration notifications. | Verified: [S502](SOURCES.md#s502) | Stage B. |
| Activity and notification controls | Task activity appears across clients; list activity is documented as web-only. Per-list completion/add/delete/move and reminder scopes are configurable. | Verified, platform-specific: [S502](SOURCES.md#s502) | Stage B activity history and notification center. Exact event taxonomy is not yet scoped. |
| Collaboration capacity | Current sources say a Free owner can share with one other member and Premium with up to 29 others. Invitees need not be Premium. | Verified for current commercial entitlement: [S002](SOURCES.md#s002), [S902](SOURCES.md#s902), [S903](SOURCES.md#s903) | OpenTask has no billing, quota, or premium gate. Infrastructure safety limits may exist but may not mimic commercial paywalls. |

## 7. Notes, templates, reports, and history

| Capability | Verified TickTick behavior | Evidence | OpenTask disposition and gap |
|---|---|---|---|
| Notes | Note lists support rich content, dates/reminders, tags, templates, sections, ordering, and Kanban. Task-to-note and note-to-task conversion is documented with constraints. | Verified: [S702](SOURCES.md#s702) | Stage A owns a separate note type. Stage B owns Kanban presentation. |
| Summary reports | Filtered summaries can combine task, focus, habit, and calendar information by range/list/tag/assignee/status/priority, with grouping, saved templates, and text/image output. | Verified: [S702](SOURCES.md#s702) | Not scheduled beyond the general Stage A richer-statistics allowance; a report builder needs explicit scope. |
| Templates | Task and note templates support saved structure/content, tags, search, and reordering. | Verified: [S004](SOURCES.md#s004), [S702](SOURCES.md#s702) | Stage A. |
| Task/list history | Task activity and list-level activity/history are documented; Premium advertises change history. | Verified: [S102](SOURCES.md#s102), [S502](SOURCES.md#s502), [S002](SOURCES.md#s002) | Stage B activity history. Hackathon Release may retain only infrastructure events required for correctness and auditing, not a parity UI. |
| Completion analytics | Daily, weekly, and monthly completion trends/rates accompany achievement statistics. | Verified: [S703](SOURCES.md#s703) | Stage A may add richer statistics; exact completion dashboards are not committed. |

## 8. Portability, integrations, API, and AI

| Capability | Verified TickTick behavior | Evidence | OpenTask disposition and gap |
|---|---|---|---|
| Backup and restore | Web client can generate a backup and re-import it. Public help does not clearly specify every current export field or file-format guarantee. | Verified with format gap: [S601](SOURCES.md#s601) | Hackathon Release commits a documented, versioned JSON export only. Stage A owns documented restore. |
| Competitor import | Client-dependent import sources include Todoist, Microsoft To Do, Apple Reminders, Any.do, Wunderlist, OmniFocus, Toodledo, and iCal. | Verified, platform-specific: [S602](SOURCES.md#s602) | Stage A owns TickTick, Todoist, and CSV import. Other adapters are not committed. |
| Notion | An official Notion integration path is documented. | Verified: [S603](SOURCES.md#s603) | Stage C owns a Notion adapter. |
| Siri and Shortcuts | Siri capture, Apple Reminders import, URL scheme, and Apple Shortcuts are documented. | Verified, Apple-specific: [S604](SOURCES.md#s604), [S606](SOURCES.md#s606) | Stage D platform shortcuts. |
| Apple Health | Habit or focus-related Apple Health integration is documented. | Verified, Apple-specific: [S605](SOURCES.md#s605) | Stage D health capability, subject to a separate privacy and platform contract. |
| Spark | Emails can be turned into TickTick tasks through Spark integration. | Verified: [S607](SOURCES.md#s607) | Stage C email capture may use an adapter; Spark-specific parity is not committed. |
| Public automation surface | Official MCP and CLI provide authenticated operations across core TickTick objects. | Verified: [S609](SOURCES.md#s609), [S610](SOURCES.md#s610) | Stage C owns REST API, CLI, and authenticated Streamable HTTP MCP server. OpenTask must define its own stable contracts rather than imitate undocumented internals. |
| AI Voice | Mobile speech can produce structured task attributes and multiple tasks. | Verified, mobile-specific: [S701](SOURCES.md#s701) | Not part of the Hackathon AI planner. Voice reach is Stage D; AI extraction needs explicit later scope. |
| AI recording | Audio transcription, timestamps, summaries, more than 30 languages, and a monthly quota are documented. | Verified, quota details may change: [S704](SOURCES.md#s704), [S705](SOURCES.md#s705) | Not scheduled. |
| General AI assistance | Current help describes AI task extraction and productivity use cases. | Verified at product level: [S705](SOURCES.md#s705), [S706](SOURCES.md#s706) | Hackathon Release instead commits a narrowly bounded reality-aware planner: minimal context, Structured Outputs, deterministic scheduling, review, and explicit apply. No autonomous writes. |

## 9. Platform surface

| Platform | Verified TickTick surface | Evidence | OpenTask disposition and gap |
|---|---|---|---|
| Web | Broad task/planning client; manual backup/import, API-token management, list activity, split calendar, and calendar batch behavior appear in web documentation. White noise is absent. | Verified, web-specific: [S003](SOURCES.md#s003), [S601](SOURCES.md#s601), [S206](SOURCES.md#s206) | Hackathon Release is web-first and installable as a PWA. |
| Windows | Native client with global add, sticky notes, desktop widgets, shortcuts, mini-calendar, and Focus behaviors. | Verified, Windows-specific: [S003](SOURCES.md#s003), [S804](SOURCES.md#s804), [S805](SOURCES.md#s805) | Stage D native-wrapper evaluation; no Windows commitment. |
| macOS | Native client with global add, sticky notes, widgets, Shortcuts, and menu-bar behavior; some interactions differ from Windows. | Verified, macOS-specific: [S003](SOURCES.md#s003), [S604](SOURCES.md#s604), [S606](SOURCES.md#s606), [S804](SOURCES.md#s804), [S807](SOURCES.md#s807) | Stage D native-wrapper evaluation; no macOS commitment. |
| Linux | Official downloadable client exists, but public help does not establish detailed parity. | Partial: [S003](SOURCES.md#s003) | Stage D platform evaluation only; feature parity is unresolved. |
| iPhone and iPad | Voice/AI capture, Siri/Shortcuts/Reminders, location/constant reminders, Live Activities, widgets, Control Center, and Apple Health are documented. | Verified, Apple-specific: [S902](SOURCES.md#s902), [S604](SOURCES.md#s604), [S605](SOURCES.md#s605) | Stage D platform reach. |
| Android | Voice, location/constant reminders, widgets, Quick Ball, and Wear OS integration are documented. | Verified, Android-specific: [S903](SOURCES.md#s903), [S106](SOURCES.md#s106) | Stage D platform reach. |
| Apple Watch | Watch app, complications or Smart Stack, task/habit widgets, completion, reminders, and sync are documented. | Verified, watchOS-specific: [S807](SOURCES.md#s807), [S902](SOURCES.md#s902) | Stage D only; exact native scope requires a new contract. |
| Wear OS | Official store/help material supports synchronization, display, and reminders, but not a complete capability matrix. | Partial, Wear OS-specific: [S903](SOURCES.md#s903), [S807](SOURCES.md#s807) | Stage D; detailed parity unresolved. |
| Browser extensions | Chrome and Edge extensions expose task capture/management and Gmail-message conversion. Current Firefox availability was not verified. | Verified for Chrome/Edge, unresolved for Firefox: [S904](SOURCES.md#s904), [S905](SOURCES.md#s905), [S003](SOURCES.md#s003) | Stage D share targets/platform reach may consider extensions; no browser extension is committed. |
| VisionOS | The Apple listing reports compatibility, but that does not prove a purpose-built spatial interface. | Partial: [S902](SOURCES.md#s902) | Not scheduled. |

## 10. Sync, offline, accessibility, security, and privacy

| Concern | Verified TickTick behavior | Evidence | OpenTask disposition and gap |
|---|---|---|---|
| Cross-device sync | Core data synchronizes across documented clients. Focus state can synchronize across devices. | Verified at product level: [S808](SOURCES.md#s808), [S303](SOURCES.md#s303) | Hackathon Release uses PostgreSQL as authority and row versions for optimistic conflict recovery. |
| Offline semantics | Current official sources do not specify complete offline CRUD, mutation queue order, conflict resolution, merge policy, or local encryption across clients. | Unresolved: [S808](SOURCES.md#s808) only establishes cross-platform use | Hackathon Release caches a safe shell and disables domain writes offline. Stage D owns mutation log, sync protocol, tombstones, and conflict UI. Do not claim offline-first behavior earlier. |
| Keyboard and appearance accessibility | Keyboard shortcuts/navigation, font sizing, zoom, system font, dark/automatic appearance, and configurable colors are documented. | Verified, client-specific: [S805](SOURCES.md#s805), [S806](SOURCES.md#s806), [S809](SOURCES.md#s809) | Hackathon Release quality gates require keyboard parity, semantic HTML, visible focus, reduced motion, responsive checks, and automated accessibility scans. |
| Formal accessibility conformance | No current official WCAG report, VPAT, screen-reader guarantee, focus-order specification, or reduced-motion conformance statement was located. | Unresolved | OpenTask targets its own documented accessible behavior and must not claim TickTick parity or certification without evidence. |
| Security controls | TickTick describes TLS, encryption at rest, AWS US hosting, monitoring, backups, and breach handling. | Verified at policy level: [S800](SOURCES.md#s800) | Hackathon Release follows its own security contract: owner-scoped queries, Zod boundaries, redacted logs, server-only secrets, transactional writes, and audit gates. |
| Privacy and AI data | Current policy describes data handling, deletion, backup retention, subprocessors, and AI processing. It states requested AI content is not used for model training. | Verified at policy level: [S811](SOURCES.md#s811) | OpenTask sends minimum selected context, uses store: false, keeps manual workflows usable without an AI key, and never lets model output mutate data directly. |

## 11. Commercial entitlement ledger

OpenTask has no plans, billing, quotas, advertisements, or premium gates in active scope. This section exists only to explain which TickTick capabilities are marketed as paid and where current public evidence is incomplete.

| TickTick entitlement | Current evidence | OpenTask treatment |
|---|---|---|
| Calendar | Full calendar functionality, additional views, task duration, and external calendar subscriptions/integrations are marketed as Premium. | Implement only the scoped calendar surface, available to every user. |
| Custom filters | Custom smart filters are marketed as Premium. | Stage A, no paywall. |
| Capacity | Premium advertises 299 lists, 999 tasks per list, and 199 subtasks/check items per task. Current exact Free list/task/check-item caps are not confirmed by current public pages. | No artificial commercial limit. Apply only documented operational safety limits. |
| Reminders | Premium advertises up to five reminders per task and checklist-item reminders. The exact current Free reminder cap is not clearly documented. | Hackathon Release deliberately supports one reminder for implementation scope, not monetization. Stage A expands channels. |
| Collaboration | Free owner capacity is one other member; Premium owner capacity is 29 others. | Stage B, no paywall. |
| Habits and countdowns | Current store text places the Free boundary at five habits and five countdowns. | No artificial commercial limit once the feature exists. |
| Attachments | Free is documented as one upload per day and 10 MB. Current official Premium pages conflict: 99 versus 199 uploads per day and differing per-task counts. | Stage B attachment capability requires independent resource limits; do not copy unresolved figures. |
| History and analytics | Change history, task progress, historical statistics, expanded habit statistics, themes, white noise, estimates, and some widgets are Premium benefits. | Implement only by scoped stage, without a feature gate. |

Evidence: [S002](SOURCES.md#s002), [S102](SOURCES.md#s102), [S902](SOURCES.md#s902), [S903](SOURCES.md#s903), and conflict notes in docs/research/SOURCES.md.

## 12. Evidence gaps and validation backlog

These are research questions, not implementation tasks:

1. Exact current Free list, task, subtask/check-item, and reminder limits.
2. Exact current Premium attachment daily and per-task limits; official pages conflict.
3. Free-versus-Premium entitlement for Matrix, Kanban, Timeline, and the basic Pomodoro surface on every client.
4. Complete Linux feature parity.
5. Detailed Wear OS behavior beyond synchronization, display, and reminders.
6. Current Firefox extension availability.
7. Full offline behavior, queue ordering, merge policy, local storage, and conflict UX.
8. Whether the historical Plan Your Day feature remains a distinct current feature or entitlement.
9. Formal accessibility conformance and assistive-technology support.
10. Exact backup file-format and long-term schema guarantees.

Resolve a gap through a current official source or a documented test against a sacrificial reference account. Never use personal production data for competitor behavior probing.

## 13. Implementation guardrails derived from the research

- Today, Upcoming, Calendar, Agenda, Matrix, Kanban, and Timeline are projections of canonical task records, not separate task stores.
- Checklist items and full-feature subtasks remain distinct concepts.
- Schedule, recurrence, and reminder concepts have one canonical owner and are reused rather than duplicated by views.
- History belongs in append-only events; current values remain on their owning aggregate.
- Row version, updated timestamp, and soft-delete semantics precede collaboration or offline work.
- Provider payloads remain behind Stage C adapters and never become the domain model.
- Commercial limits are not copied into schema or authorization rules.
- A researched capability outside docs/SCOPE.md remains out of scope until the full scope-change protocol is satisfied.
