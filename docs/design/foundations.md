# Visual and product foundations

## Warm Precision

Warm Precision balances an approachable personal tool with the rigor of a planning instrument. It borrows only high-level inspiration from warm hospitality interfaces: soft neutral surfaces, rounded corners, generous breathing room around major decisions, and a coral accent. It deliberately replaces photography, large promotional cards, floating marketplace controls, and expressive brand type with compact rows, stable grids, and clear data hierarchy.

The result should feel:

- calm, not sleepy;
- friendly, not playful;
- dense, not cramped;
- precise, not clinical;
- optimistic, not celebratory by default.

## Hierarchy

Each screen has three visual levels:

1. **Orientation:** page title, local date/range, view selector, and one primary action.
2. **Work:** tasks, calendar events, or planner changes.
3. **Context:** metadata, filters, counts, explanations, and secondary actions.

Only one element in a local surface should use the filled action treatment. A page can contain multiple actions, but secondary actions use neutral, outline, or text treatments. Brand coral is not a generic highlight marker.

Task title and proposal action are stronger than their metadata. Overdue, conflict, and provider-unavailable states may interrupt the quiet hierarchy because they require attention.

## Typography

- Use Geist Sans when available through the approved Next.js font path; otherwise use the documented system sans stack. Never use a proprietary competitor font.
- Use tabular numerals for durations, counts, and aligned time columns.
- Page titles are compact and sentence case. Avoid display-sized headings inside the authenticated workspace.
- Body and row text use the scales in `tokens.md`; do not create one-off sizes.
- Limit regular prose to about 70 characters per line. Task descriptions can be wider in the inspector because they are working content.
- Use weight before size to distinguish nearby levels; do not rely on faint gray text below contrast requirements.

## Shape and density

- Corners are softened, not pill-shaped by default. Pills are reserved for tags, status chips, and segmented controls.
- Task rows are visually light, separated by whitespace or a subtle divider rather than individual cards.
- Cards are used when a unit has its own state or action boundary: planner proposal or settings group.
- The desktop workspace favors compact controls and stable alignment. Mobile preserves the same information hierarchy with larger targets and progressive disclosure.
- Borders define editing surfaces and overlays. Shadows communicate elevation, not decoration.

## Iconography and imagery

- Use Lucide icons at a consistent optical size. Default stroke is the library standard; do not mix icon packs.
- Every unlabeled icon button has an accessible name and tooltip on pointer-capable screens.
- Selected navigation combines icon, label when space permits, and a surface treatment.
- Priority and status never depend on an icon alone.
- Workspace screens do not use stock photography or generic AI illustrations. Empty states use a small original geometric illustration only if it improves comprehension; text and action must stand without it.
- The landing page may use original product UI compositions, never copied competitor screenshots.

## Content voice

Use plain, specific language:

- “Nothing planned for today” instead of “You're all caught up!”
- “Planning is unavailable because no AI key is configured” instead of “Something went wrong”.
- “This task changed elsewhere. Review the latest version.” instead of “409 conflict”.
- “Review 6 proposed changes” instead of “AI magic complete”.

Do not shame missed tasks or broken streaks. Avoid exclamation marks in routine success feedback. Explain what happened, whether data was saved, and the next available action.

## Motion

Motion explains continuity: an inspector opening from a selected row, a reordered item settling, or a proposal expanding. It must not delay work.

- Use the duration and easing tokens in `tokens.md`.
- Avoid parallax, bouncing, confetti, and autoplay illustration.
- With reduced motion, replace transforms with immediate state changes or short opacity transitions.

## Product-specific visual rules

- Tasks use a checkbox/status control, not card color, as their primary completion affordance.
- Priority uses a labeled menu and a small semantic marker; coral remains the product action color.
- Calendar category colors always retain readable event text and an additional identifying label or marker.
- AI proposal actions use neutral cards until selected. Selection is explicit; coral does not imply model confidence.
- Offline and AI-provider-unavailable banners remain visible until the condition changes or the user dismisses a safely dismissible explanation.
