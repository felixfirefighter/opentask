# Direct app launch and onboarding

## Purpose and route

`/` opens the application directly. It is not a marketing landing page and does not expose account
creation, sign-in, or sign-out actions. On first visit, it runs the guided local profile and
companion onboarding flow before entering Today.

The username is cached in browser local storage. It is not a credential, is never used for
authorization, and is written only after the internal isolated workspace bootstrap succeeds.

## State contract

| State | Required presentation |
|---|---|
| Default | Direct app launch surface with the scripted onboarding conversation when no cached username exists. |
| Existing profile | Load the existing session and onboarding state; offer the daily check-in, then enter `/today` without resetting workspace data. |
| Loading | Keep the current step visible, disable duplicate submission, and announce workspace preparation or save progress. |
| Error | Keep the current input editable, explain the failed operation, and offer retry. |
| Offline | Keep the dialog readable, disable the bootstrap action, and say that one connection is required. |
| Permission | The username never grants access; protected routes still require the internal server actor. |
| Success | Cache the trimmed username, persist onboarding/check-in state, and enter `/today`. |

## Layout and accessibility

- Use a restrained app launch surface with the Omplish mark and no promotional preview composition.
- First-run steps collect a name, optional OpenAI key, companion goals, and a final confirmation.
- Returning users see one daily mood check-in; a configured companion may provide a short response.
- Escape and outside clicks cannot dismiss required first-run setup.
- Initial focus enters the active field; typewriter copy is skippable and reduced motion removes its delay.
- Errors use an alert and retain the current input value.
- The dialog and launch surface meet the shared keyboard, touch, responsive, theme, and reduced-motion
  contracts at 1440, 1024, and 390 CSS px.
