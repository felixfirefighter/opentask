# Assistant module contract

`modules/assistant` owns the reality-aware planner proposal lifecycle and OpenAI adapter. It is a reviewed proposal pipeline, never an autonomous agent.

## Responsibilities

- Report disabled/unavailable state when neither a profile key nor `OPENAI_API_KEY` is present.
- Let a profile owner add, replace, or remove one OpenAI API key from Settings; store it encrypted
  server-side and never return the secret to the browser.
- Provide an optional returning-user companion check-in response using the existing encrypted
  profile key; provider failure degrades to the scripted local response.
- Authorize and load minimal selected task/context data for a brain dump, planning date, work window, default duration, and buffer.
- Call the OpenAI Responses API with `gpt-5.6`, `store: false`, and Structured Outputs backed by the canonical Zod schema.
- Validate/refusal-handle model output, then call planning's deterministic interval scheduler.
- Persist an expiring reviewable proposal with before/after actions, rationale, uncertainty, overflow, and context versions.
- Let the user edit/select actions, then re-fetch, revalidate, and atomically apply an idempotent selection.

## Owned persistence

- `openai_credentials` and `planner_proposals`.

The raw brain dump is not persisted by default.

## Public use cases and contracts

- `getPlannerCapability(actor)` returns configured/disabled state without exposing keys.
- `getOpenAISettings(actor)` and `updateOpenAIKey(actor, key)` own the redacted provider-settings contract.
- `createCompanionCheckin(actor, name, context)` returns a short non-persistent check-in response or
  an unavailable result without mutating domain data.
- `createPlannerProposal(actor, input)` performs authorize, model, validation, deterministic scheduling, and proposal persistence.
- `getPlannerProposal`, `rejectPlannerProposal`, and expiry handling.
- `applyPlannerProposal(actor, proposalId, selection, idempotencyKey)` revalidates and commits selected changes.
- Public contracts: `PlannerInput`, `ModelExtraction`, `PlannerAction`, `PlannerProposalDto`, `PlannerSelection`, `PlannerApplyResult`, and versioned `PlannerProposalSchema`.

`defer` is a review disposition with no new task status or persistence field.

## Invariants

- OpenAI is optional; its absence cannot prevent identity, tasks, planning, or export from starting.
- The browser never receives an OpenAI key or calls OpenAI directly.
- Companion responses are optional, short-lived, and never persisted as task or profile data.
- Profile keys are encrypted at rest with a server-only encryption secret and are deleted by profile reset.
- Requests send only selected/minimal context, use `store: false`, and logs contain no brain dump, task content, model input, or model output.
- Model output contains semantic suggestions, not trusted database IDs, ownership, overlap decisions, or repository commands.
- The same Zod schema validates Structured Output and persisted proposal documents; refusals, timeouts, and schema/semantic failures write no domain changes.
- Deterministic planning rejects overlap, out-of-window blocks, impossible constraints, and unknown semantic references before review.
- No proposal mutates domain data until an explicit second user apply action.
- Apply permits only create, clarify/update, prioritize, schedule, or no-op defer. Delete, complete, cancel, share, and notification actions are rejected.
- Apply reloads ownership and current versions, rejects stale actions, commits selected valid changes atomically, and is idempotent.
- Proposal `schema_version`, model, prompt version, expiry, status, context versions, and apply token follow the data-model contract.

## Dependencies

- Public tasks snapshot/query and allowed mutation services.
- Planning's deterministic scheduler and public identity preference/time reader.
- `shared/auth`, `shared/db`, `shared/logging`, `shared/time`, and `shared/validation`.
- OpenAI SDK behind a server-only provider adapter.

## Non-responsibilities

- Autonomous execution, deletion/completion/cancellation, reminders to another person, collaboration, ongoing chat, general-purpose assistant behavior, or persisting raw brain dumps.
- Deterministic overlap/timezone/version/authorization decisions inside the prompt or model.

## Required tests

- Disabled/missing-key, timeout, refusal, invalid JSON/schema, semantic-invalid, and provider-error tests proving no writes.
- Golden extraction/scheduling fixtures for vague input, multiple tasks, fixed busy intervals, overflow, impossible constraints, and irrelevant input.
- Minimal-context and redacted-log assertions, including `store: false` request verification.
- Cross-user selected-task/proposal denial and unknown-reference tests.
- Review edit/deselect, allowed-action, forbidden-action, expiry, stale-version, atomic rollback, and idempotent retry tests.
- End-to-end “propose, review, apply” test proving no mutation occurs before the second action.
