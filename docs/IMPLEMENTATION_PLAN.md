# Authorized change plan contract

There is no active feature implementation plan. The Local-first Full Release capabilities in
`docs/SCOPE.md` are implemented, and Git contains their execution history. This file defines the
shape of a future user-authorized plan; it does not authorize roadmap work by itself.

Maintenance may preserve, secure, verify, or clarify released behavior within the current scope. A
feature addition, cut, or substitution must first complete the five-part scope-change protocol in
`docs/SCOPE.md`.

## Activating a plan

Before implementation begins, one reviewable contract change must:

1. record explicit user authorization;
2. update `docs/SCOPE.md` capabilities, exclusions, and acceptance criteria;
3. replace the stewardship state in `docs/GOAL.md` with the authorized objective and completion
   definition;
4. update affected module, architecture, data, stack, design, security, and quality contracts; and
5. replace this file with the current dependency, effort, risk, and verification plan.

Research, roadmap placement, deadline pressure, or available parallel capacity is not
authorization.

## Required plan structure

Every activated plan must state:

- **Boundary and non-goals:** exact approved behavior, exclusions, acceptance criteria, and the
  safe fallback if the change is not green.
- **Dependencies and order:** prerequisite contracts, migration sequence, integration order,
  meaningful effort estimates, and external/user-approval latency.
- **Ownership and interfaces:** owning module and layer, public entry points, cross-module ports,
  transaction boundaries, authorization rules, and externally retried idempotency behavior.
- **Data impact:** canonical concept reuse, placement-test result, tables/columns/indexes, migration
  and upgrade strategy, export/demo impact, and denial evidence. State explicitly when there is no
  schema change.
- **UI and design impact:** routed screen contracts, every required state, responsive widths,
  keyboard/touch alternatives, accessibility evidence, and any explicit visual approval gate.
- **Libraries and providers:** approved library reuse or reviewed additions, licenses, secrets,
  self-hostable path, and honest provider-absent degradation.
- **Verification and audit:** focused unit/component/database/browser checks, golden-path mapping,
  production/worker/service-worker checks where relevant, final full gate, and audit owners.
- **Delivery risks and cuts:** known failure modes, reversible checkpoints, external blockers, and
  the rule that any scope cut returns to the five-part authorization protocol.

Keep the plan modular and current. Replace changed decisions in place; do not append status diaries,
session logs, completed-step narratives, or speculative later-stage implementation details.

## Parallel execution and integration ownership

Parallel work is divided by capability and contract ownership, not merely by route. Each lane owns
an explicit non-overlapping file set and returns a coherent change with focused evidence.

One integration owner serializes canonical scope/goal/plan contracts, shared tokens and navigation,
dependency and lockfile changes, schema aggregation and SQL migrations, worker composition, export
versioning, demo reset composition, root routes, Docker/CI/release configuration, and final
cross-module audits. Consumers do not invent competing adapters while a shared contract is moving.

Database, browser, accessibility, service-worker, worker, Docker, and full verification gates run
centrally and sequentially when they share ports, databases, browsers, or generated state. Static or
isolated module lanes may run concurrently only when they cannot overwrite shared state.

## Completion and close-out

An activated plan is complete only when every mapped acceptance criterion and applicable audit in
`docs/QUALITY.md` passes, required visual approval is explicit, and the final diff contains no
unauthorized surface or dormant later-scope code. A partial implementation never replaces the last
green release merely because a deadline is close.

After completion, fold durable decisions into their canonical contracts and restore this file to
the concise no-active-plan state. Git remains the record of execution order and completed work.
