# Deferred Focus screen

**Status:** Not part of the Deadline-safe Hackathon Core. Do not implement this route or UI until the scope-change protocol promotes it.

## Purpose and route

`/focus` runs one authoritative focus timer per user and shows recent completed sessions. It supports Pomodoro and stopwatch modes, optionally linked to a task or habit. It does not include white noise, app blocking, native controls, achievements, or estimates-versus-actual analytics.

## Layout

The page has three ordered regions:

1. **Timer:** mode, phase/status, tabular time, optional linked item, and state-appropriate controls.
2. **Summary:** today's total and seven-day total as text; any visual bars are supplemental.
3. **Recent sessions:** completed session time, duration, mode, safe linked-item label when available, and correction/delete menu.

Desktop centers the timer in a bounded card while summary/history use the remaining width below or beside it at large sizes. Mobile keeps the timer and active controls above the fold, then summary/history. The timer never depends on a circular animation to convey elapsed/remaining time.

## Timer states and actions

- **Idle:** choose Pomodoro or Stopwatch, optionally link one task/habit, then Start.
- **Running focus:** Pause or Finish; Discard is in the overflow/consequence dialog.
- **Paused:** Resume, Finish, or Discard.
- **Pomodoro break:** show “Break” text and the configured remaining time; “Skip break” returns to Idle. The break countdown does not create a focus session or contribute to totals.
- **Reconnect:** reconstruct from server timestamps and state; client ticks are display-only.

Settings expose focus and break duration through a compact form. Starting when another active timer exists recovers that timer instead of creating another. Finishing confirms the authoritative duration and adds one recent-session row.

Completed sessions may be corrected or deleted by their owner. Correction uses start/end or duration fields consistent with the domain contract and names the effect on totals. Deletion requires confirmation because active scope does not promise an undo.

## State contract

| State | Required presentation |
|---|---|
| Default | Authoritative timer state, mode/phase text, correct actions, optional linked item, totals, and recent sessions. |
| Empty | Idle timer remains the main start state. With no history, show “No focus sessions yet” beneath it; do not replace the timer with an empty illustration. |
| Loading | Show stable timer geometry with a status, not a guessed countdown. Load summary/history independently after authoritative active-state resolution. |
| Error | If active-state lookup fails, do not expose Start until uniqueness is known; show Retry. Failed pause/finish/discard keeps the last authoritative state and says the timer may still be running. History error does not disable the timer. |
| Offline | A previously loaded running timer may continue its display projection from the last server timestamp, labeled “Not connected; timer may still be running”. Disable start/pause/resume/finish/discard/correction/delete until online; never record a local duration. |
| Permission | Unauthenticated access routes to sign-in. Foreign session IDs and inaccessible linked items reveal no private content; historical rows may show “Linked item unavailable”. |
| Conflict/reconnect | Replace duplicate/stale local timer state with the one authoritative server timer, announce the recovered mode/status, and preserve no false local session. |

## Keyboard, touch, and accessibility

- Timer mode uses labeled controls with current selection; state action order remains stable.
- Screen readers hear mode, phase, and state changes, but not each second tick. A user can query the current timer text normally.
- Tabular numerals reduce visual movement; reduced motion removes progress animation.
- Link-task/habit search uses the command/search combobox contract and shows item type.
- Confirmation dialogs focus the safe control first and return to the invoking action.
- Touch targets meet 44 px; all actions are visible/tappable without gestures.

## Acceptance evidence

Verify Pomodoro/stopwatch start, pause, reconnect, resume, finish, discard, break behavior, one-active-timer recovery, optional task/habit links including deleted/completed links, correction/delete, totals, empty/loading/error/offline/permission, clock drift, reduced motion, keyboard flow, and 1440/1024/390 px layouts.
