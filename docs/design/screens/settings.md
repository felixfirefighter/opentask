# Settings

## Purpose and route

`/settings` edits release preferences, explains optional AI and browser capability, manages the
user-controlled PWA/push surface, and exports user-owned data. It does not add account
management, billing, integration, import, analytics, a notification center, or browser-side secret
configuration.

Sign out remains in the global account menu. Email/password management, account deletion, API keys, and provider credentials are not rendered because they are outside current scope.

Focus and break durations are per-run inputs on `/focus`; this release stores no duration preference
and adds no Focus Settings card.

## Layout

Use one bounded column with a page `h1` and five cards:

1. **Date and time:** IANA timezone search/select, week start, and 12/24-hour display.
2. **Appearance:** light/dark/system theme and reduced motion.
3. **Optional AI:** planner available/unavailable status and a link to manual planning.
4. **App and reminders:** install/update state, honest offline limits, push capability/permission,
   subscription enable/revoke, and provider/worker degraded explanation without secret values.
5. **Your data:** versioned JSON export.

Each editable card has its own explicit Save action and local save/error feedback. Theme may preview immediately but rolls back if the server save fails. AI status is read-only. Do not expose server environment values or operational secrets.

## Preference behavior

- Timezone search displays canonical IANA names and a current local-time preview. Changing timezone names the effect on Today/calendar interpretation before save; it does not silently rewrite stored instants.
- Week start choices are explicit day labels.
- Hour cycle uses “1:30 PM” and “13:30” examples.
- Theme controls show labels as well as visual previews.
- Reduced motion control explains that saved preference and operating-system preference are both respected, with the more restrictive value winning.

## Provider behavior

Distinguish AI planner available from disabled because the server has no configured key/provider. AI is status-only here; manual task/calendar workflows remain linked and available.

Distinguish unsupported browser, permission not requested, denied, local subscription absent/present,
account enrollment unverified/enrolled/reset-required, provider unconfigured, and known-disabled
worker states. Request notification permission only after the user activates an explicit control.
If configuration expects a worker, say that runtime liveness is not verified; do not invent a
heartbeat or report a configured process as live. Enrollment/revocation manages only the current
browser and is separate from per-task reminder definitions. The browser supplies its
endpoint/keys inbound over an authorized exact-origin write, but the UI never renders stored
subscription material. The server's public VAPID key may be used internally by
`PushManager.subscribe()` and is not displayed; private VAPID and subscription-encryption keys never
reach the client. If registration returns the generic `subscription_reset_required` state, explain
that this browser subscription is already associated elsewhere without naming an account. Only an
explicit **Reset this browser subscription** control may call `unsubscribe()`, obtain a fresh
subscription, and retry; the server never revokes another user's row.

A local `PushManager` subscription is not proof that the current authenticated account is enrolled.
After a reload, demo reset, or account transition, label that local state **Verification needed**
until an explicit **Verify this browser** action successfully registers it for the current account.
The user may remove the local subscription without verifying it. Task details use the same truthful
unverified state and link to Settings; they never claim delivery enrollment from browser state alone.
Waiting for the service worker to become ready is bounded to five seconds. A timeout leaves no
indefinite **Checking** state and becomes a retryable **Browser status unavailable** result; the
timeout path does not request notification permission.

## Export behavior

“Export my data” requests the versioned JSON export and downloads it only after authorization succeeds. Show progress, resulting filename/schema version when available, and a retryable failure. Do not preview private export content in logs, analytics, or a public URL. Import is not rendered.

## State contract

| State | Required presentation |
|---|---|
| Default | Current server preferences, explicit per-card Save, AI/PWA/push capability status as applicable, and Export my data. |
| Empty | Preferences always have defaults. If provider status cannot be determined, show “Status unavailable” rather than a blank card. No export-history empty state exists. |
| Loading | Preserve card geometry; preferences and provider status may resolve independently. Save/export actions show stable progress and block duplicates only within their card. |
| Error | Preserve edited values, identify the failed card/action, and offer Retry. Theme preview rolls back after failed save. Export error confirms that no file was generated when true. |
| Offline | Loaded preferences/status remain readable but labeled stale. Disable Save and export under the global offline explanation; local theme preview may be viewed but not called saved. |
| Permission | Unauthenticated access routes to sign-in with safe return. Export and provider endpoints recheck authorization; errors reveal no other user's settings/subscriptions/data. |
| Provider unavailable | Show manual alternatives and exact capability impact. Missing AI, VAPID, or worker does not look like a core app failure. |

## Keyboard, touch, and accessibility

- Cards follow document order; Save actions are named by card where ambiguity exists.
- Timezone search uses the combobox pattern and exposes canonical name plus local-time preview.
- Theme previews and provider indicators include text, not color/icon alone.
- Save and export results use polite live status; blocking auth loss uses an alert and safe redirect.
- All controls meet shared target, contrast, zoom, reduced-motion, and error-summary rules.

## Acceptance evidence

Verify every preference, server save/failure rollback, timezone preview, AI available/unavailable,
install/update state, every push capability, permission, local-subscription, account-enrollment, and
configuration state including the five-second readiness timeout and explicit “runtime liveness not
verified” state, authorized JSON export success/failure, offline, unauthenticated redirect,
keyboard/screen-reader behavior, and 1440/1024/390 px layouts.
