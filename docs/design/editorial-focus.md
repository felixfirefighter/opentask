# Editorial Focus migration target

## Status and authority

Editorial Focus is the active visual target for P0 of the Local-first Full Release. The approved
P0.1 proof freezes its shared font/token foundation and five proof surfaces for the broad P0.2
product migration. `DESIGN.md`, this contract, `foundations.md`, `tokens.md`, and their executable
checks change together.

This file cannot add product behavior. Feature scope remains owned by `docs/SCOPE.md`.

## Reference boundary

The active external reference is the immutable
[GetDesign ElevenLabs source snapshot](https://github.com/VoltAgent/awesome-design-md/blob/e06a96660396d741d0c106c8972172254dafbdc2/design-md/elevenlabs/DESIGN.md).
That analysis primarily describes a public marketing system and only partially captures in-product
surfaces. OpenTask follows its documented typography hierarchy, spacing rhythm, restrained action
hierarchy, and atmospheric boundaries where they apply, while this repository remains the
executable source of truth for dense planning UI, semantic states, accessibility, and dark mode.

The reference uses licensed Waldenburg Light for display and explicitly names EB Garamond at weight
300 as an open-source substitute. The official EB Garamond variable asset has a real 400–800 weight
axis, so OpenTask uses its genuine 400 endpoint rather than misdeclaring or synthesizing a 300
master. Inter remains the reference's working face for body, navigation, captions, and controls.

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

- Display face: self-hosted **EB Garamond Variable**, used at its genuine 400 weight, with its OFL
  notice committed. The vendored source provides a 400–800 axis; display UI never requests a
  nonexistent 300 master.
- Working UI: self-hosted **Inter Variable**, normally used at weights 400–600, with system fallbacks
  and its OFL notice committed.
- Serif is a display voice, not a universal product font. Dense information, input, task, calendar,
  and planner-diff content stays sans-serif.
- The responsive landing hero follows the reference's 64/1.05/-1.92 px, 48/1.08/-0.96 px, and
  36/1.17/-0.36 px display tiers. Small editorial headings use 24/1.2/0. The weight is 400 only for
  the verified EB Garamond axis caveat above.
- P0.1 uses 15/22 px task titles, 13/18 px metadata, 64 px fine-pointer rows, and 68 px coarse-pointer
  rows. `docs/design/tokens.md`, `shared/design/tokens.css`, and computed design tests own these exact
  values together.
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
trade dress. The pinned external analysis informs this contract but never overrides product scope,
accessibility, or executable repository checks.

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
