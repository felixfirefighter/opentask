# Authentication

## Purpose and routes

This contract covers email/password sign-up and sign-in.

- `/sign-up` and `/sign-in`: email/password authentication.

There is no email verification, password reset, social login, passkey, MFA, billing, or plan comparison in the active release. Do not render dead links for them.

## Authentication layout

Desktop uses a centered 400–440 px card on `canvas`, with product mark, `h1`, one-sentence orientation, form, and alternate auth/demo links. Mobile uses the full surface with 20 px gutters; the primary submit action spans the form width.

Sign-up fields: email, password, and password confirmation. Sign-in fields: email and password. Password guidance is visible before validation. Authentication errors are generic enough not to reveal account existence.

The alternate action links to the other auth form. A tertiary “Try demo” link returns to the public demo flow owned by `landing.md`; authentication forms do not expose or autofill shared credentials.

## State contract

| State | Required presentation |
|---|---|
| Default | The current form has one clear submit action and a link to the alternate form. |
| Empty | Blank auth fields show labels and examples, never validation errors before interaction. No-data empty state is not otherwise applicable. |
| Loading | Disable the submitting form, keep labels/geometry stable, show progress text, and prevent duplicate requests. |
| Error | Preserve email, clear password after a full navigation, show an error summary, use account-enumeration-safe copy, and offer a safe retry. |
| Offline | Keep explanatory content readable, disable submit, and show a visible offline message; never imply local account creation or sign-in. |
| Permission | Authenticated users visiting auth routes go to the safe return destination or Inbox. Domain data is never rendered during redirect. |

## Keyboard, touch, and accessibility

- Initial focus goes to the `h1`, then the first field through normal tab order; do not autofocus on mobile when it would immediately obscure context with the keyboard.
- Submit with `Enter` from a valid form; errors move focus to the summary and link to fields.
- Password reveal is a named toggle with persistent state text.
- Submit progress uses a polite live region.
- Auth content meets the same WCAG 2.2 AA, zoom, reduced-motion, and target-size rules as the app.

## Acceptance evidence

Capture sign-up/sign-in at 1440 and 390 px, light and dark forms, keyboard error recovery, generic credential failure, duplicate-submit prevention, offline sign-in, and authenticated redirect.
