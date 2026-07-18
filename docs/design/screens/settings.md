# Settings

## Purpose and route

`/settings` edits release preferences, explains optional provider capability, manages the browser push subscription, and exports user-owned data. It does not add account management, billing, integration, import, analytics, or browser-side secret configuration.

Sign out remains in the global account menu. Email/password management, account deletion, API keys, and provider credentials are not rendered because they are outside active scope.

## Layout

Use one bounded column with a page `h1` and four cards:

1. **Date and time:** IANA timezone search/select, week start, and 12/24-hour display.
2. **Appearance:** light/dark/system theme and reduced motion.
3. **Optional services:** browser push support/permission/subscription, reminder-worker status, and AI planner available/unavailable status.
4. **Your data:** versioned JSON export.

Each editable card has its own explicit Save action and local save/error feedback. Theme may preview immediately but rolls back if the server save fails. Provider status is read-only except push Subscribe/Unsubscribe and explicit permission request. Do not expose server environment values or operational secrets.

## Preference behavior

- Timezone search displays canonical IANA names and a current local-time preview. Changing timezone names the effect on Today/calendar interpretation before save; it does not silently rewrite stored instants.
- Week start choices are explicit day labels.
- Hour cycle uses “1:30 PM” and “13:30” examples.
- Theme controls show labels as well as visual previews.
- Reduced motion control explains that saved preference and operating-system preference are both respected, with the more restrictive value winning.

## Provider and push behavior

Distinguish these states in plain language:

- browser does not support web push;
- permission not requested;
- permission granted but not subscribed;
- subscribed and worker available;
- permission denied/blocked with browser-settings guidance;
- worker unavailable, so delivery cannot be promised;
- AI planner available or disabled because the server has no configured key/provider.

Request notification permission only after the user activates “Enable reminders”. Unsubscribing removes/invalidates this browser subscription without deleting task reminder definitions. AI is status-only here; manual task/calendar workflows remain linked and available.

## Export behavior

“Export my data” requests the versioned JSON export and downloads it only after authorization succeeds. Show progress, resulting filename/schema version when available, and a retryable failure. Do not preview private export content in logs, analytics, or a public URL. Import is not rendered.

## State contract

| State | Required presentation |
|---|---|
| Default | Current server preferences, explicit per-card Save, optional-service statuses, push action appropriate to capability, and Export my data. |
| Empty | Preferences always have defaults. If provider status cannot be determined, show “Status unavailable” rather than a blank card. No export-history empty state exists. |
| Loading | Preserve card geometry; preferences and provider status may resolve independently. Save/export/subscribe actions show stable progress and block duplicates only within their card. |
| Error | Preserve edited values, identify the failed card/action, and offer Retry. Theme preview rolls back after failed save. Export error confirms that no file was generated when true. |
| Offline | Cached preferences/status remain readable but labeled stale. Disable Save, push changes, and export under the global offline explanation; local theme preview may be viewed but not called saved. |
| Permission | Unauthenticated access routes to sign-in with safe return. Export and provider endpoints recheck authorization; errors reveal no other user's settings/subscriptions/data. |
| Provider unavailable | Show manual alternative and exact capability impact. Missing AI does not look like an app failure; unavailable worker never claims reminders will deliver. |
| Push denied | Show non-judgmental browser-settings guidance and no repeated permission prompt. Scheduling tasks remains enabled elsewhere. |

## Keyboard, touch, and accessibility

- Cards follow document order; Save actions are named by card where ambiguity exists.
- Timezone search uses the combobox pattern and exposes canonical name plus local-time preview.
- Theme previews and provider indicators include text, not color/icon alone.
- Save, subscribe, unsubscribe, and export results use polite live status; blocking auth loss uses an alert and safe redirect.
- Confirmation for unsubscribe names the effect and returns focus to Enable reminders.
- All controls meet shared target, contrast, zoom, reduced-motion, and error-summary rules.

## Acceptance evidence

Verify every preference, server save/failure rollback, timezone preview, all push states, worker and AI available/unavailable, subscribe/unsubscribe, authorized JSON export success/failure, offline, unauthenticated redirect, keyboard/screen-reader behavior, and 1440/1024/390 px layouts.
