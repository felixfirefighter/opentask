# Prompt Library module contract

## Ownership

`modules/prompts` owns saved standalone reusable prompts and prompt-local tags. It does not own task
prompts, Ameth chat history, or OpenAI credentials.

## Invariants

- Every prompt and tag query is constrained by the authenticated user; `(user_id, prompt_id)` is a
  foreign key boundary, not only an application convention.
- The library is available only at companion Level 3, enforced in application services and all APIs.
- Ameth analysis is explicit, English-only, `store: false`, and returns proposed title, description,
  and tags. It does not create, edit, archive, or delete saved prompts.
- Manual create/edit/copy remains available without OpenAI. Prompt content is never logged.
- Version-2 private export includes user-owned prompts and prompt-local tags.

## Public contract

The root module exports only authorized list/get/create/update/delete application contracts and Zod
request schemas. Route composition imports UI only from `modules/prompts/presentation`.
