# Reality-aware planner

## Purpose and route

`/plan` turns a brain dump and selected task context into a reviewable proposal, then applies only explicitly selected changes. It is optional and manual workflows remain prominent. The model cannot write, delete, complete, cancel, share, or notify.

The surface uses three route-preserved steps: **Describe**, **Review**, and **Result**. Leaving a non-applied proposal requires confirmation only when user edits would be lost.

## Step 1: Describe

Use one main form with:

- brain-dump textarea;
- searchable checklist of open unscheduled tasks, initially unselected or selected only by an explicit, documented rule;
- planning local date;
- work-window start/end;
- default task duration;
- buffer;
- a concise data-use explanation.

The primary action states “Create proposal”, not “Plan my day” if that could imply immediate writes. Show the user's timezone and a plain-language summary of the chosen window. Do not request or display an API key in the browser.

## Processing

Use a stable progress surface with honest stages: interpreting input, validating suggestions, and fitting eligible work into free intervals. Do not display fake percentages. The user can cancel the request when supported; cancellation produces no proposal or writes.

## Step 2: Review

Start with a summary of proposed, conflicting, deferred/overflow, and uncertain items. Then render proposal cards using `docs/design/components.md`, grouped by:

1. Needs attention: invalid, uncertain, stale, or conflicting;
2. Scheduled/updated;
3. New tasks;
4. Deferred/overflow.

Every action shows its type, before/after value, rationale, and uncertainty. User can edit allowed fields, select/deselect each valid action, and return to Describe. Invalid actions remain visible but cannot be applied. A sticky apply bar states the count and action: “Apply 5 changes”. Nothing applies merely by reaching this step.

## Step 3: Result

After atomic success, show the exact applied counts and links to Today/Calendar. Deselect/invalid/deferred items remain summarized as not applied. Do not imply partial success when the server transaction failed.

## State contract

| State | Required presentation |
|---|---|
| Default | Describe form or a complete review diff with explicit selection and second-step Apply action. |
| Empty | Blank brain dump and no selected tasks shows guidance and disables Create proposal with a reason. A valid proposal with zero actions says why and offers Edit input; it is not an error. |
| Loading | Processing stages keep submitted constraints visible in read-only summary. Apply shows a stable in-progress state and blocks duplicate idempotency requests. |
| Error | Refusal, timeout, invalid schema, provider error, deterministic constraint failure, and atomic apply failure each use specific recoverable copy. Preserve input/proposal edits when safe, offer Retry/Edit, and confirm that no changes were applied. |
| Offline | Describe/review content already present may be read, but Create proposal and Apply are disabled under the global offline message. Never queue an AI request or apply locally. |
| Permission | Unauthenticated access routes to sign-in. Selected task IDs are re-authorized server-side; removed/foreign tasks become generic stale actions without exposing their content. |
| Provider unavailable | When `OPENAI_API_KEY` is absent or the provider is disabled, show a calm explanation and direct links to manual Today/Calendar planning. Do not show a broken empty form. |
| Stale proposal | Mark affected cards, show latest safe before-values, require regeneration or revalidation, and prevent atomic Apply until every selected action is valid. |
| Overflow/conflict | Keep items visible with explanation and editable duration/window/selection where supported; never silently overlap or schedule outside the window. |

## Keyboard, touch, and accessibility

- The step indicator is an ordered status, not clickable tabs unless backward navigation is safe.
- Task selection is a labeled searchable checklist; selection count is textual.
- Proposal groups use headings; cards expose selection, action type, target, changes, rationale, uncertainty, and validity in reading order.
- After processing, focus moves to the Review heading; validation failure moves to the summary. After successful Apply, focus moves to Result.
- Sticky apply controls do not cover the focused proposal on mobile and include safe-area spacing.
- No meaning depends on AI/confidence color. Progress and apply results use live announcements without streaming raw model output.

## Acceptance evidence

Verify no-key disabled state; vague/multiple/fixed-appointment/overflow/impossible/irrelevant fixtures; edit/deselect; refusal/timeout/schema error; selected-task authorization; stale version; idempotent atomic success/failure; zero-action proposal; offline; keyboard/screen-reader review; and 1440/1024/390 px layouts.
