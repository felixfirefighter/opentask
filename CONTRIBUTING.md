# Contributing

Omplish is built as a modular monolith under a fixed Hackathon Release contract. Before editing code, read `AGENTS.md`, `docs/MANIFEST.md`, `docs/SCOPE.md`, and the owning module or screen contract.

## Working agreement

- Implement only the active work package and approved scope.
- Keep `app/*` as composition; feature behavior and persistence belong to the owning module.
- Import another module through its public `index.ts` only.
- Reuse canonical schema vocabulary before adding a column or table.
- Preserve the repository-owned design tokens and responsive contracts.
- Never commit secrets, personal demo data, copied competitor assets, or generated dependency directories.

Follow [docs/SETUP.md](docs/SETUP.md), add focused tests with each behavior change, and run `pnpm verify` before requesting review. Dependency changes require the capability, cost, license, maintenance, and owning-adapter review in `docs/STACK.md`.

By contributing, you agree that your contribution is licensed under AGPL-3.0-or-later.
