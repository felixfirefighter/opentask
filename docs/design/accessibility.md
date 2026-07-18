# Accessibility contract

The target is WCAG 2.2 AA across authenticated product, landing/auth, and demo flows. Automated axe checks are required but do not replace keyboard, screen-reader, zoom, contrast, and touch review.

## Structure and navigation

- Every page has one descriptive `h1` and a logical heading order.
- Use `header`, `nav`, `main`, `aside`, and `footer` landmarks with labels when more than one of a kind exists.
- Provide a first-focus “Skip to main content” link in authenticated and public shells.
- Route changes move focus to the page heading or an explicit route-focus target and announce the new title.
- Links navigate; buttons perform actions. Do not make generic containers clickable without native semantics.
- Current navigation uses `aria-current="page"`; selected options use the pattern appropriate to their widget.

## Keyboard and focus

- All actions work with keyboard alone in a logical order; no keyboard trap exists outside a correctly implemented modal.
- Focus uses the `focus-ring` token with at least a 2 px visible outline and sufficient offset from the component edge.
- Focus is never removed because a pointer is present. Hover-revealed controls also appear for `:focus-within`.
- Opening a dialog/sheet moves focus inside; closing returns it to the trigger or a stable logical fallback.
- `Escape` closes the topmost dismissible overlay. It never discards unsaved input without warning.
- `Mod+K` opens command search. Application shortcuts do not override browser or assistive-technology conventions.
- Drag/reorder follows `components.md`; schedule editing always has a form path.

## Touch and pointer

- Interactive targets are at least 44 by 44 CSS px on touch layouts and 36 by 36 px on compact desktop. Small visible controls may use a larger invisible hit area without overlapping neighbors.
- Do not require hover, precise drag, multipoint gesture, long press, or swipe.
- Pointer cancellation is supported: consequential actions happen on release and can be aborted by moving away where native behavior allows.
- Tooltips supplement, never replace, visible labels or accessible names.

## Color, text, and zoom

- Normal text meets 4.5:1 contrast; large text meets 3:1; meaningful component boundaries and focus indicators meet 3:1 against adjacent colors.
- Status, priority, completion, habit intensity, proposal validity, and calendar identity use a non-color cue.
- Text remains usable at 200% zoom and browser text-only resizing; no essential content is clipped at 400% reflow except permitted two-dimensional calendar regions.
- Truncation does not hide the only copy of essential content; full text is available through focus/activation or the detail view.
- Respect user theme and `prefers-contrast` where practical without creating an unsupported theme system.

## Motion and time

- Respect both saved reduced-motion preference and `prefers-reduced-motion`; the more restrictive value wins.
- No content flashes more than three times per second.
- Timed focus sessions do not expire a form or force navigation. Timer status remains readable without observing animation.
- Toasts containing an action remain long enough to operate and pause on focus/hover; persistent errors use inline or banner treatment instead.

## Forms and errors

- Labels, descriptions, required/optional status, format hints, and errors are programmatically associated.
- Error summaries identify all invalid fields and receive focus after a failed submit.
- Authentication errors do not reveal whether another person's email exists.
- Destructive confirmation describes the object and consequence; the confirmation action is not the initial focused control when cancellation is safer.
- Changing a date, recurrence, reminder, or timezone shows the interpreted result in plain language before commit when ambiguity is possible.

## Dynamic updates

- A polite status live region announces save completion, optimistic rollback, list reorder, task completion/undo, habit check-in/undo, calendar move, and planner progress.
- Critical session loss or failed atomic apply uses an assertive alert only when immediate attention is required.
- Do not announce timer ticks, animation frames, every search keystroke, or each skeleton.
- Optimistic changes that roll back return focus to the affected action and state what was restored.

## Composite widgets

- Command/search palette follows combobox/listbox semantics with an exposed active option.
- Menus support Arrow keys, Home/End, Enter/Space, and Escape according to the ARIA menu pattern.
- Tabs use tab semantics only when panels switch in place; navigation links styled as tabs remain links.
- Calendar exposes a meaningful event list/agenda alternative. Grid cells and events have full date/time names, not visual abbreviations only.
- Matrix quadrants are labeled regions or lists, not an inaccessible visual-only 2x2 chart.

## Charts and visual summaries

- Habit heat map cells have accessible habit/date/value/status names and a textual current/best streak summary.
- Focus totals have textual values; any bars are supplemental and excluded from the accessibility tree when redundant.
- Category legends pair swatch, label, and accessible text.
- Empty and zero states are distinguishable.

## Offline and unavailable states

- The global offline banner is announced once when connectivity changes and says that writes are disabled.
- Disabled mutations have an explanation discoverable without hover.
- AI and push unavailable states name the missing capability and preserve manual alternatives.
- Cached/stale content is labeled; the UI never announces an unsynced local mutation as saved.

## Required manual audit

For each changed screen:

1. Complete its primary path using keyboard only.
2. Check visible focus, order, overlay return, and drag alternatives.
3. Test a representative screen-reader path with VoiceOver or equivalent.
4. Test 200% zoom and 390 px responsive reflow.
5. Test light/dark contrast and forced or increased contrast where available.
6. Enable reduced motion.
7. Verify default, empty, loading, error, offline, and relevant permission/provider states.
8. Run the automated accessibility command required by `docs/QUALITY.md`.
