# Semantic design tokens

This file owns token meaning and approved values. `shared/design/tokens.css` is its executable CSS
representation. Feature components use semantic token names, never hex values or arbitrary Tailwind
colors; both files change together when a token contract changes.

## Core color roles

| Token | Light | Dark | Use |
|---|---:|---:|---|
| `canvas` | `#F4F1E9` | `#181914` | Warm paper/warm-black page background |
| `surface` | `#FCFBF7` | `#20211C` | Primary panes and cards |
| `surface-subtle` | `#ECE8DE` | `#292A24` | Grouping, disabled regions, skeleton base |
| `surface-hover` | `#E4DED3` | `#34362F` | Pointer/keyboard hover equivalent |
| `surface-selected` | `#E3EFEA` | `#243B35` | Selected row or navigation item |
| `surface-elevated` | `#FFFDF8` | `#2C2D27` | Menus, dialogs, popovers |
| `border` | `#D7D0C4` | `#41433B` | Decorative hairline/divider only |
| `border-strong` | `#77756E` | `#74776E` | Meaningful control boundary |
| `text` | `#24251F` | `#F3F0E7` | Primary text |
| `text-muted` | `#63635C` | `#B9B6AC` | Readable secondary text |
| `text-disabled` | `#74746D` | `#8B8D84` | Truly disabled control labels only |
| `text-selected` | `#255D50` | `#9FDEC9` | Text on selected surface |
| `brand` | `#2D7565` | `#78C4AD` | OpenTask mark and non-text emphasis |
| `action` | `#252823` | `#EEE9DC` | Filled primary control |
| `action-hover` | `#3A3E38` | `#D9D2C3` | Filled primary hover/pressed |
| `text-on-strong` | `#FEFCF7` | `#20211C` | Text/icons on audited action, brand, status, and destructive fills |
| `focus-ring` | `#2A61B8` | `#79A9F2` | Keyboard focus, distinct from brand |
| `success` | `#217551` | `#75D5A1` | Confirmed success with text/icon |
| `warning` | `#865700` | `#F2C36A` | Warning with text/icon |
| `danger` | `#B42A25` | `#FF8D85` | Destructive/error state |
| `info` | `#245DB7` | `#8EB8FF` | Informational state |

`border` is intentionally quiet and cannot be the sole boundary of an input or interactive region.
Controls use `border-strong`. `text-disabled` may fall below normal-text contrast on grouped
surfaces, so it is restricted to genuinely unavailable labels; the adjacent explanation uses
`text-muted`. Focus uses the global two-pixel offset so the ring is measured against the exterior
surface, not directly against the filled action.

## Priority roles

Priority color is always paired with label, icon, or stable position.

| Token | Light | Dark |
|---|---:|---:|
| `priority-high` | `#B42A25` | `#FF8D85` |
| `priority-medium` | `#8C5B00` | `#F2C36A` |
| `priority-low` | `#245DB7` | `#8EB8FF` |
| `priority-none` | `#696A62` | `#A8AAA1` |

## Category pairs

Calendar/list accents use a named background/foreground pair; readable text never sits directly on
a strong accent.

| Name | Light background / foreground | Dark background / foreground |
|---|---|---|
| `coral` | `#F6E2E3` / `#783B42` | `#4A2E31` / `#F4B6B9` |
| `amber` | `#F3E7C9` / `#684E16` | `#43391F` / `#F0CD7C` |
| `mint` | `#DDECE1` / `#2B6248` | `#263F34` / `#A3DDBA` |
| `sky` | `#DEE9F3` / `#315F84` | `#273A4A` / `#AFD1EB` |
| `violet` | `#E8E1F1` / `#5E467A` | `#3A3147` / `#D3BBE5` |
| `slate` | `#E6E4DE` / `#51534D` | `#353730` / `#D0D0C8` |

## Atmospheric decoration

These tokens are decorative only and may appear on landing, first-run, major empty states, or
restrained planner framing. Use no more than two fields in one composition, at `0.72` light/`0.55`
dark opacity and `64px` blur. They cannot encode state or appear in task rows, calendar cells,
Matrix quadrants, controls, alerts, or status fills.

| Token | Light | Dark |
|---|---:|---:|
| `atmosphere-moss` | `#D9E7DC` | `#2A3C32` |
| `atmosphere-clay` | `#F0DECE` | `#413329` |
| `atmosphere-iris` | `#E4DDEF` | `#353044` |
| `atmosphere-mist` | `#D9E7EC` | `#283A42` |
| `atmosphere-blush` | `#EFDCDD` | `#402E32` |

## Typography

The interface self-hosts Inter Variable and Newsreader Variable through `next/font/local`. Inter is
the working face; Newsreader is a limited display voice. System fallbacks keep rendering usable if a
font asset fails.

| Token | Size / line | Weight | Use |
|---|---|---:|---|
| `text-display` | `clamp(38px, 5vw, 60px)` / `1.06` | 350 | Landing/first-run/major empty moments only; `-0.025em` tracking |
| `text-page-title` | 26 / 32 px | 600 | Compact workspace title, sans by default |
| `text-section-title` | 20 / 26 px | 600 | Major section/card heading |
| `text-body` | 15 / 22 px | 400 | Default UI and prose |
| `text-row` | 15 / 22 px | 500 | Task primary label |
| `text-compact` | 13 / 18 px | 400 | Metadata and calendar labels |
| `text-label` | 12 / 16 px | 600 | Eyebrow, field label, chip; never long prose |

Use `font-variant-numeric: tabular-nums` for time and duration. Do not use text below 12 px. Dense
task, calendar, form, menu, planner-diff, and settings content never uses the serif display face.

## Spacing

All layout values derive from the four-pixel base grid.

| Token | Value | Typical use |
|---|---:|---|
| `space-0` | 0 | Reset |
| `space-1` | 4 px | Tight icon/text gap |
| `space-2` | 8 px | Inline controls, compact padding |
| `space-3` | 12 px | Row gap/padding |
| `space-4` | 16 px | Default card/form gap |
| `space-5` | 20 px | Compact screen gutter |
| `space-6` | 24 px | Desktop screen gutter, section gap |
| `space-8` | 32 px | Large section separation |
| `space-10` | 40 px | Empty-state rhythm |
| `space-12` | 48 px | Major section break |
| `space-16` | 64 px | Mobile bottom-navigation reservation |

## Shape and elevation

| Token | Value | Use |
|---|---:|---|
| `radius-control` | 8 px | Inputs, compact buttons, event blocks |
| `radius-card` | 12 px | Cards and grouped surfaces |
| `radius-overlay` | 16 px | Menus, popovers, sheets |
| `radius-dialog` | 20 px | Dialogs and large empty-state panels |
| `radius-pill` | 999 px | Major CTA, tags, chips, segmented controls |
| `border-default` | 1 px | Default divider/control |
| `shadow-overlay` | `0 12px 32px rgb(37 35 28 / 0.14)` | Light menus/sheets |
| `shadow-dialog` | `0 28px 72px rgb(37 35 28 / 0.20)` | Light dialogs |

Dark overlays use `0 16px 40px rgb(0 0 0 / 0.44)` and dialogs use
`0 32px 80px rgb(0 0 0 / 0.56)`. Cards have no default shadow; hairlines carry grouping and shadows
communicate true elevation only.

## Control and layout sizes

- Compact one-line row: 44 px minimum and no secondary line.
- Standard two-line task row: 64 px minimum on fine-pointer layouts and 68 px when a coarse pointer
  is available, with a 4 px title/metadata gap and 8 px content padding.
- Desktop target: 36 by 36 px minimum; touch target: 44 by 44 px minimum.
- Task status indicator: 20 by 20 px inside its larger target.
- Desktop top/content header: 56 px; mobile top bar: 52 px; bottom navigation: 64 px plus safe area.
- Task inspector: 360 px at large desktop; module rail: 52 px; context sidebar: 248 px.
- Content reading width: about 760 px where a bounded list/text column improves scanning.

## Motion and stacking

| Token | Value | Use |
|---|---:|---|
| `motion-fast` | 100 ms | Hover/pressed feedback |
| `motion-standard` | 160 ms | Menu, row state, small reveal |
| `motion-panel` | 220 ms | Sheet/inspector transition |
| `ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Most transitions |
| `ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Elements leaving |
| `z-base` through `z-toast` | 0, 10, 30, 40, 50, 60 | Base, sticky, popover, sheet, dialog, toast |

Reduced-motion mode removes panel transforms and uses immediate or no more than 100 ms opacity
changes. Never use `transition: all`.

## Verified contrast floor

The executable design check pins every canonical light token and dark override, recomputes the
required pairs, and verifies this evidence line against the current palette. The approved palette
provides at least 4.5:1 for normal text and at least 3:1 for meaningful boundaries/focus.

Computed contract ratios (light/dark): primary 12.63/12.70; muted 5.36/7.99; action 10.63/10.77;
strong border 4.45/3.56; focus 4.90/5.01; category 5.50/7.02.
