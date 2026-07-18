# Implementation goal contract

This file is the copy-ready contract for a future Codex goal. It defines completion, not a progress log. The active product scope remains owned by `docs/SCOPE.md`.

## Goal objective

> Implement the OpenTask Hackathon Release exactly as specified by the repository's current-truth documents. Complete every active capability and acceptance criterion in `docs/SCOPE.md`, follow the module, data, stack, and design contracts, execute the ordered work packages in `docs/IMPLEMENTATION_PLAN.md`, and pass every required gate in `docs/QUALITY.md`. Do not implement post-hackathon or explicitly excluded features unless the user first completes the scope-change protocol. Preserve a useful non-AI core when OpenAI is unconfigured. Finish with a reproducible self-host setup, a healthy hosted demo, and submission-ready evidence.

## Required reading order

Before the first implementation change, read:

1. `AGENTS.md`
2. `docs/MANIFEST.md`
3. `docs/PRODUCT.md`
4. `docs/SCOPE.md`
5. this file
6. `docs/STACK.md`
7. `docs/ARCHITECTURE.md`
8. `docs/DATA_MODEL.md`
9. `docs/IMPLEMENTATION_PLAN.md`
10. `docs/QUALITY.md`
11. `DESIGN.md`
12. the owning module and screen contracts for the current work package

## Non-negotiable constraints

- Implement the Hackathon Release only. Research parity and roadmap stages are context, not permission.
- Use the approved stack. A dependency or architecture deviation must pass its documented gate before installation.
- Keep one repository, one TypeScript application, one worker entry point, and one PostgreSQL database.
- Keep route/page files thin; business rules belong to owning modules.
- Treat every authenticated identifier as untrusted. Ownership is checked by server-side application use cases.
- Reuse the canonical data concepts. A schema change must pass the placement test in `docs/DATA_MODEL.md` before migration generation.
- Never add generic task metadata, an EAV model, a feature-specific copy of task status/date, or speculative columns.
- AI produces a typed proposal only. Deterministic code validates and schedules it; only an explicit review-and-apply request may write.
- The app remains usable without `OPENAI_API_KEY`, push permission, or the worker process.
- Do not copy TickTick/Airbnb assets, product copy, icons, fonts, name, or trade dress. Use the original design contract.
- Do not claim offline writes, full TickTick parity, zero-cost hosting, or a feature that has not passed its acceptance test.
- Do not record implementation history in Markdown. Update current truth when a contract changes; use Git and the goal for history/status.

## Execution rules

- Work through `docs/IMPLEMENTATION_PLAN.md` in dependency order.
- A work package is complete only when its code, migrations, tests, docs, and package gate are complete.
- Run the fast verification loop after each coherent change and the package gate before moving on.
- Stop adding features at the feature-freeze checkpoint. The remaining time is reserved for defect repair, deployment, demo, and audit.
- When a committed item is at risk, report the evidence and options. Do not silently cut it or substitute a different feature.
- A failing gate is unfinished work, even when the happy path looks correct.

## Completion definition

The goal is complete only when all of the following are true:

1. Every Hackathon Release acceptance criterion in `docs/SCOPE.md` is evidenced by an automated test, a named manual audit, or both.
2. `pnpm verify` and the clean-database, production-build, and golden-path gates in `docs/QUALITY.md` pass.
3. Cross-user authorization denial tests cover every user-owned aggregate.
4. The supported recurrence, reminder, habit, focus, export, and planner failure cases are verified, not only their happy paths.
5. Desktop and mobile visual/keyboard/accessibility audits pass at the required viewports.
6. A fresh clone can follow the README to run web, worker, PostgreSQL, migrations, and seed data without undocumented services.
7. The hosted demo health check passes and the seeded demo path does not expose shared secrets or personal data.
8. The repository contains the intended license, attribution/license inventory, security guidance, and no committed secrets.
9. The under-three-minute demo and submission package meet `docs/HACKATHON.md`.
10. A final audit reports the exact commands run, their results, remaining known limitations, and any unverified manual item.

Near-complete, demo-only, or “works on my machine” is not complete.

## Outside this goal

- All items in `docs/SCOPE.md` under “Explicitly out of the active goal.”
- All Stage A–D roadmap items.
- Product naming/trademark registration, production legal advice, paid infrastructure procurement, app-store submission, and ongoing operations.

## Scope-change lock

Only the user can authorize a scope addition, cut, or substitution. Authorization is not complete until the five-part scope-change protocol in `docs/SCOPE.md` is applied. A future agent may recommend a change but may not enact it implicitly.

## Goal close-out format

The final implementation handoff must contain:

- outcome and demo URL;
- verification commands and pass/fail summary;
- acceptance evidence location;
- migrations and operational notes;
- known limitations that remain inside the written contract;
- explicit confirmation that no out-of-scope feature was silently added;
- next recommended roadmap stage, clearly outside the completed goal.
