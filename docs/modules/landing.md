# Landing module contract

`modules/landing` owns the public landing presentation and its original product preview. It is a presentation-only capability with no domain, application, infrastructure, or persistence layer.

## Responsibilities

- Render the public product story, honest active-core copy, and responsive preview composition.
- Present signed-out and signed-in entry states from route-provided inputs.
- Accept the identity-owned demo action through composition rather than owning demo creation or reset.
- Implement the states and interaction rules in `docs/design/screens/landing.md`.

## Public surface

- `modules/landing/presentation/index.ts` exports `LandingScreen` for the `/` route composition.
- The route resolves optional identity state and injects `DemoEntryAction`; the landing module does not read sessions or call domain APIs.

## Invariants and dependencies

- Public rendering never reads or exposes user task data, provider configuration, or secrets.
- Product copy and preview assets remain original and describe only active-release behavior.
- Dependencies are limited to Next presentation utilities, Lucide icons, and `shared/presentation` primitives.

## Non-responsibilities

- Authentication, session handling, demo identity creation, abuse controls, or account bootstrap.
- Demo task/proposal seeding, task workflows, planning projections, or provider calls.
- Authenticated workspace navigation or first-run task orientation.

## Required evidence

- Landing contract tests cover signed-out/signed-in entry, demo loading/error/offline behavior, keyboard access, accessibility, light/dark/reduced-motion presentation, and responsive widths routed by the design contract.
