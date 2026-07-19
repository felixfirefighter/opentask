# Self-hosted font assets

These files are intentionally vendored so local/self-host builds never depend on a font CDN.
`app/layout.tsx` loads only the roman variable files through `next/font/local` and exposes generated
families as semantic CSS variables.

| Local file | Immutable upstream source | SHA-256 |
|---|---|---|
| `InterVariable.woff2` | Inter 4.1 official release archive, `web/InterVariable.woff2`: https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip | `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3` |
| `NewsreaderVariable.woff2` | Newsreader commit `cfcb4f7af0e52c25e8df2a2431814c8e5fe2e155`, `fonts/variable/woff2/Newsreader[opsz,wght].woff2` | `1faa3380ac0e87e057b180e03fd94bd708a612afb67d2590677be4508909fae9` |

Upstream SIL Open Font License 1.1 notices are retained in `licenses/`. Italic assets are omitted
because the active design contract does not use them. Do not replace, subset, or add a font without
updating `docs/STACK.md`, this inventory, the checksum, and the font-load/design evidence.
