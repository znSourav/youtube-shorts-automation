# Phase 6: Reliability, Secrets Hygiene & Output Correctness - Research

**Researched:** 2026-09-20
**Domain:** Provider-failure UX differentiation, fail-safe secrets configuration in Next.js Server Actions, MP4 container validation without ffmpeg, SQLite-backed reliability bookkeeping (Prisma/better-sqlite3)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Provider-failure messaging (RELIABILITY-01)**
- **D-01:** The message she sees differs by failure type, not one generic "something went wrong" for everything: a timeout/technical glitch gets a "try again" framing, a content block gets a "try rephrasing your idea" framing, and the existing budget/retry-cap-reached messages stay exactly as they are today. All still calm, plain-language, with no raw provider text, model IDs, or file paths — matching the convention established in Phases 2-5.
- **D-02:** A technical-glitch failure (timeout, malformed response) consumes one of the scene's limited retry attempts, exactly the same as a content-block failure — no special-casing by cause. Keeps Phase 4's existing per-scene retry-cap counter unchanged; the cap's job is "stop an accidental click-loop from burning money," which applies regardless of why a given attempt failed.

**Missing API key at startup (STARTUP-02)**
- **D-03:** If the API key is missing, the app starts normally and reaches the ordinary create screen — no dedicated setup screen, no blank page, no crash. She only sees an explanation the moment she takes an action that actually needs the key (e.g. clicking "Create Story"), in place of the usual result — mirroring how a budget refusal already surfaces today.
- **D-04:** The missing-key state is not a persistent banner shown from the moment the app opens. It appears only when and where she hits it, not as a second always-visible UI element alongside the budget indicator.

**Corrupted output file recovery (OUTPUT-02)**
- **D-05:** If a saved video/image file turns out to be invalid (not genuinely the asset it claims to be), retrying it does **not** consume one of her limited per-scene retry attempts. Rationale: a corrupted save is a bug in this app's own write/download step, not a failed creative attempt — the provider most likely did its job. This is a deliberate asymmetry against D-02 (technical *generation* failures count; local *save-integrity* failures do not) — genuinely different categories, not an inconsistency.
- **Noted, not asked (technical constraint, not a choice):** recovering a corrupted file will still almost certainly cost a fresh paid generation — this codebase has no mechanism to re-fetch a provider result after the fact, so "free of retry-cap" spares her attempt count but not her real monthly budget. **Confirmed by this research** (see Architecture Patterns, Pattern 4): `dispatchSceneVideo` discards the `GenerateVideosOperation` object after `ai.files.download()` returns; nothing persists an operation name or a re-download handle across requests, so a corruption-triggered retry is a brand-new `generateVideos()` call, billed exactly like a normal retry.

### Claude's Discretion
- **When file validity gets checked** (immediately on save vs. lazily when she opens/uses it): this research recommends **at save time**, integrated into the existing byte-read that already happens for the data-URL response (see Pattern 4) — zero extra disk I/O, catches the problem before "ready" is ever shown.
- The exact plain-language copy for each differentiated failure message (D-01), the missing-key explanation text (D-03), and the corrupted-file recovery phrasing (D-05) are left to planning/UI-design, following the calm, plain-language convention already established (see Code Examples for the existing precedent this phase should mirror, not invent).
- **Technical-debt items named "Phase 6's job" in prior reviews:**
  1. `generate-images.ts`/`director.ts`'s "unprotected `recordSpend` call" (Phase 4 code review pass 5) — **this research finds the item is now moot.** Phase 5 (plans 05-03/05-04) removed every call to the dev-only file ledger's `recordSpend` from both files entirely; both now write through `recordGeneration`/`recordGenerationAtDispatch` (`src/core/persistence/generation-repository.ts`), which are BEST-EFFORT BY CONTRACT (try/catch, log, never throw) by design. There is nothing left to protect. The planner should note this as "closed by Phase 5, no action needed" rather than re-opening it.
  2. The stuck-generation detector's client-only clock (Phase 4 code review pass 6) — **confirmed live and unfixed.** See Architecture Patterns, Pattern 5.
- **Phase 5's review flagged one more, explicitly in scope for reliability:** the shared `serializeDispatch` queue (`src/core/budget/dispatch-chain.ts`) has no per-call timeout (05-REVIEW.md WR-01). **This research confirms the gap is real and broader than the review speculated** — see Architecture Patterns, Pattern 6 and Common Pitfalls, Pitfall 3.
- **`log-response.ts`'s `isSecretKey()` over-redaction fix mechanism** — this research provides a concrete, verified fix; see Code Examples.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. No scope-creep topics came up.

**Additionally out of scope per this research** (found during investigation, not re-surfaced by CONTEXT.md's discuss-phase session, and not covered by this phase's 4 success criteria): 05-REVIEW.md's **WR-02** (historical-import's greedy-match risk — a one-time, already-executed migration; the review itself says "no live risk to close today") and **WR-04** (hardcoded worst-case video price duplicated in `get-story-status.ts`/`budget-probe.ts` — a budget-accuracy nit, not a reliability/secrets/output-correctness concern). Both were formally "deferred to Phase 6" by the review's own bucket, but CONTEXT.md's discuss-phase session did not carry them forward as decisions, and neither maps to any of this phase's 4 success criteria. Flagged here so the planner can make a conscious in/out call rather than silently drop or silently absorb them.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RELIABILITY-01 | A provider failure (error, timeout, rate limit, malformed response) is caught, shown in plain language, and leaves the affected scene in a clearly failed-but-retryable state without corrupting other scenes' data | Architecture Patterns 1-2 (existing gated-dispatch/best-effort-write patterns already satisfy "no corruption"); Common Pitfalls 1, 3; Code Examples 1-2 show the exact classification fields (`stage`, `blockReason`, `timedOut`) each provider already returns, which D-01's differentiated messaging must branch on |
| SECURITY-01 | API keys live only in server-side config, never reach client JS, logs, or story metadata; `.env.local` gitignored, only a placeholder `.env.local.example` committed | Architecture Patterns 3 (already structurally enforced by `check-boundaries.ts` invariant 1 + no `NEXT_PUBLIC_` vars); Code Examples 3 (verified `isSecretKey` fix); confirmed via `git check-ignore -v .env.local` and `git ls-files \| grep env` |
| STARTUP-02 | Missing API key: app still starts, explains what's missing in plain language, never crashes, never exposes secret values | Common Pitfalls 2 (verified: `new GoogleGenAI({})` never throws on a missing key — the SDK only `console.warn`s); Architecture Patterns 3 (pre-flight check pattern, mirroring `BudgetExceededError`) |
| OUTPUT-02 | Every saved video file is a valid, non-empty, playable MP4 at approximately the requested duration and 9:16 dimensions; never a mislabeled text/image file | Architecture Patterns 4 (verified against a real Veo-generated file on this machine — exact working code, exact field names); Package Legitimacy Audit (`mp4box`); Common Pitfalls 4 |

</phase_requirements>

## Summary

This phase closes four structural gaps in an already-working pipeline (Phases 1-5 are complete and the app already generates real, paid stories/images/videos end to end). None of the four requirements need new infrastructure — no new framework, no ffmpeg, no external service. Three of the four (RELIABILITY-01, SECURITY-01, STARTUP-02) are refinements of patterns the codebase has already established correctly in some places and applied inconsistently in others; the fourth (OUTPUT-02) needs exactly one new, small, zero-dependency-adjacent npm package (`mp4box`) whose behavior against this project's own real generated MP4 was verified directly in this research session, not assumed.

The most consequential finding is that **the missing-API-key path (STARTUP-02) is already structurally safe** — `new GoogleGenAI({})` (the `@google/genai` SDK) never throws when `GEMINI_API_KEY` is absent; it only prints a `console.warn`. Nothing in this codebase constructs a provider client at module load time (all four construction sites are inside function bodies, called lazily per-request), so the app already starts fine with no key configured. The real work is adding a fast, explicit **pre-flight check** (mirroring the existing `BudgetExceededError`/`checkBudget` pattern already proven at all four gated dispatch points) so a missing key produces an immediate, specific, plain-language message — instead of letting the request fall through to Google's ADC (Application Default Credentials) lookup, which is slow and produces a generic, unhelpful error.

The second most consequential finding is that **`gemini-image.ts` already implements exactly the D-01 differentiated-messaging pattern** RELIABILITY-01 asks for (a `stage: "prompt" | "candidate"` discriminator mapping to "try a different description" vs. "please try again"). `gemini.ts` (the Story Director) has the discriminator (`stage: "prompt" | "candidate" | "parse"`) but only special-cases `MAX_TOKENS`, not the full stage split. `veo.ts` (video) has no discriminator at all — `blocked` is a single flat boolean covering three genuinely different causes (a technical operation error, a genuine content-safety classification, and an ambiguous "no video in response"). The planner's job is to extend `veo.ts`'s and `gemini.ts`'s classification to match the pattern `gemini-image.ts` already proves works, not invent a new one.

For OUTPUT-02, this research went further than reading docs: it downloaded the `mp4box` npm package, ran it against a real Veo-generated MP4 already on disk in this repository (`storage/stories/story-1789237907876-npep3b/scenes/01/video.mp4`, from a genuine paid Phase 2 call), and confirmed it correctly reports `duration: 8000`/`timescale: 1000` (8.0s, matching the story's own recorded duration and STATE.md's note) and `track_width: 720`/`track_height: 1280` (exactly 9:16). It was also tested against three failure shapes: an empty buffer, a plain-text buffer, and a real JPEG mislabeled as MP4 — none of them fire `onReady`, and the JPEG case additionally logs an `onError`. The validation wrapper must check for `onReady` never firing (not `onError` firing), since garbage input does not reliably error.

**Primary recommendation:** Add one small pre-flight helper (`assertApiKeyConfigured`, mirroring `BudgetExceededError`) called at the top of all four gated dispatch functions; extend `veo.ts`'s and `gemini.ts`'s block classification to a `stage`/`kind` discriminator matching `gemini-image.ts`'s existing pattern, and branch each Server Action's message on it; add `httpOptions: { timeout: N }` to all four provider call sites to close the confirmed-unbounded-hang gap in `serializeDispatch`; and add an `mp4box`-based validation step reusing the video-byte buffer `generate-video.ts` already reads into memory for the data-URL response, gated by a new Scene-level flag that lets a corruption-triggered retry skip the attempt-cap increment (D-05).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Differentiated provider-failure messaging (D-01) | API/Backend (Server Actions + core providers) | Browser (renders the returned plain-language string verbatim) | Classification of *why* a call failed must happen where the raw provider response lives (server); the browser only ever receives an already-safe string, exactly as every existing failure path already works |
| Missing-API-key detection (D-03/D-04) | API/Backend (pre-flight check inside each gated dispatch function) | Browser (renders the returned message in place of the normal result) | `GEMINI_API_KEY` must never reach the browser; the check has to run server-side, at the same point `checkBudget` already runs, per the existing gated-dispatch architecture |
| Secrets never reaching client bundle (SECURITY-01) | API/Backend (env var reads confined to provider files + `check-boundaries.ts` build-time gate) | — | Already structurally enforced: `check-boundaries.ts` invariant 1 forbids any `"use client"` file from importing a provider module; no `NEXT_PUBLIC_`-prefixed var exists anywhere in `src/` |
| MP4 validity check (OUTPUT-02) | API/Backend (`generate-video.ts`, right after the existing post-download byte read) | Database/Storage (Scene row's status/flag reflects the outcome) | The only place the real video bytes exist server-side before being base64-encoded for the browser; validating anywhere else means a second disk read or trusting an already-serialized value |
| Free-retry bookkeeping for corrupted saves (D-05) | Database/Storage (new Scene column/flag) | API/Backend (`gates.ts` reads the flag to bypass the cap gate once) | The cap-bypass decision must survive a page reload (she may not retry immediately), so it cannot live in browser state; it has to be a persisted, server-read flag exactly like `videoAttempts` itself |

## Standard Stack

### Core

No new core framework/runtime dependency. This phase is entirely code/config changes against the existing Next.js 16 + Prisma 7 + `@google/genai` 2.22.0 stack already in `package.json`.

### Supporting

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `mp4box` | 2.4.1 (verified installed-and-working, npm registry, published 2026-06-19) | Parses an MP4 file's ISOBMFF box structure (moov/mvhd/tkhd) to extract real duration and video-track width/height, with zero dependencies | Maintained by GPAC (the reference-implementation authors of the MP4Box CLI tool and the MP4 spec's own steering group); 336,673 weekly downloads; no `postinstall` script; BSD-3-Clause license. **Empirically verified in this session** against a real Veo-generated file on this machine — not chosen from documentation alone |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `mp4box` (full ISOBMFF box parser) | Hand-rolled box walker reading only `ftyp`/`mvhd`/`tkhd` fixed-offset fields | Rejected: MP4 box parsing has real edge cases this project has no reason to special-case correctly (mvhd version 0 vs. 1 → 32-bit vs. 64-bit fields, box size=0/size=1 64-bit-extended-size forms, `moov` appearing after `mdat` in some encoders). `mp4box` already handles all of this and was proven to work first-try against the real Veo output; a hand-rolled parser is exactly the "deceptively complex, has edge cases" case this project's own "Don't Hand-Roll" convention exists for |
| `mp4box` | ffmpeg/ffprobe (`fluent-ffmpeg`, `get-video-duration`) | **Explicitly out of scope** — REQUIREMENTS.md's Out of Scope table lists "ffmpeg / in-app audio stripping" as excluded ("Veo's MP4 passes through as-is"). Pulling in ffmpeg purely for validation would add a large native-binary dependency this project has already deliberately avoided |
| `mp4box` | A bare magic-byte (`ftyp`) check only, no duration/dimension check | Rejected as the *sole* check: catches "wrong file type entirely" (a text/JSON error body, a mislabeled image) but not "genuinely an MP4, wrong duration/dimensions" (e.g. a truncated download, a 0-duration clip). OUTPUT-02's success criterion explicitly names "approximately the requested duration and 9:16 dimensions," which a magic-byte check alone cannot verify. Recommended as a **cheap first-pass filter before** the full `mp4box` parse, not a replacement for it |

**Installation:**
```bash
npm install mp4box
```

**Version verification:** `npm view mp4box version` → `2.4.1`, published `2026-06-19T16:45:07.140Z` (verified live against the npm registry in this session, not from training data).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|--------------|---------|-------------|
| `mp4box` | npm | published 2026-06-19 (this major version; the GPAC project itself dates back over a decade) | 336,673/week | `github.com/gpac/mp4box.js` | OK | Approved — `gsd-tools query package-legitimacy check` returned `OK`, zero reasons flagged; `npm view mp4box scripts.postinstall` returned empty (no postinstall script) |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none.

No other new packages are needed for this phase — the pre-flight API-key check, the differentiated-message classification, the dispatch-queue timeout, and the stuck-generation server timestamp are all pure application code against already-installed dependencies (`@google/genai`, `prisma`).

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────────┐
                         │  Browser (React client component, page.tsx) │
                         │  - renders whatever plain-language `message`│
                         │    a Server Action returns, verbatim        │
                         │  - NEVER sees a stack trace, model id,      │
                         │    file path, or secret value               │
                         └───────────────────┬───────────────────────--┘
                                              │ calls a Server Action
                                              ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │  Server Action (src/app/actions/*.ts, "use server")                 │
   │                                                                     │
   │   1. assertApiKeyConfigured()  ──► throws MissingApiKeyError        │  NEW (STARTUP-02)
   │        (sync, zero I/O, checked BEFORE any DB/network call)         │
   │   2. checkBudget(estimatedUsd) ──► throws BudgetExceededError       │  existing (Phase 5)
   │        (async, one DB round-trip)                                  │
   │   3. real provider call (generateStory/generateImage/generateVideo)│
   │        └─ classifies response BEFORE trusting any field             │
   │           (stage: "prompt"|"candidate"|"parse", or blocked kind)    │  D-01 extension
   │   4. on success: write asset to disk, THEN validate it              │  NEW (OUTPUT-02,
   │        (mp4box for video)                                          │  video only)
   │   5. write Scene/GenerationRecord row (best-effort, never throws)   │  existing
   │                                                                     │
   │   Every one of steps 1-4's failure branches maps to exactly one    │
   │   plain-language sentence, chosen by the FAILURE'S OWN TYPE         │
   │   (D-01), never a raw provider string                              │
   └───────────────────────────────────┬─────────────────────────────--─┘
                                        │ (server-only import boundary,
                                        │  enforced by check-boundaries.ts
                                        │  invariant 1 — no client file may
                                        │  import a provider module)
                                        ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │  Provider modules (src/providers/*)                                 │
   │  - new GoogleGenAI({}) reads GEMINI_API_KEY from process.env         │
   │    internally; never throws if absent (only console.warn)           │
   │  - each call site gets an explicit httpOptions.timeout               │  NEW (WR-01 fix)
   └─────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

No new top-level directories. New files slot into the existing layout:

```
src/
├── core/
│   ├── config/
│   │   └── provider-key.ts        # NEW: assertApiKeyConfigured() + MissingApiKeyError
│   ├── output/
│   │   ├── episode-export.ts      # existing, unchanged
│   │   └── mp4-validation.ts      # NEW: validateMp4Buffer() using mp4box
│   ├── budget/
│   │   └── dispatch-chain.ts      # existing, extend doc comment re: per-call timeouts
│   ├── approval/
│   │   └── gates.ts               # existing, extend evaluateVideoDispatch for D-05 free-retry bypass
│   └── persistence/
│       └── generation-repository.ts  # existing, extend with a "clear corruption flag" write
├── providers/
│   ├── llm/gemini.ts              # extend StoryBlockClassification differentiation + httpOptions.timeout
│   ├── image/gemini-image.ts      # add httpOptions.timeout (classification pattern already correct)
│   └── video/veo.ts               # add a block-kind discriminator + httpOptions.timeout
└── lib/
    └── log-response.ts            # fix isSecretKey() over-redaction
```

### Pattern 1: Gated dispatch with a synchronous pre-flight check (extend for missing API key)

**What:** Every paid call already goes through exactly one function per asset type (`runStoryDirector`, `compareViaLlm`, `generateSceneImagesAction`, `dispatchSceneVideo`), and `check-boundaries.ts` invariant 7 structurally enforces that only 7 named files may import `core/budget/` at all. `checkBudget` already throws a typed error (`BudgetExceededError`) that each Server Action catches and maps to one fixed sentence.

**When to use:** STARTUP-02's missing-key check belongs at the exact same point, checked *before* `checkBudget` (it's synchronous and free — no reason to pay a DB round-trip first if the key is obviously missing).

**Verified: `new GoogleGenAI({})` never throws on a missing key.** Read directly from the installed SDK (`node_modules/@google/genai/dist/node/index.cjs:26251-26259`):
```js
const envApiKey = getApiKeyFromEnv();          // reads GOOGLE_API_KEY, falls back to GEMINI_API_KEY
this.apiKey = options.apiKey ?? envApiKey;
if (!this.vertexai && !this.apiKey) {
  console.warn('API key should be set when using the Gemini API.');   // <-- only a warning
}
```
The actual failure only happens deep inside the first real network call, when `NodeAuth.addAuthHeaders` falls through to Google's Application Default Credentials lookup (`google-auth-library`), which is slow (a metadata-server probe/timeout on a non-GCP machine) and throws a generic, unhelpful error — currently swallowed by each Server Action's generic catch-all ("A network or server problem prevented..."), which is truthful but does not "clearly explain what's missing" per STARTUP-02.

**Example (new file, `src/core/config/provider-key.ts`):**
```typescript
// Mirrors BudgetExceededError's exact shape (src/core/budget/ledger.ts) so
// every Server Action's existing catch-and-map pattern extends with one
// more `instanceof` branch instead of a new control-flow shape.
export class MissingApiKeyError extends Error {
  constructor(message?: string) {
    super(message ?? "GEMINI_API_KEY is not configured.");
    this.name = "MissingApiKeyError";
  }
}

// Mirrors the SDK's own precedence (GOOGLE_API_KEY, then GEMINI_API_KEY --
// verified in node_modules/@google/genai/dist/node/index.cjs:26349-26356)
// so this check can never be stricter than what the SDK itself would
// actually accept.
export function assertApiKeyConfigured(
  env: Record<string, string | undefined> = process.env,
): void {
  const key = env.GOOGLE_API_KEY?.trim() || env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new MissingApiKeyError();
  }
}
```
Called as the first line inside `runStoryDirector`, `compareViaLlm`, `generateSceneImagesAction`'s per-scene loop, and `dispatchSceneVideo` — the same four functions `05-RESEARCH.md`/`check-boundaries.ts` invariant 7 already enumerates as the real budget-gated touch sites. Each Server Action's existing `catch` block gets one more branch:
```typescript
} catch (err) {
  if (err instanceof MissingApiKeyError) {
    return { ok: false, error: "This app isn't fully set up yet — an API key is missing. Ask whoever installed it to check the setup steps." };
  }
  if (err instanceof BudgetExceededError) { /* existing, unchanged */ }
  // existing generic fallback, unchanged
}
```

### Pattern 2: Differentiated block classification (extend D-01 across all three providers)

**What:** `gemini-image.ts` already implements the exact shape D-01 asks for. Read directly from the installed codebase:

```typescript
// src/providers/image/gemini-image.ts:79-87 -- ALREADY CORRECT, mirror this
function plainLanguageBlockMessage(block?: ImageBlockClassification): string {
  if (!block) {
    return "The image could not be generated for an unknown reason. Please try again.";
  }
  if (block.stage === "prompt") {
    return "The image request was blocked before generation started. Please try a different description.";
  }
  return "The image generation did not return a usable image. Please try again.";
}
```
`stage: "prompt"` is set only when `response.promptFeedback?.blockReason` is present — a genuine content-safety classification *before* generation ran. `stage: "candidate"` covers every other non-success shape (a non-STOP `finishReason`, or no image bytes at all) — these are ambiguous-to-technical, and correctly get the "try again" framing, not the "rephrase" framing.

**Gap 1 — `gemini.ts` (Story Director):** `classifyStoryResponse` already computes the identical `stage: "prompt" | "candidate" | "parse"` discriminator (`src/providers/llm/gemini.ts:87-161`), but `create-story.ts`'s consumption of it collapses every non-`MAX_TOKENS` block into one message ("blocked by the model. Please try a different idea or wording.") — including `stage: "parse"` (a JSON parse failure — genuinely technical) and `stage: "candidate"` reasons other than `MAX_TOKENS` (e.g. `NO_TEXT_IN_RESPONSE`, also technical). **Fix:** branch on `result.blockReason`/the underlying `block.stage` the same way `gemini-image.ts` does — `stage: "prompt"` → rephrase framing; `stage: "candidate"`/`"parse"` (including the existing `MAX_TOKENS` special case) → try-again framing.

**Gap 2 — `veo.ts` (video), the larger gap:** `GenerateVideoResult.blocked` is a single flat boolean set `true` in three genuinely different branches, with no discriminator field at all (`src/providers/video/veo.ts:82-113`):
```typescript
if (operation.error) { /* technical: the operation itself errored */ blocked: true, blockReason: `operation error: ...` }
if (raiCount && raiCount > 0) { /* genuine content-safety classification */ blocked: true, blockReason: raiReasons.join("; ") }
if (!generatedVideo?.video) { /* ambiguous/technical: malformed response */ blocked: true, blockReason: "NO_VIDEO_IN_RESPONSE" }
```
Only the middle branch (`raiMediaFilteredCount > 0`) is a genuine content-policy block; the other two are technical. `generate-video.ts` currently folds all three into one message: `"The video could not be generated. Please try again."` (which happens to already be the *correct* try-again framing for two of the three cases, but is wrong for the middle one — a genuine RAI content block should get the rephrase framing per D-01).

**Recommended fix — add a `blockKind` discriminator to `GenerateVideoResult`, mirroring the other two providers' `stage` field:**
```typescript
export type VideoBlockKind = "content" | "technical";

// in generateVideo(), replace the three bare `blocked: true` returns with:
if (operation.error) {
  return { ..., blocked: true, blockKind: "technical", blockReason: `operation error: ${JSON.stringify(operation.error)}` };
}
if (raiCount && raiCount > 0) {
  return { ..., blocked: true, blockKind: "content", blockReason: (raiReasons ?? []).join("; ") || "..." };
}
if (!generatedVideo?.video) {
  return { ..., blocked: true, blockKind: "technical", blockReason: "NO_VIDEO_IN_RESPONSE" };
}
```
Then `generate-video.ts`'s message selection:
```typescript
const message = result.blockKind === "content"
  ? "This scene's video couldn't be generated from that image or motion description. Try a different scene idea."
  : "The video could not be generated. Please try again.";
```

**D-02 confirmation (no code change needed):** in every branch above, `incrementVideoAttempt`/`incrementImageAttempt` is called unconditionally before the real dispatch, regardless of which failure type eventually occurs — this already matches "no special-casing by cause" for the retry-cap counter. Only the *message* needs to differentiate, never the cap logic.

### Pattern 3: Secrets never reach the client (already structurally enforced — verify, don't rebuild)

**What:** `check-boundaries.ts` invariant 1 (`src/scripts/check-boundaries.ts:178-228`) already fails the build if any `"use client"` file imports `/providers/`, `spend-ledger`, `@prisma/client`, `/generated/prisma`, `lib/db`, `core/persistence`, or `core/budget`. Confirmed via `grep -rn "process.env" src/` that no `NEXT_PUBLIC_`-prefixed variable exists anywhere in `src/`, and `next.config.ts` has no `env:` key exposing anything to the client bundle. `.env.local` is confirmed gitignored (`git check-ignore -v .env.local` → matched at `.gitignore:2`) and only `.env.local.example` (placeholder-filled, `GEMINI_API_KEY=your-api-key-here`) is tracked (`git ls-files | grep env`).

**When to use:** This part of SECURITY-01 needs no new code — only (a) the `log-response.ts` redaction fix (Code Examples, below) and (b) running `npm run test:lib` (which already runs `check-boundaries.ts` as its final step) as this phase's own regression gate, since any new code this phase adds (the pre-flight key check, the mp4box validation) must not accidentally create a new client-importable path to a provider or secret.

**Never write a raw provider response, prompt, or usage-metadata blob into a `GenerationRecord.message` field** — this constraint already exists (`generation-repository.ts`'s own doc comment) and directly serves "never appear in ... generated story metadata." No violation found in the current codebase; carry the constraint forward for every new write this phase adds.

### Pattern 4: MP4 validation, reusing the existing post-download byte read

**What:** `generate-video.ts` already reads the entire generated video into memory immediately after `ai.files.download()` succeeds, to build the browser-facing `data:` URL:
```typescript
// src/app/actions/generate-video.ts:313-316 -- EXISTING code, the integration point
let videoDataUrl: string | null = null;
try {
  const videoBytes = readFileSync(result.filePath);
  videoDataUrl = `data:video/mp4;base64,${videoBytes.toString("base64")}`;
```
The OUTPUT-02 validation slots in immediately after this read succeeds and before `updateSceneVideo(..., SceneAssetStatus.READY)` is called — reusing `videoBytes`, no second disk read.

**Verified working code** (run against `storage/stories/story-1789237907876-npep3b/scenes/01/video.mp4`, a real 1,559,179-byte Veo-generated file already on disk in this repo from a genuine Phase 2 paid call):
```typescript
// src/core/output/mp4-validation.ts (NEW)
import * as MP4Box from "mp4box";

export interface Mp4ValidationResult {
  valid: boolean;
  reason?: string;
  actualDurationSeconds?: number;
  actualWidth?: number;
  actualHeight?: number;
}

const MIN_PLAUSIBLE_BYTES = 10_000; // a genuine multi-second 720p clip is always far larger than this

export function validateMp4Buffer(
  bytes: Buffer,
  expected: { durationSeconds: number; toleranceSeconds?: number },
): Mp4ValidationResult {
  if (bytes.length === 0) {
    return { valid: false, reason: "empty file" };
  }
  if (bytes.length < MIN_PLAUSIBLE_BYTES) {
    return { valid: false, reason: `implausibly small (${bytes.length} bytes)` };
  }
  // Cheap magic-byte pre-filter: bytes 4-8 spell "ftyp" in every valid MP4/
  // ISOBMFF file (verified against the real Veo file: first 12 bytes were
  // 00 00 00 20 'f' 't' 'y' 'p' 'i' 's' 'o' 'm'). Catches a JSON error body
  // or a mislabeled image (a JPEG's first 4 bytes are FF D8 FF E0) before
  // paying for a full box parse.
  if (bytes.subarray(4, 8).toString("ascii") !== "ftyp") {
    return { valid: false, reason: "missing MP4 ftyp signature -- not a genuine MP4 container" };
  }

  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as MP4Box.MP4ArrayBuffer;
  arrayBuffer.fileStart = 0;

  const mp4boxfile = MP4Box.createFile();
  let info: MP4Box.MP4Info | null = null;
  mp4boxfile.onReady = (i) => { info = i; };
  // onError does NOT reliably fire for garbage input (verified empirically:
  // an empty buffer and a plain-text buffer fire neither onReady nor
  // onError; only a well-formed-but-wrong container, like a real JPEG,
  // fires onError). The only trustworthy signal is whether onReady fired.
  mp4boxfile.onError = () => { /* no-op -- `info === null` below is the real check */ };

  try {
    mp4boxfile.appendBuffer(arrayBuffer);
    mp4boxfile.flush();
  } catch {
    return { valid: false, reason: "malformed MP4 container" };
  }

  if (info === null) {
    return { valid: false, reason: "not a parseable MP4 (no moov box found)" };
  }

  const videoTrack = info.tracks.find((t) => t.video !== undefined);
  const actualWidth = videoTrack?.track_width;
  const actualHeight = videoTrack?.track_height;
  const actualDurationSeconds = info.duration / info.timescale;

  const tolerance = expected.toleranceSeconds ?? 1;
  if (Math.abs(actualDurationSeconds - expected.durationSeconds) > tolerance) {
    return { valid: false, reason: `duration ${actualDurationSeconds}s does not match expected ${expected.durationSeconds}s`, actualDurationSeconds, actualWidth, actualHeight };
  }

  // 9:16 is the only aspect ratio this app ever requests (veo.ts always
  // passes aspectRatio: "9:16") -- exact-ratio check via cross-multiplication
  // avoids floating-point division error.
  if (actualWidth && actualHeight && actualWidth * 16 !== actualHeight * 9) {
    return { valid: false, reason: `dimensions ${actualWidth}x${actualHeight} are not 9:16`, actualDurationSeconds, actualWidth, actualHeight };
  }

  return { valid: true, actualDurationSeconds, actualWidth, actualHeight };
}
```

**Confirmed against the real file** (this session, `node -e` against the installed `mp4box` package, not simulated):
```
file size: 1559179 bytes
first 12 bytes: 00 00 00 20 66 74 79 70 69 73 6f 6d  (".. ftypisom")
onReady fired synchronously inside appendBuffer() (no async wait needed --
  the whole file was delivered in one chunk, so the moov box was fully present)
info.duration = 8000, info.timescale = 1000  →  8.0s  (matches STATE.md's
  recorded note for this exact file: "8s, ftyp-verified")
tracks[0].track_width = 720, tracks[0].track_height = 1280  →  exactly 9:16
```
**Confirmed negative cases** (same session): an empty `Buffer`, a plain-text `Buffer`, and a real JPEG (`image.jpg` from the same story) mislabeled as MP4 were all fed through the identical code path. None fired `onReady`. The JPEG additionally logged `[BoxParser] Invalid box type: ' JF'` and fired `onError` (the other two fired neither) — confirming the validation function must key off "`onReady` never fired," not "`onError` fired," since garbage input does not reliably error.

### Pattern 5: Server-anchored "generating since" timestamp (closes the stuck-detector's client-clock bug)

**What:** The 12-minute stuck-generation detector currently lives entirely in browser state — `src/app/page.tsx:135` (`generatingStartedAtRef = useRef<Record<number, number>>({})`, set to `Date.now()` at line 533, compared against `STUCK_AFTER_MS` at line 636). A page reload creates a fresh `useRef`, silently resetting the countdown to zero even for a scene that has been stuck for far longer than 12 minutes — confirmed live in `src/app/page.tsx` and `src/components/story/VideoStatusScreen.tsx` (the `stuck` prop is computed client-side and passed straight through with no server counterpart).

**Fix requires a schema migration:** add a `videoGeneratingSince DateTime?` column to `Scene` (mirrors the existing `imagePath`/`videoPath` nullable-until-set convention). Write it in the same place `updateSceneVideo(..., SceneAssetStatus.GENERATING)` already runs (`generate-video.ts:203`), clear it (`null`) whenever the status leaves `GENERATING` (READY or FAILED). `getStoryStatusAction` (`src/app/actions/get-story-status.ts`) computes `stuck` server-side:
```typescript
const stuck = scene.videoStatus === "GENERATING"
  && scene.videoGeneratingSince !== null
  && Date.now() - scene.videoGeneratingSince.getTime() > STUCK_AFTER_MS;
```
and returns it as a new field on `SceneVideoStatusRow`; `page.tsx`/`VideoStatusScreen.tsx` consume `row.stuck` instead of the local ref. `STUCK_AFTER_MS` (already exported from `VideoStatusScreen.tsx`) stays the single source of truth for the threshold value — only where the elapsed-time comparison happens moves server-side.

```bash
npx prisma migrate dev --name phase6_video_generating_since
```

### Pattern 6: Bounded per-call HTTP timeout (closes the confirmed unbounded-hang gap)

**What:** 05-REVIEW.md's WR-01 flagged that `serializeDispatch`'s shared, module-scoped queue has no internal timeout, so one provider call that never resolves permanently wedges every future paid dispatch until the dev server restarts. The review speculated video was "likely self-protecting" because `veo.ts` has its own `POLL_TIMEOUT_MS` (10 minutes). **This research confirms that assumption only half-holds and the other three call sites have zero protection:**

- Verified via `node_modules/@google/genai/dist/node/index.cjs:13763-13773,13890-13896`: `HttpOptions.timeout` is a real, per-attempt `AbortController`-based timeout — but it is **opt-in**. `createAttemptSignal` only arms a timeout `if (timeout && timeout > 0)`. None of `gemini.ts`'s two call sites, `gemini-image.ts`'s one call site, or `veo.ts`'s `generateVideos`/`getVideosOperation` calls pass `httpOptions.timeout` today — every one of them can hang on the underlying HTTP request indefinitely with no bound at all.
- `veo.ts`'s `POLL_TIMEOUT_MS` only bounds the *polling loop's* external `Date.now()` check between calls — it does **not** bound any single `getVideosOperation()` call. If one individual poll request itself hangs (rather than returning `done: false` promptly), the external 10-minute check is never reached because the `await` for that one call never resolves. Video is not actually self-protecting against this specific failure mode.

**Fix — add `httpOptions: { timeout: N }` to the existing `config` object at all four call sites** (`GenerateContentConfig`/`GenerateVideosConfig` both declare an optional `httpOptions?: HttpOptions` field per `node_modules/@google/genai/dist/genai.d.ts:5570-5572` and equivalents):
```typescript
// gemini.ts / gemini-image.ts -- add to the existing `config` object
const config = {
  responseMimeType: "application/json",
  responseSchema: params.responseSchema,
  maxOutputTokens: 16384,
  httpOptions: { timeout: 60_000 }, // NEW -- bounds this one HTTP attempt
};
```
```typescript
// veo.ts -- add to both the initial generateVideos call and each poll
let operation = await ai.models.generateVideos({
  model: MODEL,
  prompt: params.prompt,
  image: { /* ... */ },
  config: { aspectRatio, resolution, durationSeconds, httpOptions: { timeout: 30_000 } }, // NEW
});
// ...
operation = await ai.operations.getVideosOperation({ operation, config: { httpOptions: { timeout: 30_000 } } }); // NEW
```
This closes the gap at its root (the SDK's own supported mechanism actually aborts the underlying request) rather than a `Promise.race` wrapper around `serializeDispatch` that would leave the original hung request running in the background forever (WR-01's own fix text flags this as the weaker of its two suggested options). Document the chosen timeout values and the reasoning ("every function ever passed to `serializeDispatch` MUST have its own bounded timeout") directly in `dispatch-chain.ts`'s header comment, per WR-01's own recommendation.

### Anti-Patterns to Avoid
- **Do not rely on `onError` firing to detect an invalid MP4.** Verified in this session: garbage/empty input fires neither `onReady` nor `onError`; only a well-formed-but-wrong container (a real image) fires `onError`. The only reliable signal is `onReady` never having fired after a full `appendBuffer`+`flush()`.
- **Do not let the missing-API-key path fall through to Google's ADC lookup.** It is slow (a non-GCP metadata-server probe) and produces a generic, unhelpful error rather than the specific message STARTUP-02 requires — always pre-empt it with a synchronous env-var check.
- **Do not special-case the retry-cap increment by failure cause for RELIABILITY-01/D-02.** Every dispatch that reaches the real provider call increments the counter identically, regardless of whether it times out, is blocked, or throws — this is already correct in the codebase; do not "fix" it while implementing the message differentiation.
- **Do not re-derive the corruption-triggered free-retry exemption from client state.** D-05's cap bypass must survive a page reload (she may not retry immediately) — it has to be a persisted Scene-level flag, read server-side by `gates.ts`, the same way `videoAttempts` itself already is.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| MP4 duration/dimension extraction | A custom `moov`/`mvhd`/`tkhd` box parser | `mp4box` (npm) | ISOBMFF box parsing has real edge cases (mvhd version 0 vs. 1 field widths, 64-bit extended box sizes, non-standard box ordering) a validation-only use case has no business re-deriving; `mp4box` already handles all of them and was proven correct against this project's own real output in one pass |
| Provider-response-shape validation | Trusting `any`-typed fields from the SDK's raw response | The classify-before-parse pattern already established in `gemini.ts`/`gemini-image.ts` (`promptFeedback.blockReason` → `finishReason !== "STOP"` → content presence, in that order) | Already correct in this codebase for two of three providers; extend the identical order to `veo.ts` rather than inventing a new validation order |

**Key insight:** every "don't hand-roll" item in this phase is really "don't invent a new pattern — extend the one this codebase already proved correct in a sibling file." The Story Director and image providers already show the exact shape D-01 wants; the video provider is the outlier that needs to catch up, not a place to design something new.

## Common Pitfalls

### Pitfall 1: Conflating "technical" and "content" failures inside `veo.ts`'s single `blocked` boolean
**What goes wrong:** A genuine Responsible-AI content-safety rejection (`raiMediaFilteredCount > 0`) gets the same generic "please try again" message as a technical operation error or a malformed response — she keeps re-trying a scene that will never succeed because the *actual* problem (her motion prompt or image tripped a content classifier) is never surfaced as "try rephrasing."
**Why it happens:** `veo.ts` was written before D-01 existed and never needed the distinction; `gemini.ts`/`gemini-image.ts` already have it because their own earlier phases needed to distinguish `MAX_TOKENS` from a genuine block.
**How to avoid:** Add the `blockKind: "content" | "technical"` discriminator shown in Pattern 2, set at the exact point each `blocked: true` branch already exists — no new branching logic, just a new field on an existing return shape.
**Warning signs:** A UAT pass where the same scene fails repeatedly with an identical "please try again" message and she has no way to know rephrasing would actually help.

### Pitfall 2: Assuming a missing API key crashes the app or throws synchronously
**What goes wrong:** A plan that adds a startup-time key check (e.g. in `next.config.ts` or a root layout) is solving a problem that doesn't exist — verified in this session that `new GoogleGenAI({})` never throws on a missing key, and no provider client is ever constructed outside a function body.
**Why it happens:** It's a reasonable a priori assumption for many SDKs; this one specifically defers the failure to first network use and only warns at construction time.
**How to avoid:** Put the check at the point of use (inside each of the four gated dispatch functions), exactly where `checkBudget` already runs — never at app startup. This also directly satisfies D-03/D-04 ("no dedicated setup screen... appears only when and where she hits it").
**Warning signs:** A plan task that touches `layout.tsx`, `next.config.ts`, or any file that runs at process start for this requirement is very likely solving the wrong problem.

### Pitfall 3: Assuming video is "self-protecting" against a hung HTTP call because of `POLL_TIMEOUT_MS`
**What goes wrong:** `POLL_TIMEOUT_MS` only bounds the loop's *elapsed wall-clock time between iterations* — a single `getVideosOperation()` call that itself never resolves is never reached by that check, because the `await` blocks forever before the loop can compare timestamps again.
**Why it happens:** The review that first flagged WR-01 explicitly hedged this as "likely" self-protecting, without verifying the SDK's own default-timeout behavior.
**How to avoid:** Add `httpOptions.timeout` to every individual HTTP-issuing call (Pattern 6) — a loop-level bound and a per-call bound solve different failure modes and neither substitutes for the other.
**Warning signs:** A plan that treats `veo.ts` as "already fine, no changes needed" for the WR-01 fix.

### Pitfall 4: Validating the MP4 at export time instead of generation time
**What goes wrong:** `exportEpisodeAssets` (`episode-export.ts`) copies `scene.videoPath` into `output/NN_scene.mp4` at export time — if validation only happens there, a corrupted file has already been shown as "READY" on the Video Status screen and possibly already counted in `allReady`, and the failure surfaces much later, disconnected from the actual generation attempt.
**Why it happens:** It looks like a natural single choke point (every scene funnels through export eventually).
**How to avoid:** Validate at save time (Pattern 4, immediately after the existing post-download byte read in `generate-video.ts`) — per CONTEXT.md's own discretion note, "catches the problem before she ever sees 'ready.'" `exportEpisodeAssets`'s existing `existsSync` check remains as a second, cheap defense against a file that was valid at save time but later vanished/moved (already correct, no change needed there).
**Warning signs:** A plan task that adds MP4 validation logic inside `episode-export.ts` rather than `generate-video.ts`.

## Code Examples

### 1. The exact classification order every provider already follows (or should follow) — verified from the installed codebase
```typescript
// src/providers/llm/gemini.ts:87-161 -- classifyStoryResponse, EXISTING,
// this is the canonical order: prompt-level block, THEN non-STOP finish
// reason, THEN absence of text, THEN JSON.parse -- never trust a later
// field before an earlier one has been checked.
const blockReason = response.promptFeedback?.blockReason;
if (blockReason) { return { ..., blocked: true, block: { stage: "prompt", reason: String(blockReason) } }; }

const finishReason = candidate?.finishReason;
if (finishReason && finishReason !== "STOP") { return { ..., blocked: true, block: { stage: "candidate", reason: String(finishReason) } }; }

const text = candidate?.content?.parts?.[0]?.text;
if (!text) { return { ..., blocked: true, block: { stage: "candidate", reason: "NO_TEXT_IN_RESPONSE" } }; }

try { parsed = JSON.parse(text); }
catch (err) { return { ..., blocked: true, block: { stage: "parse", reason: `JSON.parse failed: ${err.message}` } }; }
```

### 2. Real verified field names for `usageMetadata` — grounds the `log-response.ts` fix
```typescript
// Verified directly from node_modules/@google/genai/dist/genai.d.ts:5910-5928
// (GenerateContentResponseUsageMetadata) and :10777-10782 (ModalityTokenCount)
// -- these are the REAL field names the installed SDK (2.22.0) returns:
cachedContentTokenCount?: number;
candidatesTokenCount?: number;
promptTokenCount?: number;
thoughtsTokenCount?: number;
toolUsePromptTokenCount?: number;
totalTokenCount?: number;
tokensDetails?: ModalityTokenCount[];       // nested: { modality, tokenCount }
candidatesTokensDetails?: ModalityTokenCount[];
promptTokensDetails?: ModalityTokenCount[];
cacheTokensDetails?: ModalityTokenCount[];
toolUsePromptTokensDetails?: ModalityTokenCount[];
responseTokensDetails?: ModalityTokenCount[];
```

### 3. `isSecretKey` fix — narrow the "token" match without weakening the "key"/"authorization" match
```typescript
// src/lib/log-response.ts -- current implementation over-redacts every
// field above (all contain the substring "token"). Every legitimate field
// name in this SDK's real usage-metadata shape ends in either "TokenCount"
// or "TokensDetails" -- verified exhaustively above, not assumed.
const SAFE_TOKEN_FIELD_SUFFIX = /tokencount$|tokensdetails$/i;

function isSecretKey(key: string): boolean {
  const lowered = key.toLowerCase();
  if (lowered.includes("token") && SAFE_TOKEN_FIELD_SUFFIX.test(lowered)) {
    // Still redact a field that happens to ALSO be key/authorization-shaped
    // even though it passes the safe-token-suffix check (defense in depth;
    // no such field exists in the real API surface today, but a future
    // provider addition should not silently bypass this).
    return lowered.includes("key") || lowered.includes("authorization");
  }
  return lowered.includes("key") || lowered.includes("token") || lowered.includes("authorization");
}
```
Add to `log-response.test.ts`: assert `redactLargeStrings({ promptTokenCount: 42, candidatesTokensDetails: [{ modality: "TEXT", tokenCount: 10 }] })` returns those values **unchanged**, alongside the existing test that `apiKey`/`authorization`/`x-goog-api-key`/`token` are still fully redacted.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Dev-only file ledger (`spend-ledger.ts`) dual-written from `generate-images.ts`/`director.ts` alongside the real database | Real-budget-only writes via `recordGeneration`/`recordGenerationAtDispatch` (best-effort, never throws) | Phase 5 (plans 05-03/05-04) | The "unprotected `recordSpend` call" technical debt item named in this phase's CONTEXT.md is now moot — confirmed by `grep -rn recordSpend src/` finding zero live call sites in either file |

**Deprecated/outdated:**
- The client-only `generatingStartedAtRef` stuck-generation clock in `page.tsx` is still live and still buggy (Pattern 5) — not yet deprecated, but this phase's job is to deprecate it in favor of the server-anchored timestamp.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Google's ADC (Application Default Credentials) lookup is materially slower than a synchronous env-var check, on a non-GCP local Windows machine with no `gcloud`/ADC configured | Pattern 1, Anti-Patterns | Low — even if the ADC path resolves quickly, the pre-flight check is still strictly better UX (a specific message vs. a generic one) and costs nothing; this assumption only affects how strongly to word the "avoid the ADC path" recommendation, not whether to build the pre-flight check at all |
| A2 | A tolerance of ±1 second for the MP4 duration check is appropriate | Pattern 4 (Code Example) | Low-moderate — only one real sample was checked (exact match, 0s deviation); if Veo's real-world encoder rounding is looser than this single sample suggests, ±1s could produce false-positive rejections on a genuinely valid video. Recommend the planner treat this as a tunable constant, not a hardcoded literal, and revisit after a few more real generations are observed |
| A3 | `httpOptions: { timeout: 60_000 }` (60s) for text/image calls and `30_000` (30s) for video poll calls are reasonable bounds | Pattern 6 | Low-moderate — no empirical latency data was gathered for a slow-but-legitimate Gemini/Veo response in this session; too tight a timeout could abort a legitimately slow (but eventually successful) call. Recommend the planner treat these as tunable and validate against a real slow-network scenario if possible, or simply set them generously (this is a defense against *infinite* hangs, not an optimization for typical latency) |

## Open Questions

1. **Exact schema shape for D-05's free-retry exemption**
   - What we know: it needs to be a persisted, server-read signal (not client state) that (a) lets one retry bypass the cap-check gate in `gates.ts` even if `videoAttempts`/`imageAttempts` is already at the configured max, and (b) tells the increment call site to skip incrementing for that one retry, then clears itself.
   - What's unclear: whether this should be a boolean flag column (e.g. `videoSaveCorrupted Boolean @default(false)`) on `Scene`, a new `SceneAssetStatus` enum value, or a small side table. A boolean flag is the smallest schema change and composes cleanly with the existing `WAITING/GENERATING/READY/FAILED` enum (the flag is orthogonal to status, not a replacement for it).
   - Recommendation: a boolean flag per asset type (`videoSaveCorrupted`, `imageSaveCorrupted`), set by the validation failure branch, read by `evaluateVideoDispatch`/`evaluateImageRegeneration` as a cap-bypass condition, and cleared by the next dispatch attempt regardless of outcome (it is a one-shot exemption, not a persistent state).

2. **Whether image saves need the same MP4-style validity check**
   - What we know: OUTPUT-02's actual requirement text is video-only ("Every saved video file is a valid, non-empty, playable MP4"). D-05's decision text uses "video/image" generically when describing the retry-cap exemption's *rationale*, but does not add a new image-validity requirement.
   - What's unclear: whether "saved image turns out to be invalid" in D-05 refers to the already-handled local-disk-write-failure branch in `generate-images.ts` (which already exists and does not increment the attempt cap in that specific branch — confirmed: the `write-failed` outcome kind does not call `incrementImageAttempt` a second time) or to a genuinely corrupted-but-successfully-written image file (no current check for this).
   - Recommendation: treat the existing disk-write-failure handling in `generate-images.ts` as already satisfying D-05's image half (verify this reading with the planner/discuss-phase if the exact wording matters), and scope the new mp4box-based validation strictly to video, matching OUTPUT-02's literal text.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Node.js | entire app, `mp4box`'s own `engines.node >=20.8.1` requirement | ✓ | v24.20.0 (verified via `node --version`) | — |
| npm | package install | ✓ | 11.19.0 | — |
| Prisma CLI | Pattern 5's schema migration | ✓ | 7.10.0 (verified via `npx prisma --version`) | — |
| `GEMINI_API_KEY` | every real provider call (this phase's own STARTUP-02 subject) | not applicable to check here — deliberately excluded per this environment's `.env*` deny rule; the app's own behavior when it's absent is exactly what this phase builds | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — all required tooling is already present and verified in this environment.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node's native `node --test` (verified via `package.json`'s `test:lib` script) |
| Config file | none — test files are explicitly enumerated in `package.json`'s `test:lib` script |
| Quick run command | `node --test src/lib/log-response.test.ts` (or any single new/changed test file) |
| Full suite command | `npm run test:lib` (runs every enumerated test file, then `node src/scripts/check-boundaries.ts`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|-------------|
| RELIABILITY-01 | `veo.ts`'s new `blockKind` discriminator correctly classifies operation-error / RAI-block / no-video-in-response | unit | `node --test src/providers/video/veo.test.ts` | ❌ Wave 0 — no `veo.test.ts` currently exists; the file does not appear in `test:lib`'s enumerated list |
| RELIABILITY-01 | `create-story.ts`'s message differentiates `stage: "prompt"` from `"candidate"`/`"parse"` | unit | `node --test src/providers/llm/gemini.test.ts` | ✅ exists, extend with new cases |
| STARTUP-02 | `assertApiKeyConfigured` throws `MissingApiKeyError` when both env vars are absent/blank, passes when either is set | unit | `node --test src/core/config/provider-key.test.ts` | ❌ Wave 0 — new module, new test file |
| SECURITY-01 | `isSecretKey` no longer redacts `*TokenCount`/`*TokensDetails` fields, still redacts `key`/`token`/`authorization`-shaped fields | unit | `node --test src/lib/log-response.test.ts` | ✅ exists, extend with new cases (see Code Examples 3) |
| SECURITY-01 | no `"use client"` file imports a provider/secrets-adjacent module after this phase's changes | structural | `node src/scripts/check-boundaries.ts` | ✅ exists, already part of `test:lib` |
| OUTPUT-02 | `validateMp4Buffer` accepts a real valid MP4, rejects empty/text/image-mislabeled buffers, rejects wrong-duration/wrong-aspect-ratio | unit | `node --test src/core/output/mp4-validation.test.ts` | ❌ Wave 0 — new module, new test file. **A real fixture file already exists and is committed to this repo's working tree** (`storage/stories/story-1789237907876-npep3b/scenes/01/video.mp4`) but `storage/` is very likely gitignored (matches this project's own `.gitignore` convention for generated assets) — verify before relying on it as a checked-in test fixture; if gitignored, either commit a small dedicated fixture file under a test-fixtures directory or read from the real `storage/` path with a skip-if-absent guard |
| OUTPUT-02 | D-05's free-retry flag bypasses the cap gate exactly once, then clears | unit | `node --test src/core/approval/gates.test.ts` | ✅ exists, extend with new cases |

### Sampling Rate
- **Per task commit:** the single changed/new test file's own `node --test <file>` command.
- **Per wave merge:** `npm run test:lib` (full suite + `check-boundaries.ts`).
- **Phase gate:** full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/providers/video/veo.test.ts` — new file, covers RELIABILITY-01's `blockKind` discriminator (does not exist in `test:lib`'s enumerated list today — confirm whether `veo.ts` has ever had direct unit tests, or only integration coverage via `smoke-test.ts`/`story-probe.ts`)
- [ ] `src/core/config/provider-key.test.ts` — new file, covers STARTUP-02
- [ ] `src/core/output/mp4-validation.test.ts` — new file, covers OUTPUT-02 (needs the fixture-file decision above resolved first)
- [ ] Add every new test file to `package.json`'s `test:lib` script — this project does not auto-discover test files; a new file not added to that space-separated list silently never runs

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|----------------|---------|---------------------|
| V2 Authentication | no | Single local user, no auth system (documented Out of Scope in REQUIREMENTS.md) |
| V3 Session Management | no | No sessions — a single local process, single browser tab convention |
| V4 Access Control | no | Single local user; no multi-tenant boundary to enforce |
| V5 Input Validation | partially — already covered by prior phases | `storage-paths.ts`'s `STORY_ID_PATTERN`/`assertValidSceneNumber` (existing, unchanged this phase); this phase adds no new user-controlled input surface |
| V6 Cryptography | no | No cryptographic operations in this app; API keys are opaque bearer tokens sent over TLS by the SDK itself, not something this codebase encrypts/decrypts |
| V7 Error Handling and Logging | **yes — this phase's core** | Never let a raw provider error, stack trace, or exception message reach the browser (already the established convention — every Server Action catches and maps to a fixed sentence); `log-response.ts`'s redaction is the logging half |
| V14 Configuration | **yes — this phase's core** | Secrets sourced from environment variables only (`process.env`, via `.env.local`, gitignored), never hardcoded, never committed, never exposed to the client bundle — already structurally enforced by `check-boundaries.ts` invariant 1 |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| API key leaking into the client JS bundle | Information Disclosure | `check-boundaries.ts` invariant 1 (build-time static-import scan); no `NEXT_PUBLIC_`-prefixed env var; all `new GoogleGenAI(...)` construction sites live inside `"use server"`-boundary files only |
| API key leaking into console/log output | Information Disclosure | `log-response.ts`'s `isSecretKey` redaction (this phase's fix narrows a false-positive, does not weaken the true-positive coverage — verified the fix still redacts `apiKey`/`authorization`/`x-goog-api-key`/bare `token`) |
| API key leaking into persisted story/generation metadata | Information Disclosure | `generation-repository.ts`'s existing convention: `message` fields are always a fixed plain-language sentence, never a raw provider payload — already correct, no violation found |
| Stack trace / raw exception surfaced to the browser on a missing key or provider failure | Information Disclosure | Every Server Action already catches and maps exceptions to one fixed sentence before returning (never re-throws to the framework's own error boundary) — this phase extends the same pattern with `MissingApiKeyError` and the new `blockKind` branches, does not introduce a new mechanism |
| A hung provider call silently starving every future generation (denial of service against the app's own single-process queue) | Denial of Service | `httpOptions.timeout` on every provider call site (Pattern 6) — closes a confirmed, verified gap |

## Sources

### Primary (HIGH confidence)
- `node_modules/@google/genai/dist/node/index.cjs` (installed package v2.22.0) — API-key resolution/warning behavior (lines 26251-26356), `HttpOptions.timeout` per-attempt abort behavior (lines 13448-13896)
- `node_modules/@google/genai/dist/genai.d.ts` (installed package v2.22.0) — `HttpOptions` interface (7731-7749), `GenerateContentResponseUsageMetadata` real field names (5910-5928), `ModalityTokenCount` (10777-10782), `GenerateContentConfig.httpOptions` (5570-5572)
- Direct `node -e` execution of the installed `mp4box` (2.4.1) package against a real Veo-generated file already on disk in this repository, plus three constructed negative-case buffers (empty, plain text, real JPEG) — all outputs pasted verbatim into this document
- `npm view mp4box version`, `npm view mp4box scripts.postinstall`, `curl https://api.npmjs.org/downloads/point/last-week/mp4box` — live registry data, this session
- `gsd-tools query package-legitimacy check --ecosystem npm mp4box` → `OK`, zero flagged reasons
- Direct reads of this project's own source: `log-response.ts`, `generate-video.ts`, `generate-images.ts`, `director.ts`, `create-story.ts`, `veo.ts`, `gemini.ts`, `gemini-image.ts`, `dispatch-chain.ts`, `ledger.ts`, `caps.ts`, `gates.ts`, `generation-repository.ts`, `get-story-status.ts`, `storage-paths.ts`, `episode-export.ts`, `check-boundaries.ts`, `spend-ledger.ts`, `page.tsx`, `VideoStatusScreen.tsx`, `prisma/schema.prisma`, `package.json`, `next.config.ts`, `prisma.config.ts`
- `git check-ignore -v .env.local`, `git ls-files | grep env`, `git show HEAD:.env.local.example` — live repo state, this session

### Secondary (MEDIUM confidence)
- `github.com/gpac/mp4box.js` README (via WebFetch) — Node.js usage example shape (`onReady`/`onReady` callback structure); the exact field names were then independently re-confirmed empirically against real data, so this source's role is limited to initial API-shape orientation

### Tertiary (LOW confidence)
- None retained as load-bearing — every claim that started as WebSearch/training-knowledge-only was either verified against an authoritative source in this session or explicitly tagged in the Assumptions Log

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — the one new package (`mp4box`) was run against real project data, not just documentation
- Architecture: HIGH — every pattern recommendation cites an exact file/line from this project's own installed dependencies or source, not general knowledge
- Pitfalls: HIGH — Pitfalls 1, 3, and 4 are grounded in direct source reads of the exact files that would need to change; Pitfall 2 is grounded in an executed test against the installed SDK

**Research date:** 2026-09-20
**Valid until:** 30 days (stable, locally-pinned dependency versions; re-verify `mp4box`/`@google/genai` versions if this phase is planned significantly later, since both are actively-maintained packages)
