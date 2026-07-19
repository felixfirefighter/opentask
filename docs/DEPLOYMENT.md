# Railway deployment

This is the production deployment path for the Deadline-safe Core. Local and Compose setup remains in [SETUP.md](SETUP.md).

## Services

Create one Railway project with:

1. a web service connected to this repository root; and
2. a Railway PostgreSQL service named `Postgres`.

The checked-in `railway.json` selects the production `Dockerfile`, runs committed Drizzle migrations as a pre-deploy command, probes `/api/health/ready`, and bounds crash retries. Railway supports these settings through [Config as Code](https://docs.railway.com/config-as-code/reference), and its pre-deploy container has private-network variables available before the new deployment starts.

Do not deploy the zero-job worker for the hackathon candidate. It is a local/CI architecture smoke, not a product dependency.

## Web variables

Configure these on the web service:

```dotenv
DATABASE_URL=${{Postgres.DATABASE_URL}}
BETTER_AUTH_SECRET=<output of: openssl rand -base64 32>
BETTER_AUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
LOG_LEVEL=info
OPENAI_API_KEY=<optional server-only key>
```

Use Railway's `DATABASE_URL` reference rather than the public database URL so web-to-database traffic stays on private networking. The reference syntax and Next.js/PostgreSQL workflow are documented by Railway's [variables reference](https://docs.railway.com/variables/reference) and [Next.js guide](https://docs.railway.com/guides/nextjs).

Generate a public domain for the web service before the final deploy. If a custom domain replaces it, update `BETTER_AUTH_URL` to the exact HTTPS origin and redeploy. Do not prefix any secret with `NEXT_PUBLIC_`.

Railway's edge overwrites `X-Real-IP`, which is the only client-address header OpenTask trusts for authentication and demo abuse-control buckets. Do not expose a second untrusted ingress directly to the container. Railway documents the header in its [public-networking specifications](https://docs.railway.com/networking/public-networking/specs-and-limits).

## Cost controls

In the Railway workspace Usage page, set both a compute alert and a compute hard limit appropriate for the hackathon. A hard limit takes workloads offline when reached, so leave enough contingency for friend testing and judging. Keep one web replica, use private database networking, set conservative per-replica CPU/RAM limits only after observing a successful boot, and enable serverless sleep only if its wake-up delay is acceptable for the demo. Railway's current controls are described in [Cost Control](https://docs.railway.com/pricing/cost-control).

## Candidate smoke

After deployment, test in a clean browser:

```sh
curl --fail --silent --show-error https://<candidate-host>/api/health/live
curl --fail --silent --show-error https://<candidate-host>/api/health/ready
```

Then complete [FRIEND_TEST.md](FRIEND_TEST.md) twice: once with `OPENAI_API_KEY` configured and once after confirming the no-key explanatory state in a separate local environment. Verify the landing and health endpoints signed out, demo reset twice, export/sign-out privacy, desktop 1440 px, and mobile 390 px.

Do not designate a friend candidate until migrations, health, demo isolation, G1–G4, and the release commit all refer to the same deployment.
