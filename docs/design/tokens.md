# Semantic design tokens

This file owns token meaning and approved values. `shared/design/tokens.css` is its executable CSS representation. Feature components use semantic token names, never hex values or arbitrary Tailwind colors; both files change together when a token contract changes.

## Color roles

| Token | Light | Dark | Use |
|---|---:|---:|---|
| `canvas` | `#F7F7F5` | `#141413` | App and page background |
| `surface` | `#FFFFFF` | `#1C1C1A` | Primary panes and cards |
| `surface-subtle` | `#F1F1EE` | `#242421` | Grouping, disabled regions, skeleton base |
| `surface-hover` | `#EBEBE7` | `#30302C` | Pointer/keyboard hover equivalent |
| `surface-selected` | `#FFF1F3` | `#3A2026` | Selected row or navigation item |
| `surface-elevated` | `#FFFFFF` | `#2B2B28` | Menus, dialogs, popovers |
| `border` | `#E2E2DE` | `#393935` | Dividers and default control borders |
| `border-strong` | `#85857E` | `#6F6F68` | Meaningful control boundary and strong separation |
| `text` | `#22221F` | `#F6F6F3` | Primary text |
| `text-muted` | `#676762` | `#B2B2AA` | Secondary text that must remain readable |
| `text-disabled` | `#92928A` | `#76766F` | Disabled control text only |
| `text-selected` | `#AD263F` | `#FF6B7E` | Text label on `surface-selected` |
| `brand` | `#D63C55` | `#FF6B7E` | Decorative brand mark and non-text emphasis |
| `action` | `#C9304D` | `#C9304D` | Filled primary controls with `text-on-action` |
| `action-hover` | `#AD263F` | `#AD263F` | Filled primary control hover/pressed |
| `text-on-action` | `#FFFFFF` | `#FFFFFF` | Text/icons on `action` |
| `focus-ring` | `#2563EB` | `#75A7FF` | Keyboard focus; intentionally distinct from brand |
| `success` | `#1C7C54` | `#55C993` | Confirmed success with text/icon |
| `warning` | `#8A5A00` | `#F2B84B` | Warning with text/icon |
| `danger` | `#B42318` | `#FF7B72` | Destructive/error state with text/icon |
| `info` | `#1D4ED8` | `#75A7FF` | Informational state with text/icon |

`brand` is not approved as a filled button background because its contrast role differs by theme. Use `action` for filled controls. Disabled colors are exempt only for truly unavailable controls; explanatory text beside them uses `text-muted`.

`border` is a decorative divider and may not be the sole boundary of a control. Inputs and other components whose outline communicates interactivity use `border-strong`, which meets the 3:1 non-text boundary requirement against `surface` in both themes.

## Priority roles

Priority colors are separate from brand and always paired with a label in menus and detail views.

| Token | Light | Dark | Meaning |
|---|---:|---:|---|
| `priority-high` | `#B42318` | `#FF7B72` | High / important |
| `priority-medium` | `#9A6700` | `#F2B84B` | Medium |
| `priority-low` | `#1D4ED8` | `#75A7FF` | Low |
| `priority-none` | `#777770` | `#A2A29A` | None |

## Category palette

Habits and calendar/list accents select one named category token. Event text uses the paired foreground; text never sits directly on the strong accent.

| Name | Light background / foreground | Dark background / foreground |
|---|---|---|
| `coral` | `#FFE7EB` / `#8E2038` | `#45242B` / `#FFB4C0` |
| `amber` | `#FFF1CF` / `#704B00` | `#43351D` / `#FFD77A` |
| `mint` | `#DFF5EA` / `#17613F` | `#203D31` / `#8DE1B8` |
| `sky` | `#E1EFFF` / `#174F91` | `#21364F` / `#9DCAFF` |
| `violet` | `#EEE8FF` / `#59359B` | `#352B4B` / `#CDB8FF` |
| `slate` | `#E9EAE8` / `#4D514C` | `#30322F` / `#C8CBC5` |

## Typography scale

The default font stack is `Geist Sans, Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Inter is a fallback, not a required package.

| Token | Size / line | Weight | Use |
|---|---|---:|---|
| `text-display` | 28 / 34 px | 650 | Marketing or focus timer support, rarely in workspace |
| `text-page-title` | 24 / 30 px | 650 | Screen title |
| `text-section-title` | 18 / 24 px | 650 | Major section/card heading |
| `text-body` | 14 / 20 px | 400 | Default UI and prose |
| `text-row` | 14 / 20 px | 500 | Task/habit primary label |
| `text-compact` | 13 / 18 px | 400 | Dense metadata and calendar labels |
| `text-label` | 12 / 16 px | 600 | Eyebrow, field label, chip; never long prose |

Use `font-variant-numeric: tabular-nums` for time and duration. Do not use text below 12 px.

## Spacing

All layout values derive from the 4 px base grid.

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
| `space-10` | 40 px | Empty state rhythm |
| `space-12` | 48 px | Major section break |
| `space-16` | 64 px | Mobile bottom-navigation reservation |

## Radius, border, and elevation

| Token | Value | Use |
|---|---:|---|
| `radius-control` | 5 px | Inputs, compact buttons, event blocks |
| `radius-card` | 8 px | Cards and grouped surfaces |
| `radius-overlay` | 12 px | Menus, popovers, sheets |
| `radius-dialog` | 16 px | Dialogs and large empty-state panels |
| `radius-pill` | 999 px | Tags, status chips, segmented controls only |
| `border-default` | 1 px | Default divider/control |
| `shadow-overlay` | `0 8px 28px rgb(20 20 19 / 0.14)` | Menus/sheets |
| `shadow-dialog` | `0 18px 56px rgb(20 20 19 / 0.20)` | Modal dialogs |

Dark theme uses the same shadow geometry with increased opacity only when needed for edge perception; pair overlays with `border` so elevation does not depend on shadow.

## Control and layout sizes

- Compact one-line desktop row: 40 px minimum height and no secondary text line.
- Standard two-line task row: 60 px minimum height on desktop and 64 px on touch layouts, with a 4 px title/metadata gap.
- Desktop control target: 36 by 36 px minimum.
- Touch/mobile target: 44 by 44 px minimum.
- Task status indicator: 20 by 20 px inside its larger interactive target.
- Desktop top/content header: 56 px.
- Mobile top bar: 52 px; bottom navigation: 64 px plus safe-area inset.
- Task inspector: 360 px at large desktop.
- Module rail: 52 px; context sidebar: 248 px at large desktop.
- Content reading width: 760 px where a bounded text/list column improves scanning.

## Motion and stacking

| Token | Value | Use |
|---|---:|---|
| `motion-fast` | 100 ms | Hover/pressed feedback |
| `motion-standard` | 160 ms | Menu, row state, small reveal |
| `motion-panel` | 220 ms | Sheet/inspector transition |
| `ease-standard` | cubic-bezier(0.2, 0, 0, 1) | Most transitions |
| `ease-exit` | cubic-bezier(0.4, 0, 1, 1) | Elements leaving |
| `z-base` | 0 | Page content |
| `z-sticky` | 10 | Sticky headers/bottom nav |
| `z-popover` | 30 | Menus/tooltips |
| `z-sheet` | 40 | Inspector/mobile sheets |
| `z-dialog` | 50 | Modal dialog |
| `z-toast` | 60 | Toast/critical transient feedback |

Reduced-motion mode removes panel transforms and uses immediate or no more than 100 ms opacity changes. Never use `transition: all`.
