# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or include real credentials or personal data in a report. Use the repository host's private vulnerability-reporting channel when it is enabled. If that channel is unavailable, contact the repository owner privately and ask for a secure reporting route before sending exploit details.

Include the affected revision, impact, minimal reproduction, and any known mitigation. Use synthetic data only. The maintainers will acknowledge the report, assess severity, coordinate a fix, and disclose it after affected users have a reasonable update path.

## Supported version

Before the first public release, only the current `main` revision is supported. Security fixes are not promised for old hackathon snapshots.

## Operational notes

- Keep `.env.local` and provider credentials outside Git and client bundles.
- Replace the local Compose password for any network-accessible deployment.
- Run `pnpm check:secrets`, `pnpm check:audit`, and `pnpm check:licenses` before release.
- Treat health output, logs, exports, screenshots, and AI fixtures as possible disclosure surfaces.
