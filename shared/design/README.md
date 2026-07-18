# Shared design contract

`tokens.css` is the only owner of raw color, typography, spacing, radius, control-size, and motion values shared by the product UI.

Rules:

- Shared presentation primitives consume `--type-*` and `--radius-*` variables; they do not invent local typography or corner values.
- Raw color literals are forbidden outside `tokens.css`.
- Add or change a semantic token only with the matching contract update in `docs/design/tokens.md`.
- Feature-specific layout geometry can remain local when it does not redefine a shared visual role.
- A true circle may use `border-radius: 50%`; pills use `--radius-pill`.

Run `pnpm verify:design` after every shared presentation or token change. The gate checks source literals and the browser-computed task-row contract across fine-pointer, coarse-pointer, desktop, tablet, mobile, and the 768/320 px breakpoint boundaries.
