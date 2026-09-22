# Phase 6: Reliability, Secrets Hygiene & Output Correctness - Pattern Map

**Mapped:** 2026-09-20
**Files analyzed:** 10 (2 new, 8 modified)
**Analogs found:** 10 / 10 (all files this phase touches are extensions of existing, in-codebase patterns — this phase deliberately introduces no new architectural shape)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/core/config/provider-key.ts` (NEW) | utility (typed-error + guard) | request-response (pre-flight, sync) | `src/core/budget/ledger.ts` (`BudgetExceededError`) | exact — explicitly designed by RESEARCH.md to mirror this file's shape |
| `src/core/output/mp4-validation.ts` (NEW) | utility (validation) | transform (buffer in, verdict out) | `src/core/approval/gates.ts` (`evaluate*` pure-decision functions) | role-match — same "pure function returns a decision object, caller acts on it" shape |
| `src/providers/video/veo.ts` | service (provider client) | request-response + long-poll | `src/providers/image/gemini-image.ts` (`stage` discriminator) | exact — RESEARCH.md identifies this as the direct pattern to copy for `blockKind` |
| `src/providers/llm/gemini.ts` | service (provider client) | request-response | `src/providers/image/gemini-image.ts` (`plainLanguageBlockMessage`) | exact — same file family, extend existing `stage` consumption |
| `src/providers/image/gemini-image.ts` | service (provider client) | request-response | itself (reference implementation) | n/a — this file is the analog for the other two providers; only needs `httpOptions.timeout` added |
| `src/lib/log-response.ts` | utility (redaction) | transform | itself (existing `isSecretKey`) | exact — in-place fix, no external analog needed |
| `src/app/actions/generate-video.ts` | controller (Server Action) | request-response + file-I/O | `src/app/actions/create-story.ts` (budget-error catch branch) | exact — same catch-and-map-to-sentence shape, extend with `MissingApiKeyError` + `blockKind` + mp4 validation |
| `src/app/actions/generate-images.ts` | controller (Server Action) | request-response + file-I/O | `src/app/actions/generate-video.ts` (pre-flight-check-before-dispatch ordering) | exact — sibling gated dispatch function |
| `src/app/actions/create-story.ts` | controller (Server Action) | request-response | `src/app/actions/generate-video.ts` (`BudgetExceededError` catch branch, lines 173-195) | exact — same catch-and-map convention, add `MissingApiKeyError` branch first |
| `src/app/actions/get-story-status.ts` | controller (Server Action, read-only) | request-response (polling) | itself (existing `existsSync` check) | exact — this phase extends, not replaces, its check; also gains the server-side `stuck` computation (Pattern 5) |
| `src/core/approval/gates.ts` | service (pure decision functions) | transform | itself (`evaluateVideoDispatch`, lines 58-96) | exact — D-05's free-retry bypass extends this function's existing shape |
| `src/core/persistence/generation-repository.ts` | model/repository | CRUD (best-effort writes) | itself (`recordGeneration`, best-effort-by-contract convention) | exact — D-05's "clear corruption flag" write follows the same best-effort contract |
| `prisma/schema.prisma` (Scene model) | model (schema) | CRUD | itself (`imageAttempts`/`videoAttempts` int-counter convention, lines 95-99) | exact — new `videoGeneratingSince` / corruption-flag columns follow the identical nullable-until-set / counter convention already used |
| `src/core/budget/dispatch-chain.ts` | utility (queue) | event-driven (serialized async chain) | itself (existing `serializeDispatch`) | exact — only a doc-comment extension; the timeout fix lives in the four provider call sites, not here |
| `src/app/page.tsx` / `src/components/story/VideoStatusScreen.tsx` | component | streaming/polling (client) | itself (`generatingStartedAtRef`, `STUCK_AFTER_MS`) | exact — replace local clock with server-computed `row.stuck` field |

## Pattern Assignments

### `src/core/config/provider-key.ts` (NEW) — utility, request-response pre-flight guard

**Analog:** `src/core/budget/ledger.ts` (`BudgetExceededError`, lines 31-36)

**Typed-error pattern to copy exactly:**
```typescript
// src/core/budget/ledger.ts:31-36
export class BudgetExceededError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}
```

**New file should mirror this 1:1** (already worked out in 06-RESEARCH.md Pattern 1, verified against the installed `@google/genai` SDK source — `new GoogleGenAI({})` never throws on a missing key, only `console.warn`s):
```typescript
export class MissingApiKeyError extends Error {
  constructor(message?: string) {
    super(message ?? "GEMINI_API_KEY is not configured.");
    this.name = "MissingApiKeyError";
  }
}

export function assertApiKeyConfigured(
  env: Record<string, string | undefined> = process.env,
): void {
  const key = env.GOOGLE_API_KEY?.trim() || env.GEMINI_API_KEY?.trim();
  if (!key) throw new MissingApiKeyError();
}
```

**Call-site placement pattern** — mirror `checkBudget`'s placement in `generate-video.ts:173-195` (`dispatchSceneVideo`): call `assertApiKeyConfigured()` as the *first* line inside each of the four gated dispatch functions (`runStoryDirector`/`create-story.ts`, `compareViaLlm`, `generateSceneImagesAction`'s per-scene loop, `dispatchSceneVideo`), strictly before `checkBudget` — it is synchronous and free, so it should short-circuit before paying a DB round-trip.

---

### `src/app/actions/generate-video.ts`, `create-story.ts`, `generate-images.ts` — catch-and-map branch extension

**Analog:** `generate-video.ts` lines 173-195 (`checkBudget` catch block) — this is the exact shape every gated Server Action already uses and that the new `MissingApiKeyError` branch must extend.

**Existing pattern to extend (copy the `instanceof` chain shape, add one branch above it):**
```typescript
// src/app/actions/generate-video.ts:173-195
try {
  await checkBudget(estimatedUsd);
} catch (err) {
  const message =
    err instanceof BudgetExceededError
      ? "The generation budget was reached, so this scene's video could not be created."
      : "This scene's video could not be created due to an unexpected error.";
  if (!(err instanceof BudgetExceededError)) {
    console.error(
      `generateSceneVideoAction: checkBudget failed unexpectedly for story ${storyId} scene ${sceneNumber}`,
      err,
    );
  }
  await updateSceneVideo(storyId, sceneNumber, null, SceneAssetStatus.FAILED);
  return { ok: false, videoPath: null, videoDataUrl: null, message, durationSeconds };
}
```

**Extension shape (D-03):** add `assertApiKeyConfigured()` as a synchronous call immediately before this `try { await checkBudget(...) }` block (or fold into the same try, catching `MissingApiKeyError` first):
```typescript
} catch (err) {
  if (err instanceof MissingApiKeyError) {
    return { ok: false, ..., message: "This app isn't fully set up yet — an API key is missing. Ask whoever installed it to check the setup steps." };
  }
  if (err instanceof BudgetExceededError) { /* existing, unchanged */ }
  // existing generic fallback, unchanged
}
```
`create-story.ts` catches `BudgetExceededError` at line 151-152 (`if (err instanceof BudgetExceededError)`) — same extension shape applies there.

**Import pattern** (`generate-video.ts:6`):
```typescript
import { BudgetExceededError, checkBudget } from "../../core/budget/ledger.ts";
```
New files add the sibling import: `import { MissingApiKeyError, assertApiKeyConfigured } from "../../core/config/provider-key.ts";`

---

### `src/providers/video/veo.ts` — block-kind discriminator extension

**Analog:** `src/providers/image/gemini-image.ts` lines 79-87 (`plainLanguageBlockMessage`) — the exact `stage` discriminator pattern D-01 requires, already correct and working in this codebase.

**Reference pattern (already correct, DO NOT modify, only copy its shape):**
```typescript
// src/providers/image/gemini-image.ts:79-87
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

**Current `veo.ts` gap** (`generateVideo`, lines 82-113) — three `blocked: true` returns with no discriminator:
```typescript
// src/providers/video/veo.ts:82-113 (current)
if (operation.error) {
  return { filePath: null, usageMetadata: operation.response ?? null, estimatedUsd, blocked: true,
    blockReason: `operation error: ${JSON.stringify(operation.error)}` };
}
const raiCount = operation.response?.raiMediaFilteredCount;
const raiReasons = operation.response?.raiMediaFilteredReasons;
if (raiCount && raiCount > 0) {
  return { filePath: null, usageMetadata: operation.response ?? null, estimatedUsd, blocked: true,
    blockReason: (raiReasons ?? []).join("; ") || "raiMediaFilteredCount>0 with no reasons given" };
}
const generatedVideo = operation.response?.generatedVideos?.[0];
if (!generatedVideo?.video) {
  return { filePath: null, usageMetadata: operation.response ?? null, estimatedUsd, blocked: true,
    blockReason: "NO_VIDEO_IN_RESPONSE" };
}
```

**Fix — add `blockKind: "content" | "technical"` to each return** (per RESEARCH.md Pattern 2): `operation.error` → `"technical"`; `raiCount > 0` → `"content"` (this is the ONLY genuine content-safety branch); `!generatedVideo?.video` → `"technical"`. Extend `GenerateVideoResult` interface (currently lines 25-33) with `blockKind?: "content" | "technical"`.

**Consuming Server Action** (`generate-video.ts:306-311`, current single-message branch to extend):
```typescript
if (result.blocked || !result.filePath) {
  const message = "The video could not be generated. Please try again.";
  await updateSceneVideo(storyId, sceneNumber, null, SceneAssetStatus.FAILED);
  await recordGeneration(storyId, { ...generationRecordBase, ok: false, message }, sceneNumber);
  return { ok: false, videoPath: null, videoDataUrl: null, message, durationSeconds };
}
```
becomes a `result.blockKind === "content"` branch choosing the rephrase-framed message vs. the existing try-again message for everything else — do not touch the surrounding `updateSceneVideo`/`recordGeneration`/attempt-increment calls, which are already correct per D-02.

---

### `src/providers/llm/gemini.ts` — extend existing `stage` consumption (smaller gap)

**Analog:** `src/providers/llm/gemini.ts` itself, `classifyStoryResponse` (lines 87-161) — already computes the right discriminator, only the *consumer* in `create-story.ts` collapses it. No provider-file change needed beyond exposing `block.stage`/`block.reason` on the result the consumer already reads; the fix is almost entirely in `create-story.ts`'s branching logic, following `gemini-image.ts`'s `plainLanguageBlockMessage` shape:

```typescript
// src/providers/llm/gemini.ts:87-161 (existing, canonical classification order — copy this order, don't reinvent)
const blockReason = response.promptFeedback?.blockReason;
if (blockReason) { return { ..., blocked: true, block: { stage: "prompt", reason: String(blockReason) } }; }

const finishReason = candidate?.finishReason;
if (finishReason && finishReason !== "STOP") { return { ..., blocked: true, block: { stage: "candidate", reason: String(finishReason) } }; }

const text = candidate?.content?.parts?.[0]?.text;
if (!text) { return { ..., blocked: true, block: { stage: "candidate", reason: "NO_TEXT_IN_RESPONSE" } }; }

try { parsed = JSON.parse(text); }
catch (err) { return { ..., blocked: true, block: { stage: "parse", reason: `JSON.parse failed: ${err.message}` } }; }
```
`create-story.ts`'s message-selection should branch `stage === "prompt"` → rephrase framing, `stage === "candidate" | "parse"` → try-again framing (mirroring `gemini-image.ts`'s two-way split exactly), keeping the existing `MAX_TOKENS` special case as one of the `"candidate"` sub-cases.

---

### `src/lib/log-response.ts` — in-place `isSecretKey` fix

**Analog:** itself — no external analog needed, this is a scoped bugfix to an existing, otherwise-correct function.

**Current implementation** (lines 10-16):
```typescript
function isSecretKey(key: string): boolean {
  const lowered = key.toLowerCase();
  return lowered.includes("key") || lowered.includes("token") || lowered.includes("authorization");
}
```

**Fix (from RESEARCH.md Code Example 3, field names verified against installed `@google/genai` 2.22.0 `genai.d.ts`):**
```typescript
const SAFE_TOKEN_FIELD_SUFFIX = /tokencount$|tokensdetails$/i;

function isSecretKey(key: string): boolean {
  const lowered = key.toLowerCase();
  if (lowered.includes("token") && SAFE_TOKEN_FIELD_SUFFIX.test(lowered)) {
    return lowered.includes("key") || lowered.includes("authorization");
  }
  return lowered.includes("key") || lowered.includes("token") || lowered.includes("authorization");
}
```
Called from `redactValue` (line 19: `if (keyName !== undefined && isSecretKey(keyName))`) — no caller-side change needed, the fix is fully contained in `isSecretKey`.

**Test pattern to extend** — `log-response.test.ts` already asserts `apiKey`/`authorization`/`token` fields ARE redacted; add the inverse assertion that `promptTokenCount`/`candidatesTokensDetails` (etc.) are NOT redacted, following whatever `describe`/`it` structure that test file already uses (not read in this pass — inspect at plan time for exact `expect(...)` idiom).

---

### `src/core/output/mp4-validation.ts` (NEW) — validation utility

**Analog (structural):** `src/core/approval/gates.ts`'s `evaluate*` functions — pure functions that take state in, return a typed decision object out, no I/O, no throw-as-control-flow. `evaluateVideoDispatch` (lines 58-96) is the closest shape: multiple early-return guard clauses, each returning a discriminated result object.

**Full working implementation already verified in RESEARCH.md against a real Veo file in this repo** (`storage/stories/story-1789237907876-npep3b/scenes/01/video.mp4`) — copy directly:
```typescript
import * as MP4Box from "mp4box";

export interface Mp4ValidationResult {
  valid: boolean;
  reason?: string;
  actualDurationSeconds?: number;
  actualWidth?: number;
  actualHeight?: number;
}

const MIN_PLAUSIBLE_BYTES = 10_000;

export function validateMp4Buffer(
  bytes: Buffer,
  expected: { durationSeconds: number; toleranceSeconds?: number },
): Mp4ValidationResult {
  if (bytes.length === 0) return { valid: false, reason: "empty file" };
  if (bytes.length < MIN_PLAUSIBLE_BYTES) {
    return { valid: false, reason: `implausibly small (${bytes.length} bytes)` };
  }
  if (bytes.subarray(4, 8).toString("ascii") !== "ftyp") {
    return { valid: false, reason: "missing MP4 ftyp signature -- not a genuine MP4 container" };
  }

  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as MP4Box.MP4ArrayBuffer;
  arrayBuffer.fileStart = 0;

  const mp4boxfile = MP4Box.createFile();
  let info: MP4Box.MP4Info | null = null;
  mp4boxfile.onReady = (i) => { info = i; };
  mp4boxfile.onError = () => { /* no-op -- info === null below is the real check */ };

  try {
    mp4boxfile.appendBuffer(arrayBuffer);
    mp4boxfile.flush();
  } catch {
    return { valid: false, reason: "malformed MP4 container" };
  }

  if (info === null) return { valid: false, reason: "not a parseable MP4 (no moov box found)" };

  const videoTrack = info.tracks.find((t) => t.video !== undefined);
  const actualWidth = videoTrack?.track_width;
  const actualHeight = videoTrack?.track_height;
  const actualDurationSeconds = info.duration / info.timescale;

  const tolerance = expected.toleranceSeconds ?? 1;
  if (Math.abs(actualDurationSeconds - expected.durationSeconds) > tolerance) {
    return { valid: false, reason: `duration ${actualDurationSeconds}s does not match expected ${expected.durationSeconds}s`, actualDurationSeconds, actualWidth, actualHeight };
  }
  if (actualWidth && actualHeight && actualWidth * 16 !== actualHeight * 9) {
    return { valid: false, reason: `dimensions ${actualWidth}x${actualHeight} are not 9:16`, actualDurationSeconds, actualWidth, actualHeight };
  }
  return { valid: true, actualDurationSeconds, actualWidth, actualHeight };
}
```

**IMPORTANT — do not key validity off `onError`**: verified empirically that garbage/empty input fires neither `onReady` nor `onError`; only a well-formed-but-wrong container (e.g. a JPEG) fires `onError`. `info === null` after `flush()` is the only reliable failure signal.

**Integration point (analog):** `generate-video.ts` lines 313-348, the existing post-download byte read:
```typescript
// src/app/actions/generate-video.ts:313-316 (existing integration point — insert validation right after this read succeeds)
let videoDataUrl: string | null = null;
try {
  const videoBytes = readFileSync(result.filePath);
  videoDataUrl = `data:video/mp4;base64,${videoBytes.toString("base64")}`;
```
Call `validateMp4Buffer(videoBytes, { durationSeconds })` here, reusing `videoBytes` (no second disk read) — before the `updateSceneVideo(..., SceneAssetStatus.READY)` call at line 350. On invalid, write `SceneAssetStatus.FAILED` instead of `READY` and set the D-05 free-retry flag (see `gates.ts`/schema below) — do NOT call `incrementVideoAttempt` a second time (it already ran once at line 234, before dispatch; D-05 requires this specific attempt not to count, which likely means decrementing or a compensating flag rather than skipping the increment that already happened before the provider call — planner should size this precisely against Open Question 1 in RESEARCH.md).

---

### `src/core/approval/gates.ts` — D-05 free-retry bypass extension

**Analog:** itself, `evaluateVideoDispatch` (lines 58-96) — the exact function this decision must extend.

**Current guard clause to extend** (line 79-86):
```typescript
// src/core/approval/gates.ts:79-86
if (scene.videoAttempts >= maxVideoAttempts) {
  return {
    allowed: false,
    message:
      `This scene's video has reached its limit of ${maxVideoAttempts} attempts. The other scenes aren't ` +
      "affected — you can continue with what's ready, or start a new story to try again.",
  };
}
```
D-05 needs a bypass here: if the new corruption-flag column (schema, below) is set on `scene`, allow dispatch even at/above `maxVideoAttempts` for exactly one retry, following the same `if (story === null) { ... }` / early-return guard-clause style already used throughout this function (lines 63-94).

---

### `prisma/schema.prisma` — new Scene columns

**Analog:** existing `imageAttempts`/`videoAttempts` int-counter convention (lines 95-99) for D-05's flag, and `imagePath`/`videoPath` nullable-until-set convention (lines 91, 93) for Pattern 5's timestamp:

```prisma
// src/../prisma/schema.prisma:82-107 (existing Scene model, current shape)
model Scene {
  id                String             @id @default(cuid())
  storyId           String
  story             Story              @relation(fields: [storyId], references: [id])
  sceneNumber       Int
  storyPurpose      String
  imagePrompt       String
  motionPrompt      String
  durationSeconds   Int?
  imagePath         String?
  imageStatus       SceneAssetStatus   @default(WAITING)
  videoPath         String?
  videoStatus       SceneAssetStatus   @default(WAITING)
  imageAttempts     Int                @default(0)
  videoAttempts     Int                @default(0)
  createdAt         DateTime           @default(now())
  generationRecords GenerationRecord[]

  @@unique([storyId, sceneNumber])
}
```
New columns to add, following the exact same style/comment convention already present:
```prisma
  videoGeneratingSince DateTime?          // Pattern 5: server-anchored stuck-detector clock
  videoSaveCorrupted   Boolean  @default(false)  // D-05: exempts the next retry from the cap gate
```
Migration command (per RESEARCH.md): `npx prisma migrate dev --name phase6_reliability_fields`.

---

### `src/app/actions/get-story-status.ts` — server-side stuck computation

**Analog:** itself — the file already has a lightweight `existsSync` vanished-file check (per RESEARCH.md's "Integration Points" note) that this phase extends rather than replaces. Not fully read in this pass; at plan time, locate the existing `existsSync` check and the `SceneVideoStatusRow` shape it returns, and add:
```typescript
const stuck = scene.videoStatus === "GENERATING"
  && scene.videoGeneratingSince !== null
  && Date.now() - scene.videoGeneratingSince.getTime() > STUCK_AFTER_MS;
```
as a new field on the returned row, sourced from the new `videoGeneratingSince` column (schema above), written wherever `updateSceneVideo(..., SceneAssetStatus.GENERATING)` already runs (`generate-video.ts:203`) and cleared (`null`) on any transition out of `GENERATING`.

---

### `src/providers/*` — bounded timeout addition (Pattern 6)

**Analog:** each provider file's own existing `config` object passed to the SDK call — no new pattern, just one new key on an object that already exists at all four call sites (`gemini.ts` x2, `gemini-image.ts` x1, `veo.ts` x2 — initial dispatch + poll).

```typescript
// existing config object shape (gemini.ts / gemini-image.ts) -- add httpOptions.timeout
const config = {
  responseMimeType: "application/json",
  responseSchema: params.responseSchema,
  maxOutputTokens: 16384,
  httpOptions: { timeout: 60_000 }, // NEW
};
```
```typescript
// veo.ts:46-61 (generateVideos) and :77 (getVideosOperation) -- add httpOptions.timeout to each
config: { aspectRatio, resolution, durationSeconds, httpOptions: { timeout: 30_000 } },
// ...
operation = await ai.operations.getVideosOperation({ operation, config: { httpOptions: { timeout: 30_000 } } });
```

`src/core/budget/dispatch-chain.ts` needs no code change — only its header doc comment (lines 1-34) gains a note that every function passed to `serializeDispatch` MUST carry its own bounded per-call timeout (per WR-01's own recommendation), since the queue itself has no timeout mechanism and should not gain one (a `Promise.race` wrapper would leave the original hung request running in the background — explicitly an anti-pattern per RESEARCH.md).

## Shared Patterns

### Gated-dispatch pre-flight ordering (applies to all 3 Server Actions this phase touches for STARTUP-02)
**Source:** `src/app/actions/generate-video.ts` lines 140-195 (`dispatchSceneVideo`'s existing decision → budget-check → dispatch sequence)
**Apply to:** `create-story.ts` (`runStoryDirector`), `generate-images.ts` (`generateSceneImagesAction`), `generate-video.ts` (`dispatchSceneVideo`) — the same three/four functions `check-boundaries.ts` invariant 7 already enumerates as the sanctioned budget-gated touch sites. `assertApiKeyConfigured()` goes first (sync, free), `checkBudget()` second (async, DB round-trip), matching the existing ordering rationale already documented inline in `generate-video.ts`.

### Catch-and-map-to-one-sentence (applies to every new error branch this phase adds)
**Source:** `src/app/actions/generate-video.ts` lines 173-195, `create-story.ts` line ~151
**Apply to:** every Server Action catch block gaining a `MissingApiKeyError` or `blockKind`-based branch. Convention: server-side `instanceof`/discriminator check → one fixed, calm, plain-language string → no raw provider text, model ID, or file path ever crosses to the return value. `console.error` only for genuinely unexpected (non-classified) errors, never for expected/classified ones (mirrors the `if (!(err instanceof BudgetExceededError))` guard at line 184).

### Best-effort, never-throw persistence writes (applies to any new bookkeeping write D-05 needs)
**Source:** `src/core/persistence/generation-repository.ts` (`recordGeneration`, referenced extensively in `generate-video.ts`'s inline comments, lines 262-290)
**Apply to:** any new write that clears/sets `videoSaveCorrupted` or `videoGeneratingSince` — must follow the same "try/catch internally, log loudly on failure, never let a DB hiccup discard an already-completed/already-paid-for action" contract already established for `recordGeneration`.

### Secrets-boundary enforcement (no new code, verification only)
**Source:** `src/scripts/check-boundaries.ts` invariant 1 (forbids `"use client"` files importing provider/budget/persistence modules) and invariant 7 (enumerates the sanctioned budget-gated call sites)
**Apply to:** every new file this phase adds — `npm run test:lib` (which runs `check-boundaries.ts` as its final step) is this phase's own regression gate; no new client-importable path to a provider, secret, or DB module may be introduced by any of the files above.

## No Analog Found

None — every file this phase touches is an extension of an existing in-codebase pattern (confirmed by RESEARCH.md's own framing: "None of the four requirements need new infrastructure"). The only two genuinely new files (`provider-key.ts`, `mp4-validation.ts`) both have exact structural analogs (`ledger.ts`'s error class; `gates.ts`'s pure-decision-function shape) already identified above.

## Metadata

**Analog search scope:** `src/core/`, `src/providers/`, `src/app/actions/`, `src/lib/`, `src/components/story/`, `prisma/schema.prisma`
**Files scanned:** 15 (all confirmed git-tracked via `git ls-files`)
**Pattern extraction date:** 2026-09-20
**Source:** 06-RESEARCH.md's Architecture Patterns 1-6 and Code Examples 1-3 already contain verified, working code for nearly every file in this phase (confirmed against real installed SDK source and a real generated MP4 on disk) — this PATTERNS.md cross-references those with exact current line numbers read directly from the live codebase in this session, and adds the `gates.ts`/schema/`get-story-status.ts` structural analogs RESEARCH.md named but did not excerpt.
```
