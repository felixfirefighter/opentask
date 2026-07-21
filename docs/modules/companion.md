# Companion module contract

`modules/companion` owns Ameth’s optional progression, private derived summaries, and non-persistent
chat. It is a companion surface, never an autonomous agent or an alternative task writer.

## Responsibilities

- Maintain a user-owned profile, three-level XP projection, and append-only idempotent award ledger.
- Render the global avatar/progress ring, accessible XP preview, and responsive chat drawer.
- Produce transparent, user-readable aggregate summaries without storing raw chat or task content.
- Offer scripted provider-absent chat and route planning intent to the existing review-before-apply Plan surface.

## Owned persistence

- `companion_profiles`, `companion_xp_events`, and `companion_behavior_summaries`.

## Invariants

- Levels are 1 at 0 XP, 2 at 300 XP, and 3 at 1,000 XP; Level 3 unlocks the separate Prompt Library module.
- Awards happen through source-module application transactions and are unique by user/action/source.
- Task completion awards 10 XP, an explicit planner apply awards 20 XP once per local day, and a
  completed daily check-in awards 10 XP once per local day. Reapplying or rewriting the same source
  produces no additional XP.
- Every query is constrained by `user_id`; reset cascades profile-owned companion data.
- Chat and summaries cannot mutate tasks, schedules, status, reminders, habits, or Focus sessions.
- No raw chat transcript, task title/description history, OpenAI key, or provider trace is persisted or logged.
- User-approved memory cards only are durable. Their UTF-8 total is capped at 30 MiB; the oldest cards are removed before a new card exceeds that cap.
- A `warm`, `focused`, or `direct` daily mode remains until the next local-day app reopen; default communication style remains user-configurable.
- Version-2 private export includes companion-derived data and approved memory cards only; chat turns
  remain browser-session-only.

## Required tests

- Level threshold, duplicate source, concurrent award, user-isolation, rollback, reset, and export tests.
- Provider-absent chat, no-mutation, summary delete/rebuild, keyboard/touch/reduced-motion, and responsive drawer tests.
