# Phase 2: Core Generation Pipeline - Pattern Map

**Mapped:** 2026-09-12
**Files analyzed:** 14 (new/modified)
**Analogs found:** 11 / 14 (3 have no direct codebase analog — new Next.js UI/scaffold surfaces)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/providers/llm/gemini.ts` | provider | request-response | `src/providers/image/gemini-image.ts` | exact (same role, same call shape: primary/fallback model, classify-before-parse, spend estimate, logRawResponse) |
| `src/providers/llm/gemini.test.ts` | test | request-response | `src/lib/spend-ledger.test.ts` | role-match (node:test unit-test structure) |
| `src/core/story/director.ts` | service | transform | `src/providers/image/gemini-image.ts` (prompt-construction section) | partial (no direct orchestration analog exists yet; closest is the prompt-composition style in `generateImage`) |
| `src/core/story/director.test.ts` | test | transform | `src/lib/spend-ledger.test.ts` | role-match |
| `src/core/story/styles.ts` | config | transform | none (no config module precedent) | no analog — see below |
| `src/core/story/styles.test.ts` | test | transform | `src/lib/log-response.test.ts` | role-match |
| `src/core/story/schema.ts` | model/utility | transform | none | no analog — new zod dependency, no zod usage exists yet |
| `src/core/story/validate-scene-plan.ts` | utility | transform | `src/lib/spend-ledger.ts` (`checkCeiling`'s fail-closed validation style) | role-match (validate-and-throw/return-errors style) |
| `src/core/story/validate-scene-plan.test.ts` | test | transform | `src/lib/spend-ledger.test.ts` | role-match |
| `src/app/actions/create-story.ts` | route (Server Action) | request-response | `src/providers/image/gemini-image.ts` (orchestration + spend-ledger call site) | partial (no existing Server Action; closest is the provider-call + ceiling-gate composition) |
| `src/app/actions/generate-images.ts` | route (Server Action) | batch | `src/providers/video/veo.ts` (`generateVideo`'s ceiling-gate + provider-call + file-write sequence) | partial |
| `src/app/actions/generate-video.ts` | route (Server Action) | request-response | `src/providers/video/veo.ts` | exact (same underlying provider called directly, same ceiling-gate pattern; RESEARCH.md Pattern 3 code example is itself built from this analog) |
| `src/app/page.tsx` + `src/components/**` | component | request-response | none (no React/Next.js code exists yet in repo) | no analog — see below |
| `src/lib/spend-ledger.ts`, `src/lib/log-response.ts` (reused, not modified) | utility | request-response | themselves | n/a — reuse as-is per CONTEXT.md, no changes |

## Pattern Assignments

### `src/providers/llm/gemini.ts` (provider, request-response)

**Analog:** `src/providers/image/gemini-image.ts` (full file read, 153 lines)

**Imports pattern** (lines 1-2):
```typescript
import { GoogleGenAI } from "@google/genai";
import { logRawResponse } from "../../lib/log-response.ts";
```
Note the relative `.ts`-suffixed import (Node ESM + `type: module` requires the explicit extension) — mirror exactly for `src/providers/llm/gemini.ts` (two levels deep from `src/lib/`, same relative path).

**Primary/fallback model pattern** (lines 4-16, 45-48):
```typescript
export const IMAGE_PRICE_PER_CALL: Record<string, number> = {
  "gemini-3.1-flash-image": 0.067,
};

const PRIMARY_MODEL = "gemini-3.1-flash-image";
const FALLBACK_MODEL = "gemini-2.5-flash-image";
// ...
function isNotFoundOrForbidden(err: unknown): boolean {
  const status = (err as { status?: number; code?: number })?.status ?? (err as { code?: number })?.code;
  return status === 403 || status === 404;
}
```
For `gemini.ts`: define `LLM_PRICE_PER_CALL` (or per-token pricing per RESEARCH.md), `PRIMARY_MODEL = "gemini-3.1-pro-preview"`, `FALLBACK_MODEL = "gemini-3.8-flash"`, and reuse the same `isNotFoundOrForbidden` 403/404 classifier for the Preview-tier-unavailable fallback RESEARCH.md calls for.

**Try/fallback call pattern** (lines 66-97): the primary `generateContent` call wrapped in try/catch, re-dispatching to `FALLBACK_MODEL` on 403/404 only (rethrow otherwise), with a `console.log` fallback notice. Copy this structure verbatim for the Story Director call, swapping `config: { responseModalities: ["IMAGE"], imageConfig: {...} }` for `config: { responseMimeType: "application/json", responseSchema: buildStorySchema(sceneCount), maxOutputTokens: 16384 }` (RESEARCH.md Pitfall 2 — explicit `maxOutputTokens`, do not rely on the 8,192 default).

**Raw-response logging** (lines 99-102):
```typescript
logRawResponse(`generateContent raw response (model=${modelUsed})`, response);
```
Call this immediately after the response returns, before any JSON.parse/field access — same placement as `gemini-image.ts`.

**Classify-before-parse pattern** (lines 107-141): check `response.promptFeedback?.blockReason` first, then `candidates[0]?.finishReason`, and only then look at the actual payload (there: `inlineData.data`; here: `candidates[0].content.parts[0].text`, then `JSON.parse` it — wrap that parse in try/catch and treat a parse failure as a blocked/malformed result, not a thrown crash, mirroring the "no generic message" rule at line 130).

**Result shape convention**: every provider file returns a single result object with `usageMetadata`, `estimatedUsd`, `modelUsed`, `fallbackUsed`, `blocked`, plus a `block`/`blockReason` field on failure. `generateStory()` should return the analogous shape: `{ raw: unknown /* parsed JSON before zod validation */, usageMetadata, estimatedUsd, modelUsed, fallbackUsed, blocked, block? }`.

---

### `src/app/actions/generate-video.ts` (Server Action, request-response)

**Analog:** `src/providers/video/veo.ts` (full file, 128 lines) — directly reused unchanged; this Server Action is a thin ceiling-gate + call wrapper around it.

**Ceiling-gate + provider-call + recordSpend composition** — this is exactly RESEARCH.md's own Code Example (lines 350-364 of 02-RESEARCH.md), itself derived from the `checkCeiling`/`recordSpend` signatures in `src/lib/spend-ledger.ts` (read in full):
```typescript
// src/lib/spend-ledger.ts signatures to call:
export function checkCeiling(estimatedUsd: number, path: string = LEDGER_PATH): void; // throws CeilingExceededError
export function recordSpend(entry: LedgerEntry, path: string = LEDGER_PATH): void;
// LedgerEntry = { call: string; model: string; estimatedUsd: number; usageMetadata: unknown | null; billed: boolean; at: string }
```
Every new paid call site (LLM, image loop, video) must call `checkCeiling(estimatedUsd)` before dispatch and `recordSpend({...})` after — no bypass, matching `LEDGER_PATH`'s default (do not introduce a second ledger path for Phase 2's real story output; CONTEXT.md/RESEARCH.md do not authorize a new ledger).

---

### `src/app/actions/generate-images.ts` (Server Action, batch)

**Analog:** `src/providers/video/veo.ts`'s file-write step (lines 116-119):
```typescript
await ai.files.download({
  file: generatedVideo.video,
  downloadPath: params.outputPath,
});
```
For the image loop, mirror `gemini-image.ts`'s return of raw `Buffer` bytes (line 144: `Buffer.from(part.inlineData.data, "base64")`) and write with `node:fs` `writeFileSync(outputPath, result.bytes)` per scene, sequentially (RESEARCH.md Architecture Patterns — no parallelization, no job queue), looping `for (const scene of scenes)` and calling `checkCeiling`/`recordSpend` once per scene image, same as the video gate above.

---

### `src/core/story/validate-scene-plan.ts` (utility, transform)

**Analog pattern (fail-closed, explicit-errors style):** `src/lib/spend-ledger.ts`'s `checkCeiling`/`totalSpentUsd` — both throw or return explicit error state rather than silently passing malformed input (lines 111-118, 136-159). Apply the same "never silently trust the shape" philosophy: RESEARCH.md already provides the concrete implementation (see `02-RESEARCH.md` "Code Examples" section, `validateScenePlan`), which should be used directly — no need to invent new logic, only to place it in this file.

---

### `src/providers/llm/gemini.test.ts`, `src/core/story/*.test.ts` (test files)

**Analog:** `src/lib/spend-ledger.test.ts` (first 60 lines read) — the project's `node:test` convention:
```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
// ...
import { loadLedger, checkCeiling, /* ... */ } from "./spend-ledger.ts";

test("description of one behavior", () => {
  // arrange
  // act
  // assert.equal / assert.deepEqual / assert.throws / assert.ok
});
```
Key conventions to copy exactly:
- Import the module under test with its literal `.ts` extension (`from "./spend-ledger.ts"`), consistent with this repo's Node ESM + `type: module` setup.
- One `test(...)` call per discrete behavior, plain `node:assert/strict` — no test framework dependency, no `describe`/`beforeEach` nesting.
- For anything touching real filesystem state, use a `mkdtempSync(join(tmpdir(), "<name>-test-"))` helper (lines 22-25) — never point a test at real `storage/` paths.
- For LLM/image/video provider tests specifically, these must NOT make real network calls (no test budget) — construct fixture response objects and test the classify-before-parse / fallback branches directly by injecting or mocking `ai.models.generateContent`, following the same spirit as `spend-ledger.test.ts`'s `seedLedger`/`makeEntry` fixture-builder helpers (lines 27-41).

**`package.json` `test:lib` script must be extended** (currently, full file read):
```json
"test:lib": "node --test src/lib/spend-ledger.test.ts src/lib/log-response.test.ts"
```
Add the new Phase 2 test files to this same space-separated list (per RESEARCH.md Validation Architecture Wave 0 Gaps) — do not create a separate test script.

---

### `src/core/story/styles.ts`, `src/core/story/schema.ts`, `src/app/page.tsx` + components — No Analog Found

No prior config module, no zod usage, and no React/Next.js code exists anywhere in this repo yet (confirmed via `Glob("src/**/*")` — only `src/lib/`, `src/providers/`, `src/scripts/` exist; no `src/app/`, no `src/core/`, no `src/components/`). These three surfaces should follow RESEARCH.md's own Code Examples/Architecture Patterns directly (Pattern 1's `buildStorySchema`, the `styles.ts`/`StylePreset` example, and the Server-Actions-as-sequencing Architecture Pattern) rather than an in-repo analog.

## Shared Patterns

### Spend-ceiling gate (every paid call)
**Source:** `src/lib/spend-ledger.ts` — `checkCeiling(estimatedUsd)` throws `CeilingExceededError` before dispatch; `recordSpend(entry)` after, regardless of blocked/unblocked outcome (conservative accounting, per the file's own doc comment lines 161-169).
**Apply to:** `src/providers/llm/gemini.ts`, `src/app/actions/create-story.ts`, `src/app/actions/generate-images.ts`, `src/app/actions/generate-video.ts` — every one of these makes or triggers a paid call.

### Classify-before-parse (defensive response handling)
**Source:** `src/providers/image/gemini-image.ts` lines 107-141, `src/providers/video/veo.ts` lines 82-113 — always check block/error/finishReason fields before touching payload data; return a `blocked: true` result object rather than throwing on an ambiguous-but-non-exceptional response.
**Apply to:** `src/providers/llm/gemini.ts`'s `generateStory()` — check `promptFeedback?.blockReason` and `candidates[0]?.finishReason` (specifically watch for `finishReason === "MAX_TOKENS"` per RESEARCH.md Pitfall 2) before `JSON.parse`-ing the text.

### Raw-response logging with redaction
**Source:** `src/lib/log-response.ts` — `logRawResponse(label, value)`, reused unchanged; already redacts `data`/`imageBytes`/`videoBytes`-shaped payload keys and any `*key*/*token*/*authorization*`-shaped secret keys, handles circular refs via WeakSet.
**Apply to:** every new LLM call's raw response, called immediately after the response returns and before any parsing, same placement convention as `gemini-image.ts` line 102 and `veo.ts` line 80.

### Primary/fallback model with 403/404 classification
**Source:** `src/providers/image/gemini-image.ts` lines 45-48, 66-97 — `isNotFoundOrForbidden(err)` checks `err.status ?? err.code` for 403/404, falls back to a GA-tier model, logs a loud fallback notice, never silently swallows other errors.
**Apply to:** `src/providers/llm/gemini.ts` — `gemini-3.1-pro-preview` (Preview-tier, may 403/404) falling back to `gemini-3.8-flash` (GA), per RESEARCH.md's explicit recommendation and Assumption A1's stated no-code-change-needed fallback.

### `node:test` unit-test convention
**Source:** `src/lib/spend-ledger.test.ts`, `src/lib/log-response.test.ts` — plain `node --test`, `node:assert/strict`, one `test()` per behavior, relative `.ts`-suffixed imports, tmp-dir fixtures for anything filesystem-touching, no framework dependency.
**Apply to:** all five new `*.test.ts` files this phase adds; extend `package.json`'s `test:lib` script (currently only lists the two Phase 1 files) to include them.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/core/story/styles.ts` | config | transform | No prior config-module pattern in this repo; follow RESEARCH.md's `StylePreset`/`STYLE_PRESETS` example directly |
| `src/core/story/schema.ts` | model | transform | No zod usage exists yet anywhere in the codebase; follow RESEARCH.md Pattern 1's `buildStorySchema` shape, ported to a zod schema for `.safeParse()` |
| `src/app/page.tsx`, `src/app/layout.tsx`, `src/components/**` | component | request-response | No React/Next.js code exists in this repo at all yet (`src/app/` does not exist — confirmed via directory listing) — this is this phase's own scaffold deliverable (RESEARCH.md Common Pitfall #5, Environment Availability table), follow RESEARCH.md's Recommended Project Structure and Architecture Diagram directly rather than an in-repo analog |

## Metadata

**Analog search scope:** `src/lib/`, `src/providers/image/`, `src/providers/video/`, `src/scripts/` (only existing source directories; confirmed via `Glob("src/**/*")` there is no `src/app/`, `src/core/`, or `src/components/` yet)
**Files scanned:** 7 (`gemini-image.ts`, `veo.ts`, `spend-ledger.ts`, `spend-ledger.test.ts`, `log-response.ts`, `log-response.test.ts` — full reads; `package.json` — full read)
**Pattern extraction date:** 2026-09-12
