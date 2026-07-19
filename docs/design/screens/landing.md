# Landing, demo entry, and first run

## Purpose and route

`/` introduces OpenTask's working product direction, demonstrates the coherent release loop, and offers three honest paths: Create account, Sign in, and Try demo. It is original marketing UI, not a parity chart or competitor comparison.

After account/demo creation, a lightweight first-run orientation helps the user take the first action. It is part of the product entry experience, not a multi-step setup wizard.

## Layout

Use a simple public header with original working-name treatment, Sign in, and Create account. The hero has:

- one outcome-led `h1`;
- a short explanation that manual planning works without AI;
- “Create account” as primary and “Try demo” as secondary;
- one original, responsive product composition showing a Today list beside a review-before-apply proposal or calendar fragment.

The composition is built from the product's own primitives and sample data. Never use TickTick/Airbnb screenshots, marks, proprietary fonts, exact layouts, or promotional language.

Below the hero, no more than three concise sections explain:

1. tasks and active calendar planning in one self-hostable app;
2. optional reality-aware planning with explicit review before apply;
3. open-source use without artificial premium gates.

The footer includes project/license-source destinations when they exist and the independence statement. Do not show third-party logos as endorsements or claim native/offline/collaboration capabilities outside scope.

## Demo entry

“Try demo” explains before action that the server creates or resets an isolated sample dataset for this visitor. It never publishes shared credentials. While seeding, keep the CTA location stable and use one honest progress label unless the server exposes real granular stages. On success, enter the demo Inbox with sample tasks, schedules, and a planner-ready scenario that support the submission narrative.

Demo copy makes sample/reset behavior clear and does not imply persistence guarantees the backend has not implemented.

## First-run orientation

After sign-up, the atomically created Inbox opens immediately. A small non-modal orientation points out:

1. quick add;
2. Today;
3. command search.

It can be dismissed at any point, never blocks task creation, and does not require users to configure AI or preferences. The user's default timezone preference is visible through normal settings, not a mandatory wizard.

Demo first run may use the same orientation but must not cover the seeded task that begins the demo story.

## State contract

| State | Required presentation |
|---|---|
| Default | Original hero/product composition, three entry actions, bounded capability story, and truthful footer. Signed-in visitors see “Open app” in place of redundant auth emphasis. |
| Empty | Marketing no-data empty state is not applicable. If the product composition cannot load, retain the complete text/CTA hierarchy rather than an empty frame. |
| Loading | Static content renders first. Demo action shows stable progress and blocks duplicate reset/create requests; never display a fake percent. |
| Error | Demo failure remains on the landing page, says whether no space was created/reset, and offers Retry plus Create account. A failed decorative composition does not block entry actions. |
| Offline | Already rendered/static explanation remains readable. Create account, Sign in, and Try demo identify that connection is required and do not initiate writes. |
| Permission | Public content requires no permission. Signed-in status changes entry CTAs without exposing any domain data on the public page. |
| First run | Orientation is dismissible, keyboard reachable, and never modal. Dismissal does not change product data. |

## Responsive behavior

- At large desktop, hero text and product composition share the first viewport without crowding; the text column remains the reading anchor.
- At 1024 px, reduce composition complexity before shrinking readable text.
- At 390 px, stack text, CTAs, and one simplified product composition; no horizontal overflow or tiny desktop screenshot.
- The public header collapses to labeled actions or an accessible menu without hiding Create account/Sign in.

## Keyboard, touch, and accessibility

- Skip link and semantic public landmarks are present.
- CTA labels remain explicit out of context and have 44 px touch targets on mobile.
- Decorative product fragments are hidden from assistive technology; meaningful demo content has concise alternative text or semantic HTML, not a screenshot-sized prose description.
- Demo progress and first-run dismissal are announced politely; focus moves to the Inbox heading after entry.
- Reduced motion removes hero/composition entrance motion.

## Acceptance evidence

Capture 1440/1024/390 px, light/dark/system, signed-out/signed-in CTAs, demo loading/success/failure, offline entry, first-run orientation/dismissal, reduced motion, keyboard navigation, and a no-JavaScript/static-content sanity check where supported by the Next rendering path.
