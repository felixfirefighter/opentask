# Habits screen

**Status:** Implemented in the Local-first Full Release under the approved Editorial Focus baseline.

## Purpose and routes

`/habits` manages habit definitions and shows compact progress/history. `/habits/[habitId]` is the mobile detail/edit route; desktop/tablet may use an inspector/sheet. Today owns today's cross-product check-in projection, while this screen owns configuration, archived access, and history.

Active scope includes boolean or numeric goals and daily, selected-weekday, or target-per-week schedules. It excludes gallery, mood analytics, health integrations, and social sharing.

## Layout

Desktop uses the standard shell with an Active/Archived view control, a list of habit summary cards/rows, and an optional detail inspector. The header contains the title and one “Create habit” action.

Each summary includes:

- icon/emoji and named category token;
- title and schedule/goal in text;
- today's effective status/progress when scheduled;
- current and best streak;
- seven-day strip.

Detail adds the compact monthly heat map, textual history summary, check-in editor, and archive/restore action. Mobile stacks summaries and uses full-page create/detail. Heat-map overflow stays within its component and retains a non-visual list/text interpretation.

## Create/edit habit

Fields: title, icon/emoji, one approved category token, goal type, target quantity and unit when numeric, and one supported schedule. The form shows a plain-language schedule preview before save. Changing goal/schedule does not rewrite historical logs.

Archive is reversible and explains that history is preserved while the habit leaves active Today. Restore returns it to its configured schedule.

## Check-in actions

- Boolean: check in/undo, skip, or mark unachieved.
- Numeric: enter/edit quantity and optional note, undo, skip, or mark unachieved.
- An effective log exists at most once for the habit/local date; UI edits the existing state rather than adding duplicate entries.

Status changes use text and icon plus color. A streak is informative, never a score or moral judgment.

## State contract

| State | Required presentation |
|---|---|
| Default | Active summaries, schedule/goal text, progress, streaks, seven-day strip, and accessible check-in/detail actions. |
| Empty | Active: “No habits yet” with Create habit. Archived: “No archived habits” with a return-to-active action. A new habit's heat map says “No check-ins yet” without implying failure. |
| Loading | Preserve header/view control and use summary-shaped skeletons. History loads independently after core detail and has its own status. |
| Error | Identify whether definitions, history, or a mutation failed. Preserve valid form/quantity/note input, restore failed optimistic status, and offer a scoped retry. |
| Offline | Cached habits/history remain visible and labeled read-only. Disable create/edit/archive/restore/check-in mutations; do not queue local logs. |
| Permission | Unauthenticated access routes to sign-in. Missing/foreign habit IDs show generic unavailable and reveal no title/history. |
| Conflict | Reload the effective local-date log or definition, preserve typed quantity/note, and offer Review latest/Retry instead of creating a second log. |

## Keyboard, touch, and accessibility

- Habit cards have one clear open-details target; check-in and menu remain separate controls.
- Numeric quantity uses an appropriately labeled number input with unit and validation; shortcuts never assume a value.
- Heat-map cells expose full local date, value, unit, and status. Current/best streaks are available as text.
- Category token always appears with the habit title/icon; color is not the only identifier.
- Reorder, if exposed for active habits, follows keyboard drag plus Move fallback; do not invent drag if ordering is not implemented.
- Touch targets meet 44 px and no long press/swipe is required.

## Acceptance evidence

Verify boolean/numeric goals, all three schedule types, create/edit, check-in/edit/undo/skip/unachieved, one-log conflict, archive/restore, deterministic streak/heat-map rendering, empty/loading/error/offline/permission states, keyboard screen-reader heat-map path, and required responsive widths.
