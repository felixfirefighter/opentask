# Security policy

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability or include real credentials or personal data in a report. Use the repository host's private vulnerability-reporting channel when it is enabled. If that channel is unavailable, contact the repository owner privately and ask for a secure reporting route before sending exploit details.

Include the affected revision, impact, minimal reproduction, and any known mitigation. Use synthetic data only. The maintainers will acknowledge the report, assess severity, coordinate a fix, and disclose it after affected users have a reasonable update path.

## Supported version

Before the first public release, only the current `main` revision is supported. Security fixes are not promised for older development snapshots.

## Operational notes

- Keep `.env.local` and provider credentials outside Git and client bundles.
- Replace the local Compose password for any network-accessible deployment.
- Set `BETTER_AUTH_URL` to the exact browser-facing origin. The only multi-origin exception is local
  loopback: configuring `localhost` or `127.0.0.1` trusts the other spelling with the same scheme and
  port. OpenTask never expands a non-loopback origin and does not support wildcard trust. OpenTask
  uses the proxy-supplied `X-Real-IP` value only for abuse-control buckets. A network-accessible
  deployment must put the app behind one trusted ingress that overwrites this header and must
  prevent clients from reaching the application origin directly; do not forward an untrusted
  client-provided value. Railway's public proxy supplies this header. OpenTask intentionally ignores
  `X-Forwarded-For` for this policy, and requests without a resolved address share a conservative
  fallback bucket.
- Run `pnpm check:secrets`, `pnpm check:audit`, and `pnpm check:licenses` before release.
- Treat health output, logs, exports, screenshots, and AI fixtures as possible disclosure surfaces.
