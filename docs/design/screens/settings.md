# Settings

## Purpose and route

`/settings` edits release preferences, configures the optional OpenAI provider for the current
profile, manages the user-controlled PWA/push surface after P5/P6, exports user-owned data, and
offers a destructive full-app reset. It does not add billing, integration, import, analytics, or a
notification center.

The global profile menu shows the locally cached username and Settings. There is no sign-out or
email/password management surface. The OpenAI key is a server-side encrypted provider credential,
never browser storage or a returned API value.

Focus and break durations are per-run inputs on `/focus`; this release stores no duration preference
and adds no Focus Settings card.

## Layout

Use one bounded column with a page `h1` and these cards:

1. **Date and time:** week start and 12/24-hour display. The timezone is detected from the device
   automatically and is not user-selectable here.
2. **Appearance:** light/dark/system theme and reduced motion.
3. **Optional AI:** personal OpenAI API key entry/removal, configured source, and a link to manual planning.
4. **App and reminders:** install/update state where supported, push capability/permission,
   subscription enable/revoke, and provider/worker degraded explanation without secret values.
5. **Your data:** versioned JSON export.
6. **Reset app:** destructive full-profile/workspace deletion with confirmation.

Each editable card has its own explicit Save action and local save/error feedback. Theme may preview immediately but rolls back if the server save fails. Never return or display the stored key or server environment value.

## Preference behavior

- The device's canonical IANA timezone is detected automatically and used for Today/calendar
  interpretation. Saved timed instants are not rewritten when the device timezone changes.
- Week start choices are explicit day labels.
- Hour cycle uses “1:30 PM” and “13:30” examples.
- Theme controls show labels as well as visual previews.
- Reduced motion control explains that saved preference and operating-system preference are both respected, with the more restrictive value winning.

## Provider behavior

Distinguish AI planner available from disabled because neither a personal nor server key is configured. A personal key overrides the server key for that profile; removing it falls back to the server key. Manual task/calendar workflows remain linked and available.

Distinguish unsupported browser, permission not requested, denied, subscribed, provider unconfigured,
and known-disabled worker states. Request notification permission only after the user activates an
explicit control. If configuration expects a worker, say that runtime liveness is not verified; do
not invent a heartbeat or report a configured process as live. P5/P6 controls do not render before
their package gates and never expose VAPID or encryption keys.

## Export behavior

“Export my data” requests the versioned JSON export and downloads it only after authorization succeeds. Show progress, resulting filename/schema version when available, and a retryable failure. Do not preview private export content in logs, analytics, or a public URL. Import is not rendered.

## State contract

| State | Required presentation |
|---|---|
| Default | Current server preferences, OpenAI credential source without the secret, explicit per-card Save, AI/PWA/push capability status as applicable, Export my data, and Reset app. |
| Empty | Preferences always have defaults. If provider status cannot be determined, show “Status unavailable” rather than a blank card. No export-history empty state exists. |
| Loading | Preserve card geometry; preferences and provider status may resolve independently. Save/export actions show stable progress and block duplicates only within their card. |
| Error | Preserve edited values, identify the failed card/action, and offer Retry. Theme preview rolls back after failed save. Export error confirms that no file was generated when true. Reset failure keeps the profile intact. |
| Offline | Loaded preferences/status remain readable but labeled stale. Disable Save and export under the global offline explanation; local theme preview may be viewed but not called saved. |
| Permission | Missing internal session routes to direct app launch with safe resume. Export, provider, and reset endpoints recheck authorization; errors reveal no other user's settings/subscriptions/data. |
| Provider unavailable | Show manual alternatives and exact capability impact. Missing AI, VAPID, or worker does not look like a core app failure. |

## Keyboard, touch, and accessibility

- Cards follow document order; Save actions are named by card where ambiguity exists.
- The date/time card explains that timezone follows the device automatically.
- Theme previews and provider indicators include text, not color/icon alone.
- Save and export results use polite live status; blocking auth loss uses an alert and safe redirect.
- All controls meet shared target, contrast, zoom, reduced-motion, and error-summary rules.

## Acceptance evidence

Verify every preference, server save/failure rollback, timezone preview, AI available/unavailable,
  install/update state, every push capability/permission/subscription/configuration state including
  the explicit “runtime liveness not verified” state, authorized JSON
export success/failure, offline, unauthenticated redirect, keyboard/screen-reader behavior, and
1440/1024/390 px layouts.
