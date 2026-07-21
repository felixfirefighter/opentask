# Friend/local candidate test

Use this concise path to verify the Local-first Full Release before recording or submission. Do not
enter personal tasks, credentials, API keys, or private information in the demo workspace.

## Candidate

- App URL: `http://127.0.0.1:3000` by default, or `https://<optional-candidate-host>`
- Health: `<app-url>/api/health/ready`
- Candidate commit: `<release-commit>`
- Expected test time: seven minutes
- Reminder configuration: `configured` / `provider-degraded`

Replace the commit, host, and reminder state before sharing this file.

## Seven-minute path

1. Open the app in a private browser window and choose **Try demo**. Confirm the sample workspace is
   described as isolated. Add a task, open its details, and change its priority, schedule, checklist,
   and Markdown notes.
2. Open Today, Calendar, and Priority matrix. Confirm they show the same task facts and expose a
   non-drag schedule editor. Complete one recurring occurrence and confirm its series remains open.
3. Check in a seeded habit from Today and inspect its history. Start a Stopwatch linked to a sample
   task, finish it, and confirm Recent sessions and the derived total update.
4. In Plan, paste a short brain dump, select one unscheduled sample task, create a proposal, edit or
   deselect one change, and press Apply. Confirm nothing changes before Apply and the result links to
   the affected planning views. If AI is unavailable, confirm the explanation is explicit and
   continue the manual path.
5. Open one task's details, add a reminder, and confirm its interpreted time before saving. Then open
   **Settings → App and reminders** and inspect **Task reminders**:
   - In a configured environment, choose **Enable in this browser**, grant permission only after that
     action, and use a pre-timed enabled reminder while `pnpm worker` is running. Confirm the generic
     **Task reminder** notification contains no task content and opens the authenticated task when
     clicked.
   - In a provider-degraded environment, confirm the precise unavailable/worker/browser state is
     visible and that the saved reminder plus every manual workflow remain usable. Do not treat the
     absence of a notification as a product failure in this declared mode.
6. If the browser offers installation, confirm OpenTask is installable. Put the browser offline:
   the loaded workspace must stay visible and read-only, writes must be disabled, and a cold
   navigation must show only the content-free offline page. Reconnect and use **Try connection**.
7. Export the JSON file from Settings and confirm it identifies schema version 5 without exposing
   provider credentials, push endpoints, or encryption material. Sign out and confirm protected
   pages are inaccessible; choose **Try demo** again and confirm the deterministic workspace resets
   without shared credentials.

Run the seven-minute path once on desktop. On a phone, repeat navigation plus the primary task and
reminder controls as a short responsive follow-up.

## Feedback

Send one short block:

```text
Browser/device:
Candidate commit:
Reminder configuration:
Step that failed or felt unclear:
What you expected:
What happened:
Screenshot or screen recording:
Severity: blocker / critical / major / minor
```

## Known contract limitations

- GPT-5.6 planning requires a server-side OpenAI key. The browser never accepts that key; manual
  workflows and export remain available without it.
- Browser reminders support zero or one push reminder per task. Delivery requires configured VAPID
  and encryption keys, a running worker, a supported browser, explicit permission, and an active
  subscription. The web UI reports worker configuration, not a heartbeat or delivery guarantee.
- The installed PWA provides an installable static shell and read-only connectivity behavior. It
  does not cache authenticated responses, queue writes, or claim offline synchronization.
- Export is versioned JSON only. Import/restore, active Focus state, provider delivery records, and
  secret notification material are not exported.
- Multiple reminders, email/SMS/location channels, collaboration, billing, and premium tiers are
  outside this release.
