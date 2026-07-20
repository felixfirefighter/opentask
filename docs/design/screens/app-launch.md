# Direct app launch and local profile setup

## Purpose and route

`/` opens the application directly. It is not a marketing landing page and does not expose account
creation, sign-in, or sign-out actions. On first visit, a modal asks for the profile username that
will be shown inside the workspace.

The username is cached in browser local storage. It is not a credential, is never used for
authorization, and is written only after the internal isolated workspace bootstrap succeeds.

## State contract

| State | Required presentation |
|---|---|
| Default | Direct app launch surface with the profile setup dialog open when no cached username exists. |
| Existing profile | Skip setup and open `/inbox` directly; if the internal session is missing, resume through `/` and bootstrap it. |
| Loading | Keep the dialog open, disable duplicate submission, and announce workspace preparation. |
| Error | Keep the username editable, explain that the workspace was not opened, and offer retry. |
| Offline | Keep the dialog readable, disable the bootstrap action, and say that one connection is required. |
| Permission | The username never grants access; protected routes still require the internal server actor. |
| Success | Cache the trimmed username and enter the requested workspace destination. |

## Layout and accessibility

- Use a restrained app launch surface with the OpenTask mark and no promotional preview composition.
- The setup dialog has one labelled username field and one explicit “Open workspace” action.
- Escape and outside clicks cannot dismiss required first-run setup.
- Initial focus enters the username field; errors use an alert and retain the field value.
- The dialog and launch surface meet the shared keyboard, touch, responsive, theme, and reduced-motion
  contracts at 1440, 1024, and 390 CSS px.
