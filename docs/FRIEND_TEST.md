# Friend/local candidate test

Use this as the concise handoff for the implemented baseline. P6 adds the reminder path only after
that package is fully integrated; P7 owns the final release rehearsal.

## Candidate

- App URL: `http://127.0.0.1:3000` by default, or `https://<optional-candidate-host>`
- Health: `<app-url>/api/health/ready`
- Candidate commit: `<release-commit>`
- Expected test time: seven minutes

Replace the commit and any optional host placeholder before sharing this file.

## Seven-minute path

1. Open the app in a private browser window and choose **Try demo**. Confirm the text says the sample workspace is isolated for this visitor.
2. In Inbox, add one task, open its details, and change its priority, schedule, checklist, and Markdown notes.
3. Open Today, Upcoming, Calendar, and Priority matrix. Confirm the scheduled task represents the
   same title and that a non-drag schedule editor is available. Open a recurring sample, complete one
   occurrence, and confirm its series remains open.
4. Open Habits, create one habit, check it in from Today, edit its entry, and inspect its history.
   Archive and restore it; confirm its history remains intact.
5. Open Focus. Start a Stopwatch linked to a sample task, pause, refresh, resume, and finish it.
   Confirm the saved row appears in Recent sessions and changes the derived totals.
6. Open Plan. Paste a short brain dump, select one unscheduled sample task, create a proposal, edit or deselect one change, and press Apply. Confirm nothing changed before Apply and the result links back to Today/Calendar.
7. Open **Settings → App**. If the browser offers installation, install OpenTask and confirm it opens
   in its own window. Put the browser offline: confirm the loaded workspace stays visible and
   read-only, task controls do not accept a write, and a new cold navigation shows only the
   content-free OpenTask offline page. Reconnect and use **Try connection**.
8. In Settings, export the JSON file, then sign out. Confirm protected pages and export are no longer accessible.
9. Return to `/`, choose **Try demo** again, and confirm the deterministic sample workspace resets without asking for shared credentials.

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
- The installed PWA keeps an already rendered page read-only when disconnected and gives cold
  navigation a content-free fallback. It does not cache account/task responses, queue changes, or
  claim offline synchronization.
- Export is JSON only; import/restore is not part of this release.
- Reminders are part of the active plan but must not be claimed in a friend candidate until their
  complete package gate passes. Collaboration and billing remain outside active scope.
