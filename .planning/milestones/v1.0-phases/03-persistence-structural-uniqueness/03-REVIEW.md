---
phase: 03-persistence-structural-uniqueness
reviewed: 2026-09-14T00:00:00Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - .env.local.example
  - .gitignore
  - next.config.ts
  - package.json
  - prisma.config.ts
  - prisma/migrations/20260913102648_init/migration.sql
  - prisma/schema.prisma
  - src/app/actions/create-story.ts
  - src/app/actions/generate-images.ts
  - src/app/actions/generate-video.ts
  - src/app/actions/load-story.ts
  - src/app/page.tsx
  - src/components/story/CreateStoryForm.tsx
  - src/components/story/StoryReview.tsx
  - src/core/persistence/generation-repository.test.ts
  - src/core/persistence/generation-repository.ts
  - src/core/persistence/story-repository.ts
  - src/core/persistence/story-view.test.ts
  - src/core/persistence/story-view.ts
  - src/core/story/director.ts
  - src/core/story/schema.ts
  - src/core/story/story-id.ts
  - src/core/uniqueness/check.test.ts
  - src/core/uniqueness/check.ts
  - src/core/uniqueness/fingerprint.ts
  - src/core/uniqueness/similarity.test.ts
  - src/core/uniqueness/similarity.ts
  - src/lib/db.test.ts
  - src/lib/db.ts
  - src/providers/llm/gemini.test.ts
  - src/providers/llm/gemini.ts
  - src/scripts/check-boundaries.ts
  - src/scripts/persistence-probe.ts
  - src/scripts/story-probe.ts
  - src/scripts/uniqueness-probe.ts
  - src/types/better-sqlite3.d.ts
findings:
  critical: 0
  warning: 5
  info: 3
  total: 8
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-09-14T00:00:00Z
**Depth:** standard
**Files Reviewed:** 34
**Status:** issues_found

## Summary

Reviewed the Prisma/SQLite persistence layer, the structural-uniqueness gate (Jaccard pre-filter + LLM tie-breaker + bounded regeneration loop), the Server Actions and components that consume them, and the CLI probes/boundary-checker. The core safety properties called out in the review brief hold up under adversarial reading:

- Every provider-calling function (`runStoryDirector`, `compareViaLlm`) gates on `checkCeiling` immediately before dispatch and calls `recordSpend` immediately after, with no second call site that could bypass it.
- `similarity.ts`'s tokenizer genuinely uses `\p{L}`/`\p{N}` with the `u` flag (not an ASCII-only class), and `jaccardSimilarity` correctly returns `0`, not `1`, when either token set is empty — verified against `similarity.test.ts`'s Bangla-script fixture and the explicit empty/empty case.
- No raw provider prompt, model id, filesystem path, or provider error string reaches client-rendered text anywhere in `src/app/actions/` or the reviewed components — every failure path maps to a fixed plain-language sentence, and `console.error`/`console.log` diagnostics stay server-side.
- No `src/app/actions/` file imports `@prisma/client`, `src/generated/prisma`, or `src/lib/db` directly — every write/read goes through `src/core/persistence/`.
- No `$queryRawUnsafe`/`$executeRawUnsafe` exists anywhere under `src/` (independently grepped, not just trusted from `check-boundaries.ts`'s own self-report).
- Every path written into a Prisma column (`imagePath`/`videoPath`) is produced by `storage-paths.ts`'s builders (`sceneImagePath`/`sceneVideoPath`), never accepted raw from a model or client.
- `generation-repository.ts`'s four exported functions are genuinely best-effort: each wraps its own write in try/catch, logs once, and never throws — confirmed both by reading the code and by `generation-repository.test.ts`'s "logs exactly once and returns without throwing" tests.

No Critical/blocker-level defect was found. Eight lower-severity findings below are worth fixing: one genuine data-integrity bug in the uniqueness gate's spend dual-write, a couple of gaps in how forcefully the project's own structural invariants are actually enforced, and some dead code / minor semantic mismatches.

**Review scope caveat:** `.env.local.example` was in the required file list but this session's sandbox permissions denied both `Read` and `Bash cat` access to it (directory-level deny, not file-specific). Its contents could not be independently verified as placeholder-only. Given the filename and the project's `.gitignore` (which explicitly negates `!.env.local.example` to keep it tracked while ignoring the real `.env.local`), this is very likely just a template, but a human should confirm it holds no live credential before treating this review as covering that file.

## Warnings

### WR-01: Uniqueness-gate spend dual-write records `billed: true` for a blocked Story Director attempt that the real ledger recorded as `billed: false`

**File:** `src/core/uniqueness/check.ts:370-394`
**Issue:** `runUniqueStoryDirector` pushes one `PendingGenerationRecord` per dispatched Story Director attempt for durability (the `GenerationRecord` dual-write). For a failed attempt (`!directorResult.ok`, covering `reason: "blocked" | "parse_failed" | "validation_failed"`), it unconditionally sets `billed: true` (line 390). But the *real* ledger write happens inside `runStoryDirector` (`director.ts:223-230`), which uses `billed: !result.blocked` — i.e. `false` specifically when `result.blocked` is `true` (the "blocked" failure reason). So for the "blocked" reason specifically, the durable `GenerationRecord` row will say `billed: true` while the actual spend-ledger entry for that same dispatched call says `billed: false`. For `"parse_failed"`/`"validation_failed"` the two agree (both `true`), since those responses were not blocked. This doesn't affect the real ledger (the enforcement mechanism is untouched), but it corrupts the audit trail for exactly the failure mode (content-safety block) an operator would most want to inspect after the fact.
**Fix:** Thread the real `result.blocked` value through, e.g. have `StoryDirectorFailure` carry a `billed: boolean` field set by `runStoryDirector` (mirroring its own `recordSpend` call), and use that instead of a hardcoded `true` in `check.ts`:
```ts
// director.ts — StoryDirectorFailure
export interface StoryDirectorFailure {
  ok: false;
  reason: "blocked" | "parse_failed" | "validation_failed";
  detail: string;
  blockReason?: string;
  issues?: string[];
  billed: boolean; // mirrors the exact value passed to recordSpend for this attempt
}
// ...
if (result.blocked) {
  return { ok: false, reason: "blocked", detail: /* ... */, blockReason: result.block?.reason, billed: false };
}
```
```ts
// check.ts
: {
    generationType: GenerationType.STORY,
    model: "unknown (story director attempt failed before model attribution)",
    estimatedUsd: Math.max(...Object.values(LLM_PRICE_PER_CALL)),
    actualUsd: null,
    billed: directorResult.billed,
    ok: false,
    message: "The story could not be generated.",
  },
```

### WR-02: `check-boundaries.ts` is not wired into any npm script

**File:** `package.json:9-18`, `src/scripts/check-boundaries.ts:1-27`
**Issue:** `check-boundaries.ts`'s own header comment claims it "asserts invariants that a one-time code review cannot re-verify on every commit," and it is the mechanism the review brief points to for structurally enforcing that the client bundle never gets Prisma/the spend ledger and that `src/app/actions/` never bypasses `src/core/persistence/`. But `package.json`'s `scripts` block (`dev`, `build`, `start`, `lint`, `typecheck`, `test:lib`, `smoke`, `postinstall`) does not include it anywhere, and it isn't referenced by `lint` or `test:lib`. It only runs when a developer remembers to type `node src/scripts/check-boundaries.ts` by hand (as some `.planning/` plan files document doing manually). A future change that violates one of its four invariants would ship silently until someone thinks to run it.
**Fix:** Add it to a script that runs on every `build`/`test:lib` invocation, e.g.:
```json
"scripts": {
  "test:lib": "node --test ... && node src/scripts/check-boundaries.ts",
  "verify": "npm run typecheck && npm run test:lib && node src/scripts/check-boundaries.ts"
}
```

### WR-03: `check-boundaries.ts`'s invariants only inspect each file's own direct import specifiers, not transitive imports

**File:** `src/scripts/check-boundaries.ts:84-161`
**Issue:** Invariant 1 (no `"use client"` file may import a provider/spend-ledger/Prisma/db module) and invariants 2/3 (`src/app/actions/` must reach the LLM/database only through `src/core/`) work by string-matching each file's own `import ... from "..."` specifiers against a fixed substring list (`"/providers/"`, `"spend-ledger"`, `"@prisma/client"`, `"/generated/prisma"`, `"lib/db"`, `"/providers/llm/"`). None of these substrings match `"core/persistence/story-repository"` or `"core/persistence/generation-repository"` — which themselves *do* import `lib/db` and `@prisma/client` types. Today no `"use client"` file imports the persistence layer directly (verified: `page.tsx`, `CreateStoryForm.tsx`, `StoryReview.tsx` only import action wrappers and types), so there is no live violation. But the check itself would not catch it if one did: a `"use client"` component that imported `@/core/persistence/story-repository` directly would ship database-access code into the client bundle and this gate would still print "OK: no \"use client\" file imports a provider, the spend ledger, or the database layer." The gate protects against direct violations only, not violations one import hop away, despite the header comment implying it is the unskippable enforcement for this exact invariant.
**Fix:** Either walk the transitive import graph (more work, most correct), or at minimum add `"core/persistence"` to invariant 1's forbidden-substring list for client files (cheaper, catches the most likely real mistake — a client component reaching straight into the persistence layer instead of through a Server Action).

### WR-04: `generateStory`'s returned `estimatedUsd` reflects the pre-fallback model's price even after a 403/404 fallback

**File:** `src/providers/llm/gemini.ts:182-215`
**Issue:** `generateStory` computes `estimatedUsd` from `primaryModel` (line 213: `LLM_PRICE_PER_CALL[primaryModel] ?? LLM_PRICE_PER_CALL[PRIMARY_MODEL]`) — the model it *intended* to call before any fallback — not from `modelUsed`, which is reassigned to `FALLBACK_MODEL` when the primary 403/404s (lines 200-201). So after a genuine fallback, `GenerateStoryResult.estimatedUsd` reports the more expensive primary model's price (`0.05`) even though the cheaper fallback (`0.01`) is what was actually dispatched and is named correctly in `modelUsed`. This is currently inert in production: `director.ts`'s `runStoryDirector` never reads `result.estimatedUsd` — it computes its own conservative `Math.max(...)` estimate independently for the real ceiling check. But the field is public API on `GenerateStoryResult`, is asserted on directly in `gemini.test.ts` ("a positive estimated cost"), and is exactly the kind of value a future caller would reasonably wire into a cost display or the ledger without realizing it silently ignores fallback.
**Fix:**
```ts
const estimatedUsd = LLM_PRICE_PER_CALL[modelUsed] ?? LLM_PRICE_PER_CALL[PRIMARY_MODEL];
return classifyStoryResponse(response, modelUsed, fallbackUsed, estimatedUsd);
```

### WR-05: No length cap on the wife's free-text `idea`/`characterDescription` before it reaches a flat-estimated paid call

**File:** `src/app/actions/create-story.ts:49-54`, `src/components/story/CreateStoryForm.tsx:57-63,68-74`
**Issue:** `createStoryAction` only checks `input.idea.trim()`/`input.characterDescription.trim()` for non-emptiness; there is no maximum length enforced client-side (no `maxLength` on either `<textarea>`) or server-side before the string is concatenated into the Story Director prompt (`buildStoryPrompt`) and dispatched. `checkCeiling` gates on a fixed, conservative *flat* per-call estimate (`Math.max(...Object.values(LLM_PRICE_PER_CALL))`, i.e. `$0.05`) regardless of prompt size — this estimate is documented as conservative against *typical* usage, but Gemini's real per-token billing scales with input length, so an unusually long pasted idea/character description could cause the actual cost of a single call to exceed the amount the ceiling gate reserved for it, undermining the "every paid provider call must pass a pre-flight check ... no exceptions" hard-cap guarantee for that one call.
**Fix:** Add a reasonable max length (e.g. 2000-4000 characters) enforced both in `CreateStoryForm`'s `<textarea maxLength=...>` and re-validated in `createStoryAction` alongside the existing empty-string check, returning the same kind of plain-language rejection message used elsewhere in that function.

## Info

### IN-01: `markUniquenessStatus` is dead code

**File:** `src/core/persistence/story-repository.ts:150-159`
**Issue:** `markUniquenessStatus` is exported but never called anywhere in `src/` (verified by grep across the whole tree — the only match is its own declaration). `uniquenessStatus` is in practice only ever set once, at creation time, via `saveStoryWithScenes`'s `data.uniquenessStatus` field; nothing in the codebase transitions a story's status after the fact.
**Fix:** Either remove the function until something needs it, or add the call site it was presumably written for (e.g. a future "wife dismisses the exhaustion warning and keeps the story" action), with a comment explaining which future plan owns wiring it up.

### IN-02: `regenerationAttempt` stores a 1-based attempt count, not a count of regenerations, despite its name

**File:** `prisma/schema.prisma:64`, `src/app/actions/create-story.ts:99`
**Issue:** `createStoryAction` passes `result.attempt` straight into `saveStoryWithScenes`'s `regenerationAttempt` parameter. `runUniqueStoryDirector`'s `attempt` counter is 1-based and includes the *first* (non-regenerated) attempt — a story accepted on the very first try with zero collisions is stored with `regenerationAttempt = 1`, not `0`. The column name reads as "how many times this story was regenerated," which for a first-try accept is genuinely zero.
**Fix:** Either rename the column/field to `attemptNumber` (matches what's actually stored), or store `result.attempt - 1` so the column means what its name says. Low impact today since nothing reads this column back for logic, only for the stored record.

### IN-03: `generateSceneVideoAction`'s pre-dispatch read failure message doesn't distinguish "file missing" from "unrecognized extension"

**File:** `src/app/actions/generate-video.ts:131-148`
**Issue:** `readFileSync(imagePath)` and `mimeTypeForImagePath(imagePath)` (which throws `Cannot infer mimeType for "...": unrecognized extension "..."` for any extension other than `.jpg/.jpeg/.png/.webp`) are both wrapped in one try/catch that always reports `"The scene's image could not be read, so no video could be generated."` This is still a safe, plain-language message (no path/error leaks), but it's inaccurate for the unrecognized-extension case, which is a different failure than a missing/unreadable file and would need a different fix.
**Fix:** Catch and classify the two cases separately, or at minimum log the distinguishing detail server-side (the `console.error` two lines above already includes `err`, so this is a message-wording nit, not a missing-diagnostics issue).

---

_Reviewed: 2026-09-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
