# Design contract

## Active migration target — Editorial Focus

The first Local-first Full Release work package migrates OpenTask to **Editorial Focus**, using the
visual system documented in the pinned
[GetDesign ElevenLabs source snapshot](https://github.com/VoltAgent/awesome-design-md/blob/e06a96660396d741d0c106c8972172254dafbdc2/design-md/elevenlabs/DESIGN.md).
The local application contract is `docs/design/editorial-focus.md`. It follows the reference's
documented display/sans hierarchy and uses its recommended open-source EB Garamond substitute for
the licensed Waldenburg face; dense product behavior, accessibility states, and OpenTask identity
remain repository-owned.

The Editorial Focus foundation and every current product route form the approved visual baseline.
Later feature UI extends this system through the routed contracts below; broad restyling or shared
foundation changes require explicit scope, executable design checks, and new visual approval.

OpenTask uses **Editorial Focus**: an original paper/ink/pine planning system with an editorial voice
at major orientation moments, readable Inter typography for working UI, comfortable task density,
and unusually clear interaction states.

This is not an ElevenLabs, GetDesign, Airbnb, or TickTick clone. Do not copy their assets,
proprietary fonts, wording, icon treatment, screen composition, exact palette, or trade dress.
OpenTask uses original layouts, Lucide icons, open fonts, semantic tokens, and its own product voice.

## North star

The interface should make a busy day feel understandable in under five seconds:

1. What matters now is visually dominant.
2. The next useful action is obvious but never pushy.
3. Dense task information remains scannable.
4. AI suggestions always look like reviewable proposals, never completed work.
5. Desktop speed and mobile clarity are equally intentional.

Warmth comes from paper-like color, spacing, plain language, and gentle geometry. Focus comes from
ink-first hierarchy, comfortable rows, consistent alignment, visible state, and strong keyboard
behavior. Decorative imagery, oversized promotional cards, glass effects, and novelty animation do
not belong in the product workspace.

## Product design principles

- **Manual first:** every core workflow remains clear when AI is unavailable.
- **One record, many views:** Inbox, Today, calendar, agenda, and matrix look different but never imply separate copies of a task.
- **Quiet until needed:** secondary metadata recedes; conflicts, overdue work, permission problems, and destructive actions do not.
- **Review before consequence:** completion, destructive actions, calendar moves, and planner apply have visible outcomes and recovery where appropriate.
- **Accessible equivalence:** drag, hover, color, and gestures are enhancements, never the only path.
- **Honest state:** offline, unavailable providers, empty results, and stale data are named directly.
- **Original voice:** concise, specific, human copy; no competitor language or branded patterns.

## Routed design sources

Read only the files relevant to the surface being changed, after this file.

| Concern | Source of truth |
|---|---|
| Active visual target and migration boundary | `docs/design/editorial-focus.md` |
| Brand character, hierarchy, type, icon and motion direction | `docs/design/foundations.md` |
| Semantic colors, spacing, type scale, radii, elevation, motion | `docs/design/tokens.md` |
| Breakpoints, app shell, panes, navigation, responsive behavior | `docs/design/shell-responsive.md` |
| Shared component anatomy and interaction contracts | `docs/design/components.md` |
| WCAG, keyboard, touch, focus, announcements, charts | `docs/design/accessibility.md` |
| Public landing, first-run orientation, demo CTA | `docs/design/screens/landing.md` |
| Sign in and sign up | `docs/design/screens/auth.md` |
| Preferences, AI provider status, JSON export | `docs/design/screens/settings.md` |
| Inbox and regular task-list behavior | `docs/design/screens/inbox.md` |
| Today task projection | `docs/design/screens/today.md` |
| Inspector and mobile task-detail route | `docs/design/screens/task-details.md` |
| Month, week, day, and agenda planning | `docs/design/screens/calendar.md` |
| Derived Eisenhower projection | `docs/design/screens/matrix.md` |
| Habit management and history after P3 | `docs/design/screens/habits.md` |
| Pomodoro, stopwatch, and Focus history after P4 | `docs/design/screens/focus.md` |
| Reality-aware planner input, review, and apply | `docs/design/screens/assistant.md` |

Feature scope remains owned by `docs/SCOPE.md`; a design document cannot add a feature.

## Implementation rules

- Components consume semantic CSS variables or token-backed Tailwind utilities. Raw color literals belong only in the token definition layer.
- Shared presentation primitives consume token-backed typography and radii; `pnpm verify:design` rejects local replacements and checks browser-computed component contracts.
- Use shadcn/Radix primitives and Lucide icons from `docs/STACK.md`; do not create a second component system.
- Prefer a 4 px spacing grid and align row metadata to stable columns on wide screens.
- Default task density is compact; touch layouts increase hit areas without inflating the visual hierarchy.
- Body text never conveys status by color alone. Pair color with text, shape, icon, pattern, or position.
- Every drag/resize path has a visible Edit/Move menu or form alternative.
- Every committed screen implements the state contract in its routed file before being called complete.
- UI copy uses sentence case. Buttons use a verb plus object when ambiguity exists: “Create task”, “Apply 4 changes”.
- Destructive actions use the danger token only at the point of consequence and require confirmation when undo cannot recover the result.

## Design review gate

Before UI sign-off, verify:

- default, empty, loading, error, offline, and relevant unavailable/permission states;
- keyboard-only completion of every action, including reorder and schedule editing;
- responsive behavior at 1440, 1024, 768, 390, and 320 CSS px;
- light, dark, system theme, reduced motion, and 200% zoom;
- WCAG 2.2 AA contrast, focus visibility, names, roles, and announcements;
- no copied competitor assets, copy, layouts, fonts, or visual identity;
- no feature outside `docs/SCOPE.md` and no dead control for a later feature.
- shared component evidence states the expected token, computed value, and target size; visual inspection alone is insufficient.
