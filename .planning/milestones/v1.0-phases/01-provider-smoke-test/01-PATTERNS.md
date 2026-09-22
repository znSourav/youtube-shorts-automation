# Phase 1: Provider Smoke Test - Pattern Map

**Mapped:** 2026-09-12
**Files analyzed:** 8 (new; 0 modified)
**Analogs found:** 0 / 8

## No Codebase Analogs Exist

This is the project's first phase. `[VERIFIED: directory listing, 2026-09-12]` the working directory contains only `.claude/`, `.git/`, and `.planning/` — no `package.json`, no `src/`, no prior source code of any kind. `git ls-files` was not run for analog verification because there is nothing tracked yet to search.

There is nothing to search for analogs against. Rather than fabricate role/data-flow matches against non-existent files, this document records the file list, role/data-flow classification, and points the planner directly at RESEARCH.md's `## Code Examples` and `## Architecture Patterns` sections, which are the actual pattern source for this phase (empirically-flagged, not blindly copied from vendor docs — see RESEARCH.md Pitfall 1).

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|-----------------|---------------|
| `package.json` | config | — | none | no analog (first file) |
| `tsconfig.json` | config | — | none | no analog |
| `.gitignore` | config | — | none | no analog |
| `.env.local.example` | config | — | none | no analog |
| `src/lib/spend-ledger.ts` | utility | CRUD (local JSON read/write) | none | no analog |
| `src/providers/image/gemini-image.ts` | service | request-response (external API call) | none | no analog |
| `src/providers/video/veo.ts` | service | request-response + polling (long-running op) | none | no analog |
| `src/scripts/smoke-test.ts` | script (CLI entry point) | event-driven / batch (sequential orchestration) | none | no analog |

No `test` role file is listed: per RESEARCH.md's Validation Architecture, the smoke-test script itself is Phase 1's only verification artifact — there is no separate test framework in scope this phase.

## Pattern Assignments

Since no codebase analogs exist, the planner should treat the following RESEARCH.md sections as the authoritative pattern source for each file (all are pre-verified against live docs and, where flagged, marked for first-call empirical confirmation):

### `src/providers/image/gemini-image.ts` (service, request-response)
**Pattern source:** RESEARCH.md → `## Code Examples` → "Minimal Gemini image generation call" (lines ~246-274 of RESEARCH.md)
- Imports: `import { GoogleGenAI } from "@google/genai";`
- Auth: `new GoogleGenAI({})` — picks up `GEMINI_API_KEY`/`GOOGLE_API_KEY` from env automatically, no manual key wiring
- Core pattern: `ai.models.generateContent({ model: "gemini-3.1-flash-image", contents, config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "9:16" } } })`
- **Mandatory first-call step:** `console.log(JSON.stringify(response, null, 2))` before writing any parsing code (RESEARCH.md Pitfall 1 — vendor docs are internally inconsistent about this exact shape)
- Error/block handling: classify `response.promptFeedback?.blockReason` and `candidate.finishReason` BEFORE checking for `inlineData` bytes — see Pattern 1 below (RESEARCH.md `## Architecture Patterns` → "Pattern 1: Defensive response inspection")

### `src/providers/video/veo.ts` (service, request-response + polling)
**Pattern source:** RESEARCH.md → `## Code Examples` → "Veo 3.1 Lite image-to-video with polling and download" (lines ~278-302)
- Core pattern: `ai.models.generateVideos({ model: "veo-3.1-lite-generate-preview", prompt, image: { imageBytes, mimeType }, config: { aspectRatio: "9:16", resolution: "720p", durationSeconds: "8" } })`
- Polling: `while (!operation.done) { await sleep(10000); operation = await ai.operations.getVideosOperation({ operation }); }` — do not hand-roll; use SDK method exactly as shown (RESEARCH.md `## Don't Hand-Roll`)
- Error/block handling: check `operation.response?.raiMediaFilteredCount`/`raiMediaFilteredReasons` before assuming success once `operation.done === true`
- Download: `ai.files.download({ file, downloadPath })` — SDK handles auth header automatically, do not hand-roll fetch+auth

### `src/lib/spend-ledger.ts` (utility, CRUD on local JSON)
**Pattern source:** RESEARCH.md `## Architecture Patterns` → System Architecture Diagram, steps 1-2, and `## Don't Hand-Roll` key insight (this is the one genuinely custom piece of plumbing this phase writes)
- Functions: `loadLedger()`, `checkCeiling(estimatedCost)`, `recordSpend(actualCost)`
- Storage: flat JSON file at `storage/_smoketest/spend-ledger.json`
- Ceiling: hard-coded `$3.00` (D-05), checked before every paid call, refuses with a clear message rather than firing over budget
- Cost figures: RESEARCH.md `## Code Examples` → "Cost calculation" — `IMAGE_PRICE_PER_CALL`, `VIDEO_PRICE_PER_SECOND` constants; cross-check against `usageMetadata` per Open Question 2

### `src/scripts/smoke-test.ts` (CLI orchestration)
**Pattern source:** RESEARCH.md `## Architecture Patterns` → System Architecture Diagram (full sequence)
- Sequence: load ledger → check ceiling → generate generic-plumbing image → generate child-protagonist image (D-01) → generate video from second image → print cost summary
- Run command: `node --env-file=.env.local src/scripts/smoke-test.ts` (no `tsx`/`ts-node`/`dotenv` — Node 24 native)

### `package.json`, `tsconfig.json`, `.gitignore`, `.env.local.example` (config)
**Pattern source:** RESEARCH.md Pitfall 4 and `## Wave 0 Gaps`
- `package.json`: dependencies `@google/genai@^2.22.0`; devDependencies `typescript@7.0.2`, `@types/node@22.20.2`
- `.gitignore`: must exclude `.env.local` and `storage/_smoketest/*.png`, `*.mp4` before either file type is created (security: never commit the API key or throwaway binaries)
- `.env.local.example`: placeholder-filled, establishes the `.env.local` convention Phase 2+ / SECURITY-01 will follow

## Shared Patterns

### Defensive response classification (applies to both provider files)
**Source:** RESEARCH.md `## Architecture Patterns` → "Pattern 1: Defensive response inspection"
**Apply to:** `gemini-image.ts` and `veo.ts` — always inspect block/finish/RAI-filter fields before checking for success bytes; never infer failure solely from absent bytes (RESEARCH.md Pitfall 2).

### Spend-ceiling gate (applies to both provider call sites)
**Source:** `src/lib/spend-ledger.ts`'s `checkCeiling()`, invoked from `smoke-test.ts` before every paid call (D-04).
**Apply to:** Every call into `gemini-image.ts` and `veo.ts` from the orchestration script — no direct provider invocation should bypass the ledger check.

### Output path segregation
**Source:** D-06 — all generated artifacts go to `storage/_smoketest/`, never `storage/stories/<id>/`.
**Apply to:** Every `writeFileSync`/`download` call in both provider files and the ledger file itself.

## No Analog Found

All 8 files listed above have no codebase analog — this is expected and correct for a greenfield first phase. Planner should build plan actions directly from the RESEARCH.md Code Examples and Architecture Patterns cited above rather than from an analog file.

## Metadata

**Analog search scope:** Entire working directory (`.`), confirmed empty of source code via direct `ls`/`find` at phase start.
**Files scanned:** 0 (none exist)
**Pattern extraction date:** 2026-09-12
