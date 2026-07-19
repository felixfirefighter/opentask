# Friend candidate test

Use this as the concise handoff for the hosted Deadline-safe Core.

## Candidate

- App URL: `https://<candidate-host>`
- Health: `https://<candidate-host>/api/health/ready`
- Candidate commit: `<release-commit>`
- Expected test time: five minutes

The placeholders above must be replaced with the deployed candidate values before sharing this file.

## Five-minute path

1. Open the app in a private browser window and choose **Try demo**. Confirm the text says the sample workspace is isolated for this visitor.
2. In Inbox, add one task, open its details, and change its priority, schedule, checklist, and Markdown notes.
3. Open Today, Upcoming, Calendar, and Priority matrix. Confirm the scheduled task represents the same title and that a non-drag schedule editor is available.
4. Open Plan. Paste a short brain dump, select one unscheduled sample task, create a proposal, edit or deselect one change, and press Apply. Confirm nothing changed before Apply and the result links back to Today/Calendar.
5. Open Settings, export the JSON file, then sign out. Confirm protected pages and export are no longer accessible.
6. Return to `/`, choose **Try demo** again, and confirm the deterministic sample workspace resets without asking for shared credentials.

Repeat the navigation and primary action once at desktop width and once on a phone. If AI is marked unavailable, record that exact state; manual tasks, schedules, Calendar, Matrix, and export must still work.

## Feedback

Send one short block:

```text
Browser/device:
Step that failed or felt unclear:
What you expected:
What happened:
Screenshot or screen recording:
Severity: blocker / critical / major / minor
```

Do not enter personal tasks, credentials, API keys, or private information in the demo.

## Known boundaries

- AI planning requires the server operator to configure an OpenAI API key; it is not entered in the browser.
- Offline mode is read-only and does not claim cached data or background synchronization.
- Export is JSON only; import/restore is not part of this release.
- Recurrence, habits, focus timers, reminders/push, collaboration, and billing are intentionally absent.
