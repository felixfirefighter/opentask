# Product contract

## Working definition

OpenTask is a calm, open-source productivity workspace that unifies capture, task organization, and active calendar planning. An optional AI assistant turns unstructured intent into a reviewable plan; it is not required to use the product.

The working name is not a release name. Choose and check an original final name before public submission.

## Problem

Capable personal productivity products often split useful planning features across paid tiers and proprietary services. Users who want task organization, active calendars, and data portability either subscribe forever or assemble several disconnected tools. Self-hosters also lack an approachable, integrated option.

## Audience

Primary: an individual who manages work and personal commitments, plans visually, and wants a polished app without feature paywalls.

Secondary: privacy-conscious and open-source users who want to self-host and retain portable data.

Not the first target: enterprise project portfolios, regulated team workflow, field-service dispatch, or large-scale issue tracking.

## Value proposition

1. Capture quickly and organize later.
2. See tasks and time in one planning surface.
3. Keep core capabilities free and data portable.
4. Use AI only when it adds leverage, with a visible proposal and explicit approval.

## Product principles

- **Fast before clever.** Adding and completing a task must be faster than invoking AI.
- **Plan reality, not aspiration.** Scheduling respects existing commitments, work windows, duration, and buffer.
- **Progressive disclosure.** Everyday actions remain visible; advanced settings live in the inspector.
- **User authority.** AI proposes; the user edits and applies. No silent or autonomous writes.
- **Open core means complete core.** There is no artificial list, task, or calendar limit in the application.
- **Portable by default.** Users can export their data in a documented versioned format.
- **Privacy by minimization.** No advertising analytics; no content in logs; AI receives only selected context.
- **Original expression.** Competitor behavior can inform requirements, but assets, copy, trademarks, and exact trade dress do not enter the product.

## Hackathon narrative

The product is more than a clone: it is an agent-optional, self-hostable personal planning system. Its showcase workflow is a “reality-aware plan”:

1. The user pastes a brain dump and selects existing unscheduled tasks.
2. GPT-5.6 extracts structured task intent, constraints, estimates, and uncertainties.
3. Deterministic domain code places eligible work into free time without violating hard constraints.
4. The UI presents an editable diff with warnings.
5. The user applies selected changes in one validated transaction.

This combines model strengths with deterministic scheduling and a human approval gate.

## Success measures for the release

- A new user can add a task in under 15 seconds without documentation.
- A user can move from brain dump to an approved day plan in under 2 minutes.
- The four demo paths in `docs/QUALITY.md` work at desktop and mobile widths.
- The app remains fully useful when the OpenAI integration is disabled.
- A fresh self-host setup succeeds from the README without hidden services.

## Business model constraint

No premium feature gating is part of this product plan. Hosting providers and OpenAI usage can have real operating costs; self-hosters supply those resources or keys. The project must communicate that distinction honestly rather than promising cost-free infrastructure.
