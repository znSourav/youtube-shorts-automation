# Phase 2 Plan 4, Task 2 — Proof-Run Evidence

Recorded per the plan's own instruction: "Record what happened. Do not adjust the story idea, the
scene count, or the run plan to make a criterion pass." Every number below is a real, verbatim
result from a real paid call against `.env.local`'s `GEMINI_API_KEY`, captured 2026-09-12/13.

## 1. The idea, in both scripts (D-05)

A fresh idea, genuinely unrelated to Phase 1's "girl in a magical garden" content and to plans
02-02/02-03's already-run "boy trades marble for a kite" content — different protagonist (a girl,
not a boy), different setting (a grandmother's room, not a garden or village), different central
object (a broken bangle, not a cat/garden or a kite/marble), different emotional arc (a child
discovering a piece of family history, not a longing/coming-of-age arc).

**Bangla script:**
> একটি ছোট্ট মেয়ে তার ঠাকুরমার পুরনো ভাঙা চুড়ি খুঁজে পায় একটি ধুলোমাখা সিন্দুকে, এবং সারা দুপুর
> লুকিয়ে লুকিয়ে সেটা ঠিক করার চেষ্টা করে। শেষে সে জানতে পারে কেন তার ঠাকুরমা এত বছর ধরে ভাঙা চুড়িটা
> যত্ন করে রেখে দিয়েছেন।

**Banglish (romanized Bangla):**
> Ekta chotto meye tar thakurmar purono bhanga churi khuje pay ekta dhulomakha sinduke, ar sara
> dupur lukiye lukiye seta thik korar cheshta kore. Sheshe se jante pare keno tar thakurma eto
> bochor dhore bhanga churita jotno kore rekhe diyechen.

**English gloss** (never sent to the model — for this document's readers only): A little girl
finds her grandmother's old broken bangle in a dusty trunk, and spends the whole afternoon
secretly trying to fix it. In the end she learns why her grandmother has carefully kept the
broken bangle for so many years.

**Character description used for both runs:** "A curious 8-year-old girl with two neat braids,
wearing a simple cotton frock, sitting cross-legged on the floor of her grandmother's room."

Style preset: `soft-hand-painted-2d`. Mood: `Emotional`. Held constant across every run below so
script and scale are the only variables.

## 2. Bangla vs Banglish comparison (STORY-02, RESEARCH.md Open Question 1)

### Run A — Banglish, 3 scenes, story only

Two attempts were required. Attempt 1 was blocked at the **candidate** stage
(`finishReason: PROHIBITED_CONTENT`) on this entirely benign idea — no output, no text, `content: {}`.
Attempt 2, identical input, succeeded (`finishReason: STOP`). This single-retry pattern matches
02-03-SUMMARY.md's own precedent (a benign kite-flying story blocked once, then succeeded
identically on retry) and RESEARCH.md Pitfall 3's documented non-deterministic RAI-block behavior.

- **Title:** "Chotto Meye Ar Purono Churi" (the model kept the Banglish/romanized rendering for the
  title itself — direct evidence that the "answer in the same script as the input" instruction in
  `buildStoryPrompt` held, no silent translation to English or to Bangla script occurred)
- **Model:** `gemini-3.1-pro-preview` (primary tier, `fallbackUsed: false`)
- **Scenes:** 3, numbered 1, 2, 3 (no gaps/duplicates — `validateScenePlan` passed)
- **Scene durations:** 6, 4, 8 — varied, not defaulted to the maximum (§14 confirmed operational)
- **usageMetadata:** `promptTokenCount: 575, candidatesTokenCount: 1489, totalTokenCount: 7633, thoughtsTokenCount: 5569`
- **Cost:** $0.0500 (billed) + $0.0500 (attempt 1, blocked, billed per spend-ledger.ts's
  conservative-accounting convention) = $0.1000 for this leg, vs. ~$0.05 planned

**Known gap, honestly disclosed:** the story-probe CLI's premise/theme/ending print statements
were added to `src/scripts/story-probe.ts` *after* this run completed (see Deviations in the
plan's SUMMARY). `logRawResponse`'s own redaction (any string over 256 characters becomes a
length-naming placeholder — `src/lib/log-response.ts`, a deliberate secret/payload-safety control,
not something this task should weaken) means the full premise/story text for this specific
completed call is not recoverable from the server console log. Re-running Run A solely to capture
that text was judged not worth a second real paid call against an already-tight budget; the title,
scene structure, and duration variation above are the real, captured signal for this run. Every
run after this one in the same session prints the full premise/theme/ending verbatim (see Run B
below and the probe's extended output), so this gap does not recur going forward.

### Run B — Bangla script, 5 scenes, full scale (D-04) — BLOCKED, not completed

Three consecutive real attempts, identical Bangla-script input, all blocked:

| Attempt | Stage | `blockReason` / `finishReason` |
|---|---|---|
| 1 | `promptFeedback` (before any generation) | `PROHIBITED_CONTENT` |
| 2 (retry) | `promptFeedback` | `PROHIBITED_CONTENT` |
| 3 (second retry) | `promptFeedback` | `PROHIBITED_CONTENT` |

All three blocks fired at the **prompt-feedback** stage — before the model attempted any
generation at all — unlike Run A's single candidate-stage block. This is a materially different,
and more decisive, signal than Run A's transient-looking block: three identical requests, three
identical prompt-level refusals, zero variance. `checkCeiling`/`recordSpend` ran normally on every
attempt (all three appear in the ledger below); no image or video call was ever dispatched for
this run, because `generateSceneImagesAction`/`generateSceneVideoAction` structurally require a
successful, validated story first (the same D-03-style guard smoke-test.ts's own probes use) —
there was never a story to build scene images or a video from.

**This is a real, reproducible finding, not a bug in this plan's code.** The exact same idea,
same character description, same style/mood, succeeded in Banglish (Run A, after one retry) and
was refused three times running in native Bangla script. Two explanations are both plausible and
neither can be confirmed without further investigation this session did not spend budget on:
(a) the safety classifier reads native Bangla script more strictly than its romanized rendering
for this specific combination of words (a girl, alone, "lukiye lukiye"/secretly, handling an
inherited object) — genuinely interesting and useful information for Phase 3/4's prompt design;
or (b) three requests is still too small a sample to rule out a classifier false-positive rate
that happens to be much higher for this exact text than for Run A's Banglish rendering (RESEARCH.md
Pitfall 3's own citation of a real, closed-as-not-planned upstream RAI-block issue applies here
too). Per the plan's own instruction, this idea was **not** swapped for an easier one to force a
pass — the block is reported as-is.

**Consequence:** D-04's full-scale (5-6 scene) real proof-run could not be completed in this
session on this idea. This is carried forward — see §8.

## 3. Full-scale run details (D-04) — not obtained

Not applicable: Run B never produced a validated story, so there is no real scene count, no real
per-scene duration list, no real `finishReason: STOP`, and no real `usageMetadata` for a
successful 5-scene generation to report here. This section is intentionally left without invented
numbers, per the plan's own instruction not to make a criterion pass by changing the test or
fabricating a result.

## 4. Preview-tier model vs GA fallback (Assumption A1)

Every real call this plan made — Task 1's video call, Run A's two attempts, Run B's three
attempts — used the primary Preview-tier model (`gemini-3.1-pro-preview` for text,
`veo-3.1-lite-generate-preview` for video) with `fallbackUsed: false` throughout. The 403/404
fallback path in `src/providers/llm/gemini.ts` and `src/providers/image/gemini-image.ts` was never
exercised this plan (all three of Run B's failures were content-safety blocks, not
availability/auth errors, so the fallback logic — which only triggers on HTTP 403/404 — correctly
never fired).

## 5. Character consistency across five scene images (SCENE-02)

Not applicable this plan: Run B never reached image generation, so there are no five scene images
from this session to judge. 02-03-SUMMARY.md's own real 3-scene run (a different idea) already
recorded a positive finding on this exact question ("same tousled black hair, same brown patched
vest... across all three independently-generated scenes") — that finding stands as the project's
current real evidence for SCENE-02, unrepeated here rather than re-spent on.

## 6. Ledger — every paid call this phase, and remaining headroom

Full ledger as of this proof run (`node src/scripts/smoke-test.ts --report`, no network call made):

| Call | Model | Estimated USD | Billed / outcome |
|---|---|---|---|
| generic-image | gemini-3.1-flash-image | $0.0670 | Phase 1 |
| generic-image | gemini-3.1-flash-image | $0.0670 | Phase 1 |
| generic-video | veo-3.1-lite-generate-preview | $0.2000 | Phase 1 |
| childscene-image | gemini-3.1-flash-image | $0.0670 | Phase 1 |
| childscene-video | veo-3.1-lite-generate-preview | $0.4000 | Phase 1 |
| childscene-conservative-video | veo-3.1-lite-generate-preview | $0.4000 | Quick task 260912-j3x |
| story:3-scene | gemini-3.1-pro-preview | $0.0500 | 02-02 |
| story:5-scene | gemini-3.1-pro-preview | $0.0500 | 02-02 |
| story:3-scene | gemini-3.1-pro-preview | $0.0500 | 02-03 (blocked attempt) |
| story:3-scene | gemini-3.1-pro-preview | $0.0500 | 02-03 (retry, succeeded) |
| scene-image:...:1 | gemini-3.1-flash-image | $0.0670 | 02-03 |
| scene-image:...:2 | gemini-3.1-flash-image | $0.0670 | 02-03 |
| scene-image:...:3 | gemini-3.1-flash-image | $0.0670 | 02-03 |
| **scene-video:story-...npep3b:1** | veo-3.1-lite-generate-preview | **$0.4000** | **02-04 Task 1 (real, 8s, ok=true)** |
| **story:3-scene** | gemini-3.1-pro-preview | **$0.0500** | **02-04 Task 2 Run A, attempt 1 (blocked)** |
| **story:3-scene** | gemini-3.1-pro-preview | **$0.0500** | **02-04 Task 2 Run A, attempt 2 (succeeded)** |
| **story:5-scene** | gemini-3.1-pro-preview | **$0.0500** | **02-04 Task 2 Run B, attempt 1 (blocked)** |
| **story:5-scene** | gemini-3.1-pro-preview | **$0.0500** | **02-04 Task 2 Run B, attempt 2 (blocked)** |
| **story:5-scene** | gemini-3.1-pro-preview | **$0.0500** | **02-04 Task 2 Run B, attempt 3 (blocked)** |

**TOTAL LEDGER: $2.2520**
**REMAINING HEADROOM: $0.7480 of $3.00 ceiling**

Plan 02-04's own spend: $2.2520 − $1.6020 (ledger at the start of this plan) = **$0.6500**, against
a planned ~$0.94 for the plan. The plan's total dollar spend landed *under* its own estimate
overall — the money that would have gone to Run B's images ($0.335) and 6-second video ($0.30)
was never spent, because Run B never produced a valid story to spend it on. Task 1 alone spent
$0.20 more than its own line-item estimate (see the plan's SUMMARY.md Deviations section for why).

## 7. Every validator/zod/provider block this session, verbatim

- Run A, attempt 1: `candidate: PROHIBITED_CONTENT` (Gemini `candidates[0].finishReason`, no text
  returned)
- Run B, attempt 1: `prompt: PROHIBITED_CONTENT` (Gemini `promptFeedback.blockReason`, before any
  generation)
- Run B, attempt 2: `prompt: PROHIBITED_CONTENT` (identical)
- Run B, attempt 3: `prompt: PROHIBITED_CONTENT` (identical)
- No zod `.safeParse()` failures occurred this session (every non-blocked response matched
  `StoryDirectorOutputSchema`).
- No `validateScenePlan` failures occurred this session (Run A's successful attempt numbered its
  3 scenes 1..3 with no gaps/duplicates).

## 8. Carried forward — not fixed here

- **D-04's full-scale (5-6 scene) real proof run is unmet.** Run B was blocked three times on this
  session's chosen Bangla-script idea. This needs either: a fresh attempt with a different idea (a
  new real paid call, needing explicit approval given this plan's budget is already committed) or
  a deliberate investigation into whether specific Bangla-script phrasing (the "secretly" framing,
  or something else in this specific text) reproducibly trips the safety classifier — genuinely
  useful information for Phase 3/4's prompt design regardless of which explanation is correct.
- **The Bangla-script-vs-Banglish safety-block asymmetry itself is a new, real finding** this
  session did not anticipate: the *same idea* triggered a safety block in native Bangla script on
  3/3 attempts but only 1/2 in Banglish, the opposite direction from RESEARCH.md's own
  hypothesized risk (that Banglish might read *worse*). This is worth flagging to whoever designs
  Phase 3/4's content-safety handling — it should not be assumed that Bangla script is always the
  "safer" or "higher-quality" choice for the safety classifier specifically.
- **Task 1's video call cost $0.40, not the ~$0.20 planned**, because the video-only probe mode
  (`--story-id`/`--video`, with no persisted scene data available since story.json persistence is
  Phase 3's job) had no real duration to resolve from and defaulted to 8 seconds. See the plan's
  SUMMARY.md Deviations section.
- **Run A's premise/theme/ending text was not captured** for the reasons in §2 above — every
  subsequent run captures it via the now-extended `story-probe.ts` print statements.
- Carried over from 02-03-SUMMARY.md, still unresolved: `npm run lint` cannot run in this
  environment (`typescript-eslint@8.70.0` rejects this project's TypeScript `7.0.2`); the full
  interactive three-screen browser walk-through (create → review story → review images → generate
  video) is still owed as a human/coordinator-driven UAT step, now including the new video screen
  this plan added.
