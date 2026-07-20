# Self-hosted font assets

These files are intentionally vendored so local/self-host builds never depend on a font CDN.
`app/layout.tsx` loads only the roman variable files through `next/font/local` and exposes generated
families as semantic CSS variables.

| Local file | Immutable upstream source | SHA-256 |
|---|---|---|
| `InterVariable.woff2` | Inter 4.1 official release archive, `web/InterVariable.woff2`: https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip | `693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3` |
| `EBGaramondVariable.woff2` | EB Garamond commit `106a4a6d377987459ae5e68673a4570f13b957fb`, `fonts/webfonts/EBGaramond[wght].woff2` | `7667eac47b012e7f92c14e2ec8b41d3b850e1e8d49e0db45f7417517866fb78a` |

Upstream SIL Open Font License 1.1 notices are retained in `licenses/`. Italic assets are omitted
because the active design contract does not use them. Do not replace, subset, or add a font without
updating `docs/STACK.md`, this inventory, the checksum, and the font-load/design evidence.
