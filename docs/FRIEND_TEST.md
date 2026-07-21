# Friend/local candidate test

Use this as the concise handoff for the implemented baseline. P7 expands it with Focus, PWA, and
reminder steps only after those packages are fully integrated.

## Candidate

- App URL: `http://127.0.0.1:3000` by default, or `https://<optional-candidate-host>`
- Health: `<app-url>/api/health/ready`
- Candidate commit: `<release-commit>`
- Expected test time: five minutes

Replace the commit and any optional host placeholder before sharing this file.

## Five-minute path

1. Open the app in a private browser window and choose **Try demo**. Confirm the text says the sample workspace is isolated for this visitor.
2. In Inbox, add one task, open its details, and change its priority, schedule, checklist, and Markdown notes.
3. Open Today, Upcoming, Calendar, and Priority matrix. Confirm the scheduled task represents the
   same title and that a non-drag schedule editor is available. Open a recurring sample, complete one
   occurrence, and confirm its series remains open.
4. Open Habits, create one habit, check it in from Today, edit its entry, and inspect its history.
   Archive and restore it; confirm its history remains intact.
5. Open Plan. Paste a short brain dump, select one unscheduled sample task, create a proposal, edit or deselect one change, and press Apply. Confirm nothing changed before Apply and the result links back to Today/Calendar.
6. Open Settings, export the JSON file, then sign out. Confirm protected pages and export are no longer accessible.
7. Return to `/`, choose **Try demo** again, and confirm the deterministic sample workspace resets without asking for shared credentials.

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
- The implemented baseline keeps an already rendered page read-only when disconnected; the active PWA
  package adds only an installable static shell/offline fallback and still does not claim sync.
- Export is JSON only; import/restore is not part of this release.
- Focus and reminders are part of the active plan but must not be claimed in a friend candidate
  until their complete package gates pass. Collaboration and billing remain outside active scope.
