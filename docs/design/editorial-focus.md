# Editorial Focus migration target

## Status and authority

Editorial Focus is the active visual target for P0 of the Local-first Full Release. It is a target,
not a claim that the current application already conforms. `DESIGN.md` and its existing routed
contracts remain executable truth until P0 changes documentation, tokens, checks, and implementation
together and the user approves the visual proof.

This file cannot add product behavior. Feature scope remains owned by `docs/SCOPE.md`.

## Reference boundary

The research input is the immutable
[GetDesign ElevenLabs source snapshot](https://github.com/VoltAgent/awesome-design-md/blob/e06a96660396d741d0c106c8972172254dafbdc2/design-md/elevenlabs/DESIGN.md).
That analysis primarily describes a public marketing system and only partially captures in-product
surfaces. OpenTask therefore adapts high-level principles to a dense planning product; it does not
install, copy, or track the external file as its design system.

The catalog summary and the source snapshot describe different moods. For reproducibility, this
contract follows the snapshot's light, quietly editorial direction rather than a dark cinematic or
audio-waveform interpretation.

## Intended character

Editorial Focus should feel:

- calm and spacious where the user is orienting, but efficient where the user is working;
- paper-like and warm, with ink-first hierarchy and precise neutral boundaries;
- editorial in major moments, but highly legible and sans-serif in operational controls;
- atmospheric on public, first-run, empty, and planner-framing surfaces, never decorative inside
  dense task or calendar work;
- original to OpenTask, with no borrowed product identity or audio-product metaphor.

## Adopt, adapt, reject

| Research principle | OpenTask adaptation | Boundary |
|---|---|---|
| Warm off-white canvas and near-black ink | Original warm paper/ink semantic tokens with separately tested light and dark themes | Do not copy exact external palette values |
| Editorial display typography | An OFL-licensed variable serif for landing, first-run, empty-state, and selected high-level headings | Task rows, forms, menus, calendar labels, metadata, and working prose remain UI sans |
| Restrained hierarchy and one dominant action | Ink-first primary CTA at each decision surface; neutral secondary and quiet utility controls | Routine compact workspace controls are not all promoted to pills |
| Hairlines and soft elevation | Neutral dividers plus one restrained elevation tier | Inputs and focus boundaries remain strong enough for WCAG 2.2 AA |
| Rounded cards and pill CTAs | Softer cards/dialogs, pills for major CTAs, chips, status, and segmented controls | Task rows remain light divided rows; menus and form controls keep efficient geometry |
| Pastel atmospheric fields | Original low-contrast fields on landing, onboarding, empty states, or restrained planner framing | No orbs/gradients in task rows, calendar cells, Matrix, alerts, controls, or status encoding |
| Generous public section rhythm | Roomy landing and onboarding composition | Marketing-scale spacing is not imported into the authenticated workspace |

## Typography and density target

- Preferred display candidate: self-hosted **Newsreader Variable**, weights 300–400, with its OFL
  notice committed when the font is added.
- Preferred working UI: self-hosted **Inter Variable**, weights 400–600, with system fallbacks and
  its OFL notice committed when the font is added.
- Serif is a display voice, not a universal product font. Dense information, input, task, calendar,
  and planner-diff content stays sans-serif.
- P0 must test task titles at approximately 15/22 px and standard metadata at no less than the
  readable compact scale. Exact values become canonical only when `docs/design/tokens.md`,
  `shared/design/tokens.css`, and computed design tests change together.
- Standard two-line task rows should begin the proof near 64 px on desktop and may grow modestly on
  coarse-pointer layouts. The proof decides the final values; density must feel comfortable rather
  than loose.
- Public display type may scale responsively. Authenticated workspace titles remain subordinate to
  the work and cannot consume marketing-scale vertical space.

## Shape, color, and atmosphere

- Light theme uses an original warm paper canvas, white or near-paper working surfaces, dark ink,
  and quiet warm-neutral borders.
- Dark theme is an OpenTask-owned inversion: warm-black canvas, lifted neutral panes, visible
  hairlines, paper-white text, readable muted text, and independently tested semantic colors. Do not
  mechanically invert the light palette.
- Primary actions may use ink-filled pill geometry in major decision surfaces. Compact buttons,
  inputs, calendar events, menus, and toolbar controls retain efficient non-pill geometry.
- Retain explicit focus, success, warning, danger, info, priority, and category roles. The reference
  is not sufficient to define these operational states.
- Atmospheric fields are decoration only. They cannot carry meaning, reduce text contrast, compete
  with controls, or become a repeated signature across working screens.

## Accessibility and interaction invariants

- Repository requirements override the reference: 44 px touch targets, visible 3:1 control/focus
  boundaries, WCAG 2.2 AA text contrast, keyboard equivalents, 200% zoom, and reduced motion remain
  mandatory.
- Comfortable text cannot be achieved by enlarging type without rechecking wrapping, row actions,
  calendar density, dialogs, and 320/390 px reflow.
- Light, dark, and system themes are supported. Color never becomes the only state cue.
- The migration changes visual treatment only. Existing semantics, focus behavior, announcements,
  drag alternatives, and state contracts remain intact.

## Originality guardrails

Do not use ElevenLabs or GetDesign names in shipped product UI. Do not copy their wordmark, product
copy, photography, proprietary typefaces, exact palette, exact gradients, navigation, marketing
sections, cards, pricing/testimonial composition, audio players, voice rows, waveform motifs, or
trade dress. Do not run a generator that overwrites the repository design contract with the
external file.

OpenTask retains its own brand mark, Lucide icon system, product voice, application shell, task
anatomy, screen contracts, and planning-specific interaction model.

## Visual-proof approval gate

Before the broad migration, render real components with deterministic data for:

1. Landing.
2. Today.
3. Calendar.
4. Task inspector and mobile task details.
5. Populated AI Review.

Capture each at 1440 and 390 CSS px in light theme, representative dark-theme proofs, and task/landing
boundary evidence at 768 and 320 px. Include default and one meaningful non-default state where it
materially changes the visual system. Compare against the current implementation and stop for
explicit user approval.

The approved proof freezes the shared token and primitive direction. Subsequent presentation lanes
may implement the remaining screens, but they may not invent a separate palette, type scale,
button hierarchy, radius system, or atmosphere treatment.
