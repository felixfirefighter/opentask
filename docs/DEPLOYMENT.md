# Optional Railway deployment

This is an optional hosted path. Reproducible local/Compose operation remains the Local-first Full
Release completion path; use [SETUP.md](SETUP.md) for that path and
[SECURITY.md](SECURITY.md) for the operational trust boundaries.

## Current checked-in topology

The current Railway path supports:

1. a public web service connected to this repository root; and
2. a Railway PostgreSQL service named `Postgres`.

The root `railway.json` is web-specific: it runs committed Drizzle migrations as a pre-deploy
command, probes `/api/health/ready`, and bounds crash retries. Railway config-as-code overrides
dashboard service values, so a non-HTTP worker connected to that same root config would inherit the
web health check and fail deployment. Do not present the current Railway path as reminder-capable.
The supported full-release path for the active two-queue worker is local Compose, which runs web and
worker from the same `opentask:local` production image.

The checked-in Compose mapping intentionally omits VAPID and subscription-encryption values, so it
exercises the active worker in provider-degraded mode. Shell or `.env.local` values are not forwarded
to those containers implicitly. For configured local browser push, follow
[SETUP.md's host process path](SETUP.md#host-development) with the complete push values below in
`.env.local`, or create an untracked Compose override that explicitly maps the same values to both
processes.

## Conditional hosted worker

A reminder-capable hosted candidate additionally needs one private worker service. Before creating
it, provide either:

- a reviewed worker-specific Railway config that uses the same checked-in production `Dockerfile`
  runner but has no HTTP health check; or
- one externally published immutable runner image, pinned by digest and used by both hosted web and
  worker with service-specific commands.

Neither hosted-worker option is checked in today. Do not create a worker-specific Dockerfile or
dependency set. Once one option exists, configure the worker Start Command as:

```sh
pnpm worker
```

Railway documents config precedence, Dockerfile detection, and service-level command overrides in
its [Config as Code](https://docs.railway.com/config-as-code),
[Dockerfile](https://docs.railway.com/builds/dockerfiles) and
[Build and Start Commands](https://docs.railway.com/builds/build-and-start-commands) references.
The worker has no public domain or HTTP health endpoint; it communicates with PostgreSQL over the
project's private network.

Whichever option is used, retain the migration pre-deploy command and `/api/health/ready` probe on
web, and omit the HTTP probe from worker. Deploy the web migration step before starting the new
worker revision. The worker validates the committed notification schema before consuming work.

## Web variables

Configure these on the web service:

```dotenv
DATABASE_URL=${{Postgres.DATABASE_URL}}
BETTER_AUTH_SECRET=<output of: openssl rand -base64 32>
BETTER_AUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
LOG_LEVEL=info
OPENAI_API_KEY=<optional server-only key>
REMINDER_WORKER_MODE=disabled
```

Use Railway's `DATABASE_URL` reference rather than the public database URL so application traffic
stays on private networking. The reference syntax and Next.js/PostgreSQL workflow are documented by
Railway's [variables reference](https://docs.railway.com/variables/reference) and
[Next.js guide](https://docs.railway.com/guides/nextjs).

Generate a public domain before the final deploy. If a custom domain replaces it, update
`BETTER_AUTH_URL` to the exact HTTPS origin and redeploy. Railway's public edge supplies
`X-Real-IP` as the remote-IP header; this is the only client-address header OpenTask trusts for
authentication and demo abuse-control buckets. Do not expose another ingress or a direct
application origin that lets a client supply this header. See
[Railway's public-networking specifications](https://docs.railway.com/networking/public-networking/specs-and-limits).

## Optional browser-push variables

Use this section only after satisfying a conditional hosted-worker option above. Until then, keep
the web service at `REMINDER_WORKER_MODE=disabled`. Its capability then declares the worker
known-disabled; when VAPID or encryption is also absent, Settings correctly presents the overall
provider-degraded state as unavailable.

Browser reminders need the same VAPID pair and complete encryption keyring on web and worker; only a
staged key rotation may temporarily use different active versions. The web process encrypts
subscriptions and creates jobs; the worker decrypts current subscription material and calls the
push provider.

Change the web service to `REMINDER_WORKER_MODE=enabled`. Configure the worker's base variables as:

```dotenv
DATABASE_URL=${{Postgres.DATABASE_URL}}
LOG_LEVEL=info
REMINDER_WORKER_MODE=enabled
```

The worker does not need `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, or `OPENAI_API_KEY`.

Generate one VAPID key pair locally:

```sh
pnpm exec web-push generate-vapid-keys --json
```

Copy the pair without quotes and choose an operator-controlled `mailto:` or HTTPS contact subject:

```dotenv
WEB_PUSH_VAPID_SUBJECT=mailto:operator@example.com
WEB_PUSH_VAPID_PUBLIC_KEY=<generated publicKey>
WEB_PUSH_VAPID_PRIVATE_KEY=<generated privateKey>
```

Generate a separate 32-byte AES key as canonical, unpadded base64url:

```sh
node --input-type=module -e 'import { randomBytes } from "node:crypto"; console.log(randomBytes(32).toString("base64url"))'
```

The output is exactly 43 characters. Start the versioned keyring with:

```dotenv
PUSH_SUBSCRIPTION_ACTIVE_KEY_VERSION=1
PUSH_SUBSCRIPTION_ENCRYPTION_KEYS=1:<generated 43-character key>
```

VAPID subject/public/private values are an all-or-none group. Encryption active-version/keyring
values are also all or none. A keyring entry is exactly
`<nonnegative-version>:<43-character-base64url-32-byte-key>`; comma-separated versions must be
unique, and the active version must exist in the keyring. During rotation, add a new version and make
it active without creating a web/worker mismatch:

1. deploy the worker with the expanded old-plus-new keyring while the old version remains active;
2. deploy web with that same expanded keyring and the new version active; and
3. update the worker's active version after it can already decrypt new rows.

Retain every old key until a reviewed retirement procedure proves that no stored subscription uses
its version. Removing a still-referenced key makes that subscription undecryptable.

Complete absence of either optional group is supported: task, habit, Focus, export, PWA shell, and
manual planning remain usable, while push enrollment reports an honest unavailable state. A
partially present or malformed group is an operator error and fails notification configuration
validation. The public VAPID key is intentionally returned to the browser; every other value above
is server-only and must never use a `NEXT_PUBLIC_` prefix.

## Worker readiness and shutdown

Before enabling enrollment, run a one-off check with the same worker variables and database:

```sh
pnpm worker -- --check
```

It validates notification configuration, the migrated schema, and exactly
`notification_delivery_v1` plus `notification_maintenance_v1` without registering consumers or
sending push. Successful output includes `WORKER_CHECK_OK` with `declaredJobCount: 2`.

Supervise the persistent worker and require `WORKER_READY` with `registeredJobCount: 2` after each
deploy. `REMINDER_WORKER_MODE=enabled` means configured, not live; the web UI deliberately has no
heartbeat claim. Unexpected process death is detected through Railway process supervision and
operator logs.

The worker handles `SIGINT` and `SIGTERM` idempotently, allows pg-boss up to 15 seconds to stop, and
logs `WORKER_STOPPED`. The root web config grants a 15-second Railway drain; any conditional worker
config must explicitly preserve at least that same window. Local Compose grants 20 seconds before
forced termination. Railway documents the hosted setting in
[Deployment Teardown](https://docs.railway.com/deployments/deployment-teardown).

## Cost controls

In the Railway workspace Usage page, set a compute alert and a compute hard limit appropriate for
the project. A hard limit takes workloads offline when reached, so leave enough contingency for
testing. Keep one web replica and, if the conditional hosted worker exists, one worker replica. Use
private database networking, set conservative per-replica CPU/RAM limits only after observing a
successful boot, and do not enable serverless sleep on a reminder worker: it must remain available
to consume database-backed jobs without an incoming web request. Railway's current controls are
described in
[Cost Control](https://docs.railway.com/pricing/cost-control).

## Candidate smoke

After any Railway deployment, test the web service from a clean browser environment:

```sh
curl --fail --silent --show-error https://<candidate-host>/api/health/live
curl --fail --silent --show-error https://<candidate-host>/api/health/ready
```

For the current web-only topology, verify that Settings reports the declared provider-degraded,
unavailable reminder state and that manual task, planning, habit, Focus, export, and PWA workflows
remain usable. Complete
[FRIEND_TEST.md](FRIEND_TEST.md), including demo reset, export/sign-out privacy, desktop 1440 px, and
mobile 390 px.

Only after a conditional hosted worker exists, also:

1. Confirm the one-off worker check and the persistent `WORKER_READY` event both report two jobs.
2. Enroll from an explicit browser action, set one eligible reminder, observe the generic push, and
   click through to the owned task.
3. Complete or reschedule a reminder task and verify stale work no-ops; revoke the browser
   subscription.
4. Verify provider-degraded startup in a separate environment with both optional key groups absent.
5. Send `SIGTERM` to a disposable worker deployment and confirm `WORKER_STOPPED` and a clean exit
   inside the configured drain window.

Do not designate a reminder-capable hosted candidate until migrations, health, worker readiness,
demo isolation, the release golden paths, and the named release commit all refer to the same
deployed revision. Hosted push remains optional; local Compose is the full-release completion path.
