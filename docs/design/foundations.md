# Visual and product foundations

## Editorial Focus

Editorial Focus is calm and spacious at moments of orientation, then efficient and exact where work
happens. It combines original warm-paper surfaces, near-black ink actions, a restrained pine brand
signal, readable operational typography, and a limited editorial display voice. It adapts principles
from `editorial-focus.md`; it does not reproduce an external product identity.

The result should feel:

- calm, not sleepy;
- editorial at major moments, not ornamental everywhere;
- warm, not beige or nostalgic;
- comfortable, not loose;
- precise, not clinical;
- original to OpenTask, not like a re-skinned competitor.

## Hierarchy

Each screen has three visual levels:

1. **Orientation:** page title, local date/range, view selector, and one primary action.
2. **Work:** tasks, calendar events, or planner changes.
3. **Context:** metadata, filters, counts, explanations, and secondary actions.

Only one element in a local decision surface receives the filled action treatment. Near-black/light
ink, not pine, owns primary action contrast. Pine identifies OpenTask, current context, and selected
states. Secondary actions remain neutral, outlined, or quiet.

Task titles and proposal actions are stronger than metadata. Overdue, conflict, permission, and
provider-unavailable states may interrupt the quiet hierarchy because they require attention.

## Typography

- Inter Variable is the self-hosted working face for body text, tasks, forms, menus, navigation,
  calendar labels, metadata, and planner diffs.
- EB Garamond Variable at its genuine 400 endpoint is limited to landing, first-run, selected major
  empty-state headings, and explicitly approved editorial moments. It is never a blanket
  workspace-heading rule.
- Workspace page titles stay compact and sans-serif so the work remains dominant.
- Use the scales in `tokens.md`; do not create one-off display sizes or shrink operational copy
  below 12 px.
- Use tabular numerals for durations, counts, and aligned time columns.
- Limit regular prose to about 70 characters per line. Inspector descriptions may be wider because
  they are working content.
- Use weight before size to distinguish nearby levels and never rely on faint gray text.

## Shape and density

- Major public/decision CTAs may be pills. Compact workspace buttons, inputs, menus, and calendar
  events use the efficient control radius.
- Task rows remain visually light and divided; they do not become individual floating cards.
- Cards are reserved for units with their own state/action boundary, such as planner proposals or
  settings groups.
- Standard two-line task rows use the comfortable 64/68 px contract while keeping 36/44 px targets
  and stable metadata alignment.
- Borders define editing surfaces and overlays. Default cards use hairlines, not shadows. Shadows
  communicate genuine overlay/dialog elevation only.
- Mobile preserves the same hierarchy with larger targets and progressive disclosure rather than
  inflating every element.

## Atmosphere

Atmospheric fields are low-contrast decoration, not a universal product signature.

- Use at most two token-backed fields in one landing, first-run, major empty-state, or restrained
  planner-framing composition.
- Keep them behind solid readable content and hidden from assistive technology.
- Never place them in task rows, calendar cells, Matrix quadrants, form controls, banners, alerts,
  or status/category encoding.
- Do not copy reference gradients, positions, shapes, or audio/waveform motifs.

## Iconography and imagery

- Use Lucide icons at a consistent optical size. Do not mix icon packs.
- Every unlabeled icon button has an accessible name and a tooltip on pointer-capable screens.
- Selected navigation combines icon, label where space permits, and a surface treatment.
- Priority and status never depend on icon or color alone.
- Workspace screens avoid stock photography and generic AI illustration. Empty states need no image
  unless a small original geometric element materially improves comprehension.
- The landing page may compose original product UI, never competitor screenshots.

## Content voice

Use plain, specific language:

- “Nothing planned for today” instead of “You're all caught up!”
- “Planning is unavailable because no AI key is configured” instead of “Something went wrong”.
- “This task changed elsewhere. Review the latest version.” instead of “409 conflict”.
- “Review 6 proposed changes” instead of “AI magic complete”.

Do not shame missed tasks or broken streaks. Avoid exclamation marks in routine success feedback.
Explain what happened, whether data was saved, and the next available action.

## Motion

Motion explains continuity: an inspector opening from a selected row, a reordered item settling, or
a proposal expanding. It never delays work.

- Use the duration/easing tokens in `tokens.md`.
- Avoid parallax, bouncing, confetti, and autoplay illustration.
- With reduced motion, replace transforms with immediate state changes or short opacity changes.

## Product-specific rules

- Tasks use a checkbox/status control, not card color, as their primary completion affordance.
- Priority uses a labeled menu and a small semantic marker; brand pine is not a priority color.
- Calendar categories retain paired readable foregrounds and a label/marker.
- AI proposal cards remain neutral until explicitly selected. Brand color does not imply model
  confidence.
- Offline and provider-unavailable explanations remain visible until the condition changes or a
  safely dismissible explanation is dismissed.
