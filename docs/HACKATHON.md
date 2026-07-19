# OpenAI Open Model Hackathon contract

Checked against the official Devpost overview and rules on **2026-07-18**. Re-check the official pages before final submission because organizers may post clarifications.

Sources: [overview](https://openai.devpost.com/), [official rules](https://openai.devpost.com/rules).

## Fixed submission facts

- Deadline: **2026-07-21 at 5:00 PM Pacific Time**, which is **2026-07-22 at 8:00 AM Singapore time**.
- Build requirement: use Codex and GPT-5.6 materially in the project.
- Recommended category: **Apps for Your Life**, because the official category includes consumer productivity. Re-check category wording in the submission form.
- Submission needs a working project, category, project description, repository access, and a public video under three minutes with audio.
- The repository must be public with the relevant open-source license, or shared with the judges as permitted by the official rules.
- The README must make setup and sample/demo use reproducible.
- The entry must identify important Codex decisions and provide the requested `/feedback` session identifier.
- The judging themes are technological implementation, coherent design, potential impact, and quality/novelty.
- The official overview recommends the Devpost Hackathons plugin for challenge details and submission. It is not currently available in this workspace's installable-plugin list; install it from the product's plugin catalog if it becomes available, but do not make delivery depend on it.

The rules, not this summary, control if wording differs.

## Original-work boundary

- Use an original final product name after a basic trademark/domain check; “OpenTask” is a working name only.
- Describe the product as inspired by the category, never as an official TickTick client or endorsed replacement.
- Do not use TickTick or Airbnb logos, screenshots, icons, copy, proprietary data, fonts, sounds, or pixel-identical screens.
- Use only project-owned, permissively licensed, or properly attributed visual/audio assets.
- Keep a dependency and asset license inventory before submission.
- The demo must not contain unlicensed music, private notifications, personal task content, API keys, email addresses, or browser history.

## Submission narrative

### One sentence

An open-source personal planning workspace that combines tasks and active calendar planning, then uses GPT-5.6 to turn a messy brain dump into a deterministic, editable schedule that never changes data without approval.

### Why it is not only a clone

- Useful core features remain available without a subscription or OpenAI key.
- The project is self-hostable and exposes a documented versioned export.
- GPT-5.6 extracts ambiguous intent into a strict proposal; application code, not the model, enforces time and ownership constraints.
- The user sees uncertainties and a before/after diff, edits the plan, and explicitly applies it.

### Codex story to capture during implementation

Retain concise evidence in Git and the final submission notes for:

- scope and architecture decisions;
- normalized all-day/timed schedule modeling;
- generated tests for DST, authorization, and stale proposals;
- visual and accessibility audit corrections;
- final security/schema/scope audit.

Do not create a running Markdown diary. Select a few meaningful commits and the final Codex task/session for the submission story.

## Demonstration script: maximum 2:30

| Time | Story beat | Visible proof |
|---:|---|---|
| 0:00–0:12 | Problem and promise | Original landing page; open-source/self-host message |
| 0:12–0:34 | Capture | Enter a natural-language task; recognized date remains editable |
| 0:34–0:56 | Organize | Add list, priority, tag, checklist item, and Markdown context |
| 0:56–1:16 | Plan across views | Schedule on Calendar; show the same task in Today and Matrix |
| 1:16–2:04 | GPT-5.6 showcase | Paste brain dump, generate typed proposal, show conflict/uncertainty, edit and explicitly apply |
| 2:04–2:18 | Trust | Show before/after, non-AI fallback, and JSON export |
| 2:18–2:30 | Build proof | Brief architecture/Codex evidence and repository/demo links |

Record a backup take. Keep cursor movement deliberate, browser zoom readable, and seeded data deterministic.

## Submission asset checklist

- [ ] Original final name, short tagline, long description, category, and feature list
- [ ] Public production URL and health check
- [ ] Public repository or judge access, intended license, and release tag/commit
- [ ] README quickstart tested from a fresh clone
- [ ] Sample environment file contains placeholders only
- [ ] Demo entry/seed instructions work without shared private credentials
- [ ] Public video under three minutes, with audible narration and captions if possible
- [ ] Thumbnail/screenshots at desktop and mobile widths
- [ ] Codex/GPT-5.6 implementation explanation
- [ ] `/feedback` session identifier captured
- [ ] Third-party dependency/asset licenses reviewed
- [ ] No secrets or personal data in Git history, logs, video, screenshots, or seed
- [ ] Submission form preview checked before the deadline

## Deadline operating rules

- Deliver the hosted friend candidate by **2026-07-20 20:00 GMT+8** and freeze engineering by **2026-07-21 08:00 GMT+8**.
- Reserve the final twelve hours for feature freeze, full audit, deployment, recording, and submission.
- Submit a complete draft as soon as the hosted demo and first recording exist; improve it before the deadline rather than waiting for the last minute.
- Keep a local video copy, a second hosted-demo verification path, and the exact release commit hash.
- If an external provider fails, demonstrate the self-host path and keep the non-AI application functional.
