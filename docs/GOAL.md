# Implementation goal contract

This is the copy-ready completion contract for the active Local-first Full Release. It is current
truth, not a progress log. Feature authority remains in `docs/SCOPE.md`.

## Goal objective

> Continue from the implemented, user-approved Editorial Focus baseline and complete the OpenTask Local-first Full Release exactly as specified by the repository's current-truth contracts. Stabilize the existing manual/AI planning core, then implement schedule-based task recurrence, habits, authoritative Focus sessions, an installable read-only-offline PWA shell, one optional browser-push task reminder with an active worker, and the expanded portable local release. Follow the remaining P1-P7 dependency gates in `docs/IMPLEMENTATION_PLAN.md`, keep every provider optional, preserve canonical task/time data and review-before-apply AI, and pass `docs/QUALITY.md`. Do not implement Stage A–D or any excluded feature without another user-authorized scope change.

## Required reading order

The repository-level `AGENTS.md` contract already applies. Before the first change in each package,
read:

1. `README.md`
2. `docs/MANIFEST.md`
3. `docs/PRODUCT.md`
4. `docs/SCOPE.md`
5. this file
6. `docs/STACK.md`
7. `docs/ARCHITECTURE.md`
8. `docs/DATA_MODEL.md` for schema work
9. `docs/IMPLEMENTATION_PLAN.md`
10. `docs/QUALITY.md`
11. `DESIGN.md`
12. the owning module and routed screen contracts

## Non-negotiable constraints

- Implement only the Local-first Full Release. Later Stage A–D items are context, not permission.
- “Local-first” means local/self-host completion without a hosted prerequisite. It does not authorize
  offline mutations, a sync protocol, or a native application.
- Editorial Focus is the approved visual baseline. Preserve it for existing and later feature UI;
  broad restyling or a shared-foundation change requires explicit user approval and new evidence.
- Preserve the current green baseline while new packages are incomplete. No partial package is
  merged merely because a deadline is close.
- Keep one TypeScript repository, one Next.js application, one PostgreSQL database, and one pg-boss
  worker entry point. Do not add a service or framework when the approved stack covers the need.
- Route/page files stay thin; application/domain rules and ownership checks remain in the owning
  feature module. Every authenticated identifier is untrusted.
- Reuse canonical data concepts. Schema changes pass the `docs/DATA_MODEL.md` placement and migration
  gates; projections never store duplicate task status, schedule, streak, Focus total, or due state.
- OpenAI and Web Push are optional server providers. Manual task, planning, habit, Focus, export, and
  local startup paths remain usable without either.
- AI produces a typed proposal only; deterministic code validates/schedules it and only explicit
  review/apply can write. Push jobs reload current state before sending and contain opaque IDs only.
- Offline support is honest: cache public/static shell assets only, keep already rendered data
  read-only, and never queue or claim a domain mutation while disconnected.
- Do not copy TickTick, ElevenLabs, GetDesign, Airbnb, or another product's names, assets, copy,
  proprietary fonts, icons, exact layouts, palette, or trade dress.
- Plans and contracts hold current truth only. Git holds implementation history.

## Execution rules

- Follow the dependency graph and package ownership in `docs/IMPLEMENTATION_PLAN.md`; route-based
  parallelism cannot split a shared domain or schema invariant across agents.
- One integration owner serializes shared tokens, dependency/lockfile changes, schema aggregation,
  SQL migrations, worker composition, root routes, and full browser/database/Docker gates.
- A work package is complete only when code, migration, tests, docs, evidence, and its audit gate are
  complete. A failing or skipped required check is unfinished work.
- At every visual approval gate, stop the dependent rollout. Independent read-only audits or
  explicitly listed non-visual stabilization may continue without treating silence as approval.
- Report evidence and options when a committed item is at risk. Do not silently cut acceptance,
  loosen a test, or substitute a later feature.
- Keep the hackathon submission path safe: if a new package is not green and approved by its cutoff,
  use the current green baseline rather than rush an unverified merge.

## Completion definition

The goal is complete only when all are true:

1. Every active capability and acceptance criterion in `docs/SCOPE.md` has automated evidence, a
   named manual audit, or both.
2. The approved Editorial Focus baseline is preserved, and every later visual change has the
   responsive evidence and explicit approval required by its package gate.
3. `pnpm verify` plus clean/upgrade migration, local production Compose, service-worker, worker, and
   provider-degraded gates in `docs/QUALITY.md` pass.
4. Cross-user authorization denial covers every task/recurrence/occurrence, habit/log, Focus,
   reminder/subscription, proposal, preference, and export aggregate.
5. Recurrence, habit local-day/streak, Focus timing, reminder delivery, planner apply, and export
   failure/concurrency cases are verified rather than demonstrated only on happy paths.
6. Desktop/mobile visual, keyboard, screen-reader, zoom, dark/system theme, coarse-pointer, reduced
   motion, installability, and honest offline audits pass.
7. A fresh clone can run PostgreSQL, migrations, web, active worker, isolated demo, provider-absent
   manual workflows, and versioned export through documented local/Compose commands.
8. The repository contains intended code/font/dependency licenses and notices, security guidance,
   no committed secrets, content-redacted logs, and no unapproved/copy-risk surface.
9. The stable hackathon demo/submission material claims only the last verified candidate; hosted
   deployment is optional and not a completion requirement for this local-first goal.
10. Final sign-off reports exact commands/results, migration and operational notes, acceptance
    evidence, known limitations inside the contract, and confirmation that no excluded feature was
    silently added.

Near-complete, screenshot-only, provider-only, or “works on my machine” is not complete.

## Outside this goal

- Every item under `docs/SCOPE.md` “Explicitly outside the active release” and “Later roadmap”.
- Hosted production procurement/operations, app-store submission, trademark clearance, and legal
  advice.
- Ongoing background operations after the verified local release handoff.

## Scope-change lock

Only the user can authorize an addition, cut, or substitution, and authorization is incomplete until
the five-part protocol in `docs/SCOPE.md` is applied. A future agent may recommend a change but may
not enact it implicitly.

## Goal close-out format

The final handoff contains:

- outcome and local run/demo entry;
- release commit and exact verification summary;
- acceptance evidence locations;
- migrations, worker/PWA/provider configuration, and operational notes;
- known limitations that remain inside the written contract;
- explicit confirmation that no later-scope feature was added;
- next recommended roadmap stage, clearly outside the completed goal.
