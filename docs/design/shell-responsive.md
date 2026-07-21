# Shell and responsive contract

## Breakpoints

Breakpoints describe behavior, not device brands.

| Range | Shell behavior |
|---|---|
| `>= 1280 px` large desktop | 52 px module rail + 248 px context sidebar + flexible work area + optional 360 px inspector |
| `1024–1279 px` compact desktop | 52 px rail + 240 px sidebar + flexible work area; inspector is an overlay sheet |
| `768–1023 px` tablet | Top app bar, one work area, context navigation drawer, full-height inspector sheet; no persistent rail/sidebar |
| `< 768 px` mobile | 52 px top bar, one routed surface, 64 px bottom navigation, full-page details |

At 200% zoom, layouts must naturally collapse to the next appropriate shell rather than forcing horizontal page scrolling. Calendar internals may scroll in the time-grid direction as documented in its screen contract.

## Desktop shell

### Module rail

The rail switches product modules, not individual lists. The implemented baseline contains the
mark/home affordance, Today, Tasks, Calendar, Plan, and Habits. P4 adds Focus only when its package
routes are complete. A labeled account menu at the bottom owns Settings and Sign out.
Matrix remains available through context navigation and the command palette. Every icon has a
tooltip and accessible name; the selected item uses icon plus selected surface and current-page
semantics.

### Context sidebar

The sidebar changes with the active module:

- Tasks: Inbox, Today, Upcoming, Completed/Cancelled, Matrix, folders, lists, and list creation.
- Calendar: view navigation and date context, without inventing an unscheduled backlog.
- Plan: Describe, Review, and Result route-preserved steps.
- Habits: Active/Archived navigation and current habit context.
- Focus: timer and recent-history context after P4; do not create project/list navigation for Focus.

Folders disclose their lists inline. Manual reorder uses an explicit handle plus the menu fallback from `components.md`. The immutable Inbox never shows rename/delete actions.

### Work area

The work area owns the screen header and current projection. Its header contains title/range, relevant view controls, and at most one filled primary action. Headers remain visible while long lists scroll when doing so does not obscure focused content.

### Inspector

At 1280 px and wider, selecting a task opens a 360 px inspector without replacing the work area. It has its own scroll container and visible close control. At compact desktop and tablet, the same content opens as a full-height right sheet. Focus moves into the inspector/sheet on open and returns to the invoking row on close.

## Tablet shell

- A top bar contains navigation drawer, current title, search/command, and context action.
- Context navigation opens as a modal drawer with focus containment.
- Lists and planning surfaces use the full content width.
- Detail and creation forms open as full-height sheets; nested modal-on-sheet patterns are avoided.
- Persistent bottom navigation is not required at this range; all modules remain reachable through the drawer and command palette.

## Mobile shell

- Bottom navigation contains Today, Tasks, Calendar, Plan, and More.
- More opens a labeled sheet with Matrix, Upcoming, Completed/Cancelled, Habits, Focus after
  P4, settings, and sign out. Do not render dormant entries before their package gates.
- The selected tab uses icon, short label, and current-page semantics. Do not use icon-only mobile navigation.
- The top bar contains the current destination, an optional back action, and no more than two context actions. Less common actions go in the overflow menu.
- Opening a task navigates to a full-page detail route. Browser/system Back returns to the same list, range, scroll position, and focused row when possible.
- Account for `env(safe-area-inset-bottom)` beneath bottom navigation and fixed action regions.
- The on-screen keyboard must not cover quick add, dialog actions, or planner review controls.

## Navigation and URL state

- Major destinations and selected task/detail state have shareable/restorable URLs where authorization permits.
- View mode, bounded calendar range, and safe filters use URL state so refresh does not reset orientation.
- Temporary text, open menus, and unsubmitted forms remain local state.
- Unauthorized entity routes show the generic not-found/permission-safe state and never leak a title or existence.
- The command palette is reachable from every authenticated shell through a visible button and `Mod+K`.

## Density behavior

- Desktop lists use the 44 px compact-row contract when no secondary line exists and reveal
  secondary actions on row focus as well as hover.
- When any coarse pointer is available, layouts retain compact visual grouping but expand the row hit region and action targets to at least 44 px regardless of viewport width.
- Metadata collapses in a fixed order: verbose list name, tag overflow, lower-priority secondary date text. Status, title, schedule warning, and primary action never disappear.
- Truncated text exposes its full value on focus/activation, not hover alone.

## Scrolling and persistence

- The rail/sidebar, work area, and inspector may scroll independently only on desktop. Do not create nested scroll regions inside the work area unless the calendar requires it.
- Sticky headers have a solid `surface` background and visible bottom boundary when content passes beneath.
- Re-fetching or optimistic updates must not jump the user to the top of a list.
- Loading the next bounded result keeps focus and announces progress without replacing already rendered rows.

## Global condition banners

Offline and critical stale-data conditions appear below the shell header. They include icon, short text, and a relevant action. Offline state disables domain mutations across all surfaces; it is not represented only by disabled controls. Provider-specific states remain local unless they affect more than one screen.
