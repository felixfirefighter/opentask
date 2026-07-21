# Shared component contracts

Shared primitives provide anatomy and interaction behavior. Feature modules own the data and product rules. A component listed here is not permission to move feature widgets into `shared/`.

## Action hierarchy

- **Primary:** filled `action` treatment; one per local decision surface.
- **Secondary:** neutral surface with border or quiet fill.
- **Tertiary:** text/icon action for low-emphasis utilities.
- **Danger:** neutral until the confirmation point, then danger treatment.
- **Icon button:** always named; tooltip on pointer-capable screens; target follows `tokens.md`.

Buttons show progress without changing width, prevent duplicate submission, and retain an accessible label such as “Creating task”. Disabled controls have adjacent explanatory text or an available tooltip; color alone is insufficient.

## Task row

Anatomy, in reading order:

1. status control with a large row-level hit area;
2. title and optional one-line context;
3. schedule and tag metadata;
4. priority marker with accessible text;
5. overflow menu and optional reorder handle.

The standard two-line row uses `text-row` for the title, `text-compact` for metadata, `text-label` for
tags, and a 4 px title/metadata gap. Its minimum height is 64 px on fine-pointer-only layouts and
68 px whenever a coarse pointer is available. The 44 px compact variant is valid only when secondary
context is absent. Status and overflow targets remain at least 36 by 36 px with a fine pointer and
44 by 44 px when any coarse pointer is available. Narrow screens may hide tag chips, but the semantic
priority marker remains visible.

Completed titles use reduced emphasis and a strike only when still readable. Cancelled/won't-do uses a labeled status, not the same styling as completed. Overdue uses icon/text plus semantic color. Row selection and completion are separate actions.

An occurrence-bearing planning row labels the series and binds Complete/Skip/Undo to its
`occurrenceKey`. A canonical Inbox/list/search row with a recurrence definition shows a textual
Repeat marker and replaces the ordinary Complete target with a named “Open recurring task” action;
it never implies that one checkbox will complete the series. A preserved open occurrence outside the
current rule is labeled read-only and suppresses Complete/Skip when its server-derived
`transitionEligible` value is false. Cancel/restore and Edit/End recurrence remain explicit series
actions in details.

Keyboard: `Enter` opens details; the status control remains separately tabbable; menu actions expose move, schedule, priority, complete/cancel/restore, and soft-delete as allowed. Hover-only controls also appear on `:focus-within`. Mobile swipe actions are not part of active scope.

## Quick add

- A single-line task title field with visible “Add task” action and `Enter` submit; `Shift+Enter` does not submit multiline text because quick add is title-only.
- Recognized date/time appears as editable chips below or within a confirmation row before save.
- Parsing never removes source text invisibly. The user can clear a recognized chip without losing typed words.
- Destination defaults to the current list/view policy and is shown whenever it might be surprising.
- `Escape` clears suggestions first, then collapses the composer when empty.
- Offline and submitting states disable save with a direct explanation.

## Task inspector/form

The inspector uses a sticky header with status, title context, close, and overflow; a scrollable body; and no hidden save bar for fields that commit individually. Fields group into Schedule, Organization, Steps, and Notes. Changes expose saving/saved/error state without toast spam. Conflict state preserves unsaved input and offers “Review latest” and “Try again”.

Date/time controls use labeled dialogs/popovers on desktop and full-width sheets on mobile. The non-drag schedule form is the canonical accessible editor.

## Reorderable list

Use dnd-kit with pointer and keyboard sensors. A visible handle appears on focus/hover and remains reachable by touch through the overflow menu.

- `Space` picks up/drops the focused item.
- Arrow keys move it among valid positions while picked up.
- `Escape` cancels and restores the original order.
- A polite live region announces pickup, position, move, drop, and cancel.
- The overflow action “Move…” provides an equivalent list/section and position control.

Do not apply drag semantics to the entire row; text selection and row opening must remain reliable.

## Navigation item

Navigation includes icon, text wherever space permits, optional count, and current-page state. Counts are supplemental and never the only accessible name. Folder disclosure uses a button with `aria-expanded`; destination links remain links.

## Search and command palette

The palette has a labeled search input and grouped results: Navigate, Tasks, and Create. Up/Down changes active result; `Enter` activates; `Escape` closes; `Mod+K` toggles. Results expose type and relevant context, and matching does not hide an explicit no-results state. Search results never reveal unauthorized records.

## Calendar event

Event blocks contain time when relevant, truncated title, status, and optional list/category context. Category background and readable paired foreground come from `tokens.md`. Selected events have a non-color outline. Drag/resize is pointer enhancement; activating an event opens the inspector, whose schedule form provides the complete alternative.

## Habit check-in

This primitive is active in the implemented Habits surface.

The row/card includes icon/emoji, title, schedule/goal, current progress, streak summary, and an action whose label reflects goal type. Numeric habits open a quantity form instead of assuming one unit. Check-in success is reversible. Skip and unachieved are menu actions with explicit labels.

## Focus timer

This primitive becomes active with P4 and must not render before that package gate.

The timer uses tabular numerals and exposes its mode/state as text. Start is the only filled action at rest; Pause, Resume, Finish, and Discard follow the current state. A linked task/habit is optional and removable. Screen-reader announcements occur at state changes, not every second.

## Planner proposal card

Each card contains:

- selection checkbox;
- action label (`Create`, `Update`, `Schedule`, or `Defer`);
- target or proposed title;
- before/after values where applicable;
- rationale, uncertainty, and conflict/overflow messages;
- edit and deselect actions.

Model confidence is written as explanation, never encoded only as color or an unexplained score. Invalid actions cannot be selected and say why. The final apply bar states the exact selected count.

## Feedback primitives

- **Inline field error:** next to the field, referenced by `aria-describedby`.
- **Banner:** persistent condition affecting the page or app, such as offline/provider unavailable.
- **Toast:** short confirmation or recoverable background result; never the sole place for required information.
- **Dialog:** consequence that needs explicit confirmation; initial focus is on the safest sensible control.
- **Skeleton:** mirrors stable layout, is hidden from assistive technology, and has a nearby status message.
- **Empty state:** names what is absent, why it matters, and one in-scope next action. It never promotes an unimplemented feature.

Success toasts include Undo only when the server operation genuinely supports it. Errors state whether data was saved and provide Retry when safe.

## Form conventions

- Visible label for every field; placeholder is example content, never the label.
- Required and optional status is textual.
- Validate on blur/submit, not on every keystroke unless the feedback is genuinely useful.
- On failed submit, focus the error summary, link to invalid fields, and preserve all input.
- Date/time controls display the user's saved timezone when ambiguity exists.
- Native input semantics are preferred; custom composite widgets follow the corresponding ARIA pattern.
