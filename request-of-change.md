# Codex Build Prompt — Omplish Onboarding & Returning-User Flow

> **How to use this doc.** Sections 1–3 are shared context. Feed them to Codex **once at the top of every phase**, then append the single phase you want built (Phase 1 → 4, in order). Each phase has its own acceptance criteria; don't start the next phase until the current one passes. Section 4 is a risk register — keep it in view but it's not build work.

---

## 1. Product & voice context (always include)

**Omplish** is a local-first, open-source desktop task planner (Electron + Next.js, macOS/Windows). It works fully offline. **Ameth** is the in-app AI companion; Ameth's *live* features unlock only when the user connects their own OpenAI API key.

- **Omplish** = the app/product. **Ameth** = the AI companion (a name, a persona).
- Nothing leaves the user's machine except the single OpenAI key-verification call and (when keyed) companion inference.

**Voice (applies to every user-facing string in this build):**
- Sentence case. Contractions. Plain, warm, short. One idea per line.
- No exclamation-mark spam, no forced emoji, no ALL-CAPS hype, no manufactured urgency, no guilt.
- Encouragement is specific and earned, never sprinkled. Brevity is kindness.

**Ameth persona (for any *live* inference in Phase 4):** present (accompanies, not transactional), momentum-oriented (moves the user one concrete step), warm and believing (celebrates real progress specifically, meets setbacks with steadiness). Not a therapist — if a user shows real distress, be warm and gently point to real people/professionals; don't play clinical roles. Default 1–3 sentences.

**Hard rule — all onboarding dialogue is SCRIPTED, not AI-generated.** The onboarding runs before a key is guaranteed to exist, so every line is pre-written and revealed with a typewriter animation. Live OpenAI inference appears **only** in Phase 4 (returning user, and only when a key is present).

---

## 2. Architecture & security constraints (always include)

Assume: **Electron main process** + **Next.js renderer** + **preload script** exposing a narrow typed IPC bridge via `contextBridge`. If the repo already fixes these choices, follow the repo; otherwise apply the below.

**Non-negotiable security posture (implement exactly):**
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on the renderer.
- **Never** expose raw `ipcRenderer` to the renderer. Expose only the named channels in §3.4.
- The OpenAI key **never** lives in the renderer, `localStorage`, `sessionStorage`, or any plaintext file. It crosses IPC to main **once**, is verified in main, and is stored via Electron **`safeStorage`** (Keychain / DPAPI). The renderer only ever learns a boolean `hasKey`.
- Redact the key from all logs and error surfaces. Never echo it back to the renderer.
- Set a renderer CSP; the only outbound origin the app needs is `https://api.openai.com`.

**Offline-first constraint:** the app must run with no network. Bundle/self-host all fonts and assets — **no Google Fonts CDN, no runtime remote fetches** except OpenAI calls. Every network path (key verify, companion inference) must degrade gracefully on timeout/offline — never trap the user in a dead state.

**Persistence split:**
- Non-secret state (`electron-store`, plain JSON): user name, goals, onboarding flags, check-in log. If the repo already has a local store (SQLite, etc.), target that instead — ask before inventing a second store.
- Secret (OpenAI key): `safeStorage` only.

---

## 3. Shared building blocks (build these first, reuse across phases)

### 3.1 Fonts
Self-host two families (bundle the woff2 files; no CDN):
- **Body / UI:** a warm humanist sans — **Hanken Grotesk** (or Figtree). Used for input, buttons, secondary text.
- **Display / emphasis:** a soft warm serif — **Fraunces** (optical sizing on). Used for greeting lines and *emphasized* words only.

Emphasis convention in this doc: text wrapped in `*asterisks*` renders in the **display font** (Fraunces), slightly larger/warmer. Everything else is body font. Do not bold-spam; emphasis is rare and intentional.

### 3.2 Typewriter engine (`useTypewriter` hook + `<Typeline>` component)
Reusable, used everywhere a line "types out":
- Reveals text character-by-character at a human cadence (~28–45ms/char) with mild random jitter; brief extra pause at `,` `.` `—`.
- **Skippable:** a click or any keypress fast-forwards the current line to full instantly. Never make the user wait on the animation.
- **Accessibility:** if `prefers-reduced-motion` is set, render the full line instantly (no animation).
- **Staged reveal:** input fields / buttons for a step appear **only after** that step's line(s) finish (or are skipped). This is the core "conversation" feel — respect it in every phase.
- Supports the `*emphasis*` markup (renders those spans in the display font mid-line).

### 3.3 Local state schema (`electron-store`)
```jsonc
{
  "schemaVersion": 1,
  "onboarding": { "complete": false, "completedAt": null },
  "user": { "name": "" },
  "goals": [],                 // canonical keys, see §Phase 3
  "companion": { "hasKey": false, "verifiedAt": null }, // mirror only; source of truth for the key is safeStorage
  "checkins": []               // [{ "date": "YYYY-MM-DD", "mood": "good|tired|heavy|ready|other", "note": "" }], capped at last 30
}
```
The renderer reads/writes this only through IPC (§3.4). Treat `onboarding.complete` as the single source of truth for first-run vs returning routing.

### 3.4 IPC surface (preload → main; expose nothing else)
```ts
window.omplish = {
  store: {
    get<T>(path: string): Promise<T>,
    set(path: string, value: unknown): Promise<void>,
  },
  companion: {
    hasKey(): Promise<boolean>,
    verifyKey(key: string): Promise<{ ok: boolean; reason?: 'invalid' | 'network' | 'timeout' | 'unknown' }>,
    saveKey(key: string): Promise<{ ok: boolean }>,   // verifies again in main before persisting; never persists an unverified key
    clearKey(): Promise<void>,
    // Phase 4 only:
    chat(input: { system: string; messages: {role:'user'|'assistant'; content:string}[] }): Promise<{ ok: boolean; text?: string; reason?: string }>,
  }
}
```
- `verifyKey` runs in **main**: `GET https://api.openai.com/v1/models` with the key as a bearer token, **6s timeout**. `200` → `{ok:true}`. `401/403` → `{ok:false, reason:'invalid'}`. Network/abort → `reason:'network'|'timeout'`. Do a loose format pre-check (`sk-…` / `sk-proj-…`) but **never** hard-gate on regex — OpenAI can change the prefix; the live call is the real check.
- `saveKey` re-verifies in main, then stores via `safeStorage`; set `store.companion.hasKey = true` and `verifiedAt`.

### 3.5 App entry routing
On launch, read `onboarding.complete`:
- `false` → **Phase 1–3 onboarding flow** (start plain, centered, nothing else on screen).
- `true` → **Phase 4 returning-user flow**.

---

## 4. Phases

### PHASE 1 — Onboarding shell, typewriter, greeting, username

**Goal:** A completely plain, centered first-run screen that greets the user by typewriter and collects a username. No key, no AI, no goals yet.

**Build:**
- Empty page: no chrome, no sidebar, no header. Centered column, generous whitespace, calm. Subtle background only.
- On first paint, type these lines in sequence (each begins after the previous finishes):
  1. `hey. welcome to *Omplish*.`
  2. `before anything else — what should i call you?`
- After line 2 completes, fade in a single **underline-style text input** (no box border, just a bottom rule) centered under the text, autofocused. Placeholder empty or a faint `your name`.
- Submit on **Enter** or a minimal ghost "→" button. Trim; require non-empty (1–40 chars). On empty submit, gently re-focus, no error shouting.
- Persist `user.name`. Advance to Phase 2 with a short typewriter acknowledgment that carries over: `good to meet you, *{name}*.`

**Acceptance criteria:**
- Reduced-motion renders lines instantly; input still gated to after the (instant) lines.
- Clicking/keypress mid-type fast-forwards the current line.
- `user.name` is persisted via IPC before advancing.
- Nothing about keys/AI/goals is visible in this phase.

**Out of scope:** key step, Ameth, goals.

---

### PHASE 2 — OpenAI key step (skip path + verify + secure storage)

**Goal:** Optionally connect a key, with a clean skip path and real verification. Same conversational, typewriter feel.

**Build — copy sequence (types after the Phase 1 acknowledgment):**
1. `one optional thing.`
2. `if you connect your own *OpenAI API key*, you unlock your companion — that's *Ameth*, who plans and checks in with you.`
3. `no key is needed to use Omplish. it tracks everything, fully offline. you can add a key anytime in *Settings*.`

Then reveal: an underline input (`sk-…`, masked/password type, autofocus off), plus two buttons: **`skip for now`** (ghost) and **`connect`** (primary). One idea per screen — don't crowd it.

**Skip path:**
- Type: `no problem. you're all set to plan on your own — i'll be here for the rest.` → advance to Phase 3. Leave `companion.hasKey = false`.

**Connect path:**
- On `connect` with a non-empty value: disable buttons, show a quiet typing/loading line `checking your key…`.
- Call `companion.verifyKey`.
  - **invalid** → type: `hmm, that key didn't work. mind double-checking it? it usually starts with *sk-*.` → re-enable input, keep value selected for easy re-entry. Don't advance.
  - **network / timeout** → type: `i couldn't reach OpenAI to check that just now. you can retry, or skip and add it later in Settings.` → offer `retry` + `skip for now`. Never dead-end.
  - **ok** → call `companion.saveKey` (re-verifies + stores in safeStorage), then type: `you're connected. *Ameth* is awake.` → advance to Phase 3.

**Acceptance criteria:**
- Key never appears in renderer state, logs, `localStorage`, or the store as plaintext; renderer only sees booleans/reasons.
- Verification happens in main via `GET /v1/models` with a 6s timeout; loose format pre-check only.
- Skip, invalid, offline, and success paths are all reachable and none traps the user.
- After success, `companion.hasKey === true` and `verifiedAt` is set.

**Out of scope:** goals, live inference.

---

### PHASE 3 — Ameth intro, goals multi-select, summary & CTA

**Goal:** Ameth introduces itself (scripted), asks what the user wants, collects a multi-select, then reflects it back warmly and completes onboarding.

**Build — Ameth intro (shown to everyone who reaches here, keyed or not):**
1. `i'm *Ameth*, your companion inside Omplish.`
2. `i'll help you plan small, start sooner, and keep moving — for the wins and the off days both.`
3. `quick question so i can help well —`
4. `*what do you want Omplish to help you with?* pick as many as fit.`

**Goals multi-select (buttons, not free text):** toggleable chips; multiple allowed. Canonical key → label:
- `discipline` → `building discipline`
- `tasks` → `tracking tasks`
- `habits` → `building habits`
- `reminders` → `reminders`
- `daily_planning` → `planning daily tasks`
- `scheduling` → `scheduling ahead`
- `other` → `something else`

A **`continue`** button appears only once ≥1 chip is selected. Selecting `other` may reveal one optional underline input for a short free-text note (store under `goals` as `other:<text>` or a small side field — keep it simple).

**Summary & CTA (uses the actual selections, listed naturally):**
- Type: `got it — you're here for {a}, {b}, and {c}.` (render the selected labels, comma-joined with "and"; if one, just that one).
- Type: `that's a solid place to start. i think we can do this together.`
- Then, conditionally:
  - **keyed:** `let's begin.`
  - **no key:** `i'll be quietly along for the ride until you add a key — then i can really get to work. let's begin.`
- Reveal a single primary CTA **`let's start`**. On click: persist `goals`, set `onboarding.complete = true` + `completedAt`, route into the main app.

**Acceptance criteria:**
- Multi-select works (select/deselect several); `continue` gated to ≥1.
- Summary reflects the *actual* selected labels, in sentence case, no hype.
- No-key branch shows the gentle reminder; keyed branch doesn't.
- On CTA, `goals` and `onboarding.complete` persist before routing.

**Out of scope:** returning-user flow.

---

### PHASE 4 — Returning-user check-in & routing

**Goal:** On reopen (`onboarding.complete === true`), greet by name and do a low-friction emotional check-in *before* revealing the day's tasks/goals. Use live Ameth when a key exists; scripted fallback otherwise.

**Routing:** app entry reads `onboarding.complete`; if true, render this flow instead of the plain first-run screen.

**Keyed path (live Ameth):**
- Build the system prompt from: §1 persona + the compact seed below + `user.name` + `goals` + the last 1–3 `checkins`. Ask for a single warm, 1–2 sentence check-in that greets by name and gently asks how they're arriving today. **Do not** dump tasks yet.
- Call `companion.chat` in **main** (key stays in main). For MVP, return the **full** text (non-streaming), then render it through the typewriter — this keeps the consistent "human typing" feel and avoids IPC streaming complexity.
- On any failure/timeout → fall back to the scripted path silently.

Compact seed for the system prompt:
> Omplish is a local-first task companion. You are Ameth: calm, warm, grounded, private, honest. Accompany the user, drive small concrete accomplishment, encourage specifically. Treat slips as data, never failure. Never guilt, fake hype, or manufactured urgency. Brevity is kindness. 1–2 sentences.

**No-key path (scripted, rotate lines so it doesn't feel canned):**
- e.g. `morning, *{name}*. how are you arriving today?` / `hey *{name}*. no rush — how are you feeling before we look at the day?`

**Check-in response (both paths):** show mood chips `good` · `tired` · `heavy` · `ready` (plus an optional short text input). On selection, persist a `checkins` entry `{date, mood, note?}` (cap list at 30).

**Transition, then the day:**
- Type a short, mood-aware bridge (scripted is fine even on keyed path): if `heavy`/`tired` → `thanks for telling me. no pressure today — we'll take it one step at a time.` ; if `ready`/`good` → `love that. here's what's on deck.`
- Then reveal today's tasks / goals of the day (wire to the existing task view; if none exists yet, render a placeholder list component and mark a TODO).

**Acceptance criteria:**
- Tasks are **never** shown before the check-in completes.
- Keyed path uses main-process inference; renderer never touches the key. Any inference failure degrades to scripted with no visible error.
- Each reopen logs at most one `checkin` for the day; list stays capped.
- Reduced-motion and skip behaviors still hold.

**Out of scope:** full task CRUD, notifications, Settings screen (only referenced, not built here).

---

## Risk register (review, don't "build")

- **Offline app making a network call.** Key verify + companion inference are the only outbound paths. Both must timeout gracefully and never dead-end the user. Bundle fonts locally — a CDN font makes the "offline" claim false.
- **OpenAI platform risk.** Key prefix (`sk-`/`sk-proj-`) and the `/v1/models` shape can change; rely on the live 200/401, not regex. Pricing/quota errors (`429`) are *not* "invalid key" — treat as `network`/retry, not `invalid`, or the user is wrongly told their key is bad.
- **Key handling is the security-critical surface.** If it ever lands in renderer state, `localStorage`, logs, or plain JSON, that's a real leak. `safeStorage` + `hasKey` boolean is the whole contract. Also handle `safeStorage.isEncryptionAvailable() === false` (e.g. some Linux setups) — refuse to store rather than fall back to plaintext, and tell the user plainly.
- **electron-store version drift.** Bump `schemaVersion` and add a migration stub now, so future goal/check-in shape changes don't corrupt existing users.
- **Scope creep into the companion.** Onboarding must stay scripted; resist the pull to make onboarding "smart." Live inference is Phase 4 only, and Phase 4's MVP is one check-in message — not a chat loop.