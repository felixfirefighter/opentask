# Release stewardship contract

The Local-first Full Release capability set in `docs/SCOPE.md` is implemented. This file records the
standing release objective and change guardrails; it is not an implementation diary. Git is the
implementation history, `docs/SCOPE.md` owns feature authority, and `docs/QUALITY.md` owns completion
evidence.

## Current objective

Preserve a polished, self-hostable personal planner whose released task, planning, recurrence,
habit, Focus, installable-shell, reminder, export, demo, and optional review-before-apply AI
workflows remain correct and locally reproducible.

There is no active feature-expansion goal. Maintenance may repair, secure, verify, or clarify the
current released behavior without widening it. Stage A–D and every explicitly excluded capability
remain unauthorized until the user approves the five-part scope-change protocol in
`docs/SCOPE.md`.

## Standing invariants

- Editorial Focus remains the approved visual baseline. Broad restyling or a shared-foundation
  change requires explicit user approval and fresh responsive evidence.
- The repository remains one modular TypeScript application with one PostgreSQL database, a Next.js
  web process, and the implemented two-queue reminder worker.
- Canonical task, schedule, recurrence, occurrence, habit, Focus, reminder, and proposal facts keep
  their documented owners; projections do not create duplicate truth.
- OpenAI and Web Push remain optional. Manual tasks, planning, habits, Focus, export, demo, and local
  startup continue to work when either provider is absent.
- AI creates a typed proposal only. Deterministic application code validates it, and no domain write
  occurs before explicit user review and Apply.
- Offline support remains an installable static shell and read-only connectivity behavior. It does
  not queue domain writes or claim offline-first synchronization.
- Authentication, authorization, privacy, migration, accessibility, responsive-design, dependency,
  license, and reproducibility gates remain release requirements.
- Plans and contracts contain current truth only. Do not append progress logs, session notes, or
  completed-step history.

## Authorizing future work

A future addition, cut, or substitution is not active merely because it appears in research or the
Stage A–D roadmap. Before implementation begins, apply all five steps in the scope-change protocol:
obtain explicit user authorization, update scope and acceptance, replace this stewardship state with
the authorized objective and completion definition, update affected concern contracts, and create a
current dependency/risk plan in `docs/IMPLEMENTATION_PLAN.md`.

When that authorized goal is complete, return this file and the implementation plan to concise
stewardship/current-truth form. Do not retain the completed execution sequence in documentation.

## Completion standard for any authorized change

An authorized change is complete only when its scoped behavior, migrations, tests, documentation,
responsive evidence, provider-degraded behavior, and applicable audits in `docs/QUALITY.md` pass.
Skipped or failing required checks remain unfinished work. Time pressure, screenshots, elapsed time,
or an unavailable optional provider cannot weaken acceptance criteria or justify an implicit cut.

A release handoff reports the exact commit and verification results, migration and operational
notes, evidence locations, contract-permitted limitations, and confirmation that no excluded
feature was added. Hosted deployment is optional; local reproducibility is not.
