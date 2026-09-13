---
phase: 03-persistence-structural-uniqueness
fixed_at: 2026-09-13T16:16:34Z
review_path: .planning/phases/03-persistence-structural-uniqueness/03-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-09-13T16:16:34Z
**Source review:** .planning/phases/03-persistence-structural-uniqueness/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (all Warning findings; 0 Critical findings existed; Info findings excluded per `fix_scope: critical_warning`)
- Fixed: 5
- Skipped: 0

**Verification environment:** `workflow.use_worktrees` is `false` in `.planning/config.json`, so this run edited and committed directly in the main checkout (no isolated worktree, no temp branch). All verification below (`tsc --noEmit`, `node --test`, `node src/scripts/check-boundaries.ts`) ran in that same main checkout, so the numbers are reproducible from the tree as it now stands. No real paid provider call was made anywhere in this run (all commands were static typecheck / unit tests against fakes and temp ledger paths / the import-specifier scanner) -- required given the $3.00 DEV_CEILING_USD gate was at $2.9870/$3.00 (only $0.013 headroom) at the start of this run.

## Fixed Issues

### WR-01: Uniqueness-gate spend dual-write records `billed: true` for a blocked Story Director attempt that the real ledger recorded as `billed: false`

**Files modified:** `src/core/story/director.ts`, `src/core/uniqueness/check.ts`
**Commit:** 8eefc50
**Applied fix:** Added a required `billed: boolean` field to `StoryDirectorFailure` (director.ts), set explicitly at each of the three failure return sites -- `false` for `reason: "blocked"` (mirroring the `billed: !result.blocked` already passed to `recordSpend` two lines above it), `true` for `"parse_failed"`/`"validation_failed"` (neither of which was blocked). `check.ts`'s `runUniqueStoryDirector` now reads `directorResult.billed` instead of hardcoding `true` in its `PendingGenerationRecord` push, so the durable audit-trail record agrees with the real spend-ledger entry for the same dispatched attempt on every failure reason, not just two of the three. Matched the exact semantics already correct in `director.ts:223-230` as instructed. No existing test constructs a `StoryDirectorResult` failure object directly (all fakes in `check.test.ts` return success results or throw `CeilingExceededError`), so the new required field is a type-safe additive change with no fixture updates needed -- confirmed by a clean `tsc --noEmit` and all 31 tests in `check.test.ts`/`director.test.ts` passing unchanged.

### WR-02: `check-boundaries.ts` is not wired into any npm script

**Files modified:** `package.json`
**Commit:** cde60fa
**Applied fix:** Appended `&& node src/scripts/check-boundaries.ts` to the `test:lib` script, exactly as the review's fix suggestion proposed, so the four structural invariants (client bundle never imports a provider/ledger/Prisma/db module; `src/app/actions/` reaches the LLM and database only through `src/core/`; no unchecked raw-query escape hatch) run on every `npm run test:lib` invocation instead of only when a developer remembers to type the command by hand. Verified by running `npm run test:lib`: all 123 unit tests pass followed by all four `OK:` boundary-check lines with exit code 0.

### WR-03: `check-boundaries.ts`'s invariants only inspect each file's own direct import specifiers, not transitive imports

**Files modified:** `src/scripts/check-boundaries.ts`
**Commit:** 13e53fe
**Applied fix:** Took the review's cheaper, lighter-weight option (explicitly offered as an alternative to a full transitive-import-graph walk) rather than over-engineering a graph walk for a script whose entire design premise is "dependency-free, string-match each file's own specifiers": added `"core/persistence"` to invariant 1's forbidden-substring list, so a `"use client"` file that imports `@/core/persistence/story-repository` (or `generation-repository`) directly is now caught even though neither of those files' own import specifiers contain `lib/db` or `@prisma/client` in the client file's own import line. Reasoning for not doing the full graph walk: the review itself frames this as "more work, most correct" vs. "cheaper, catches the most likely real mistake," and the most likely real mistake -- a client component reaching straight into the persistence layer instead of going through a Server Action -- is exactly what the added substring now catches. A full transitive walk would also need to handle cycles, re-exports, and type-only vs. value imports correctly to avoid false positives/negatives, which is disproportionate to a boundary gate with zero live violations today. Updated the file's header comment to document the new coverage and the direct-vs-transitive limitation explicitly, so a future reader doesn't mistake this for a full graph walk. Verified by running `node src/scripts/check-boundaries.ts` directly: all four `OK:` lines print, exit code 0 (no live violation exists, matching the review's own finding).

### WR-04: `generateStory`'s returned `estimatedUsd` reflects the pre-fallback model's price even after a 403/404 fallback

**Files modified:** `src/providers/llm/gemini.ts`
**Commit:** 9309436
**Applied fix:** Applied the review's fix suggestion exactly -- changed `LLM_PRICE_PER_CALL[primaryModel]` to `LLM_PRICE_PER_CALL[modelUsed]` when computing `estimatedUsd`, so a genuine 403/404 fallback (where `modelUsed` is reassigned to `FALLBACK_MODEL`) reports the cheaper fallback model's price instead of the more expensive primary model's price it never actually dispatched. Confirmed `director.ts`'s `runStoryDirector` still computes its own independent conservative `Math.max(...)` estimate for the real ceiling check (unaffected by this field), so this fix only corrects the public `GenerateStoryResult.estimatedUsd` value a future caller (or `gemini.test.ts`'s "positive estimated cost" assertions) would read. Verified by a clean `tsc --noEmit` and all 11 tests in `gemini.test.ts` passing unchanged (none of them exercise `generateStory`'s fallback branch directly -- they test `classifyStoryResponse`/`classifyComparisonResponse`, which take `estimatedUsd` as a parameter, so the fix is inert to those existing fixtures and no real Gemini call was needed to verify it).

### WR-05: No length cap on the wife's free-text `idea`/`characterDescription` before it reaches a flat-estimated paid call

**Files modified:** `src/core/story/input-limits.ts` (new file), `src/app/actions/create-story.ts`, `src/components/story/CreateStoryForm.tsx`
**Commit:** 8078810
**Applied fix:** Created a small shared constants module (`src/core/story/input-limits.ts`, exporting `MAX_IDEA_LENGTH` and `MAX_CHARACTER_DESCRIPTION_LENGTH`, both `4000`) rather than duplicating the same magic number in both the client component and the server action -- `create-story.ts` is a `"use server"` file and can only export async functions, so a plain constant could not be exported from it for the client to import; a tiny shared sibling module was the minimal correct way to keep the two enforcement points from silently drifting apart. Added `maxLength={MAX_IDEA_LENGTH}` / `maxLength={MAX_CHARACTER_DESCRIPTION_LENGTH}` to both `<textarea>`s in `CreateStoryForm.tsx` for immediate client-side feedback, and added a server-side re-validation in `createStoryAction` (alongside the existing empty-string check, before `runUniqueStoryDirector`/`checkCeiling` are ever reached) that rejects an over-length submission with the same plain-language-sentence convention the rest of that function already uses -- since a client-side `maxLength` alone is not a real enforcement boundary. Picked `4000` characters (top of the review's suggested 2000-4000 range) to stay generous for a genuine long-form idea while still bounding the worst case against the flat `$0.05` ceiling-gate estimate. Verified by a clean `tsc --noEmit` (this file creation exercised the module-resolution path for both the `"../../core/story/input-limits.ts"` relative import in the server action and the `"@/core/story/input-limits"` alias import in the client component).

## Skipped Issues

None -- all 5 in-scope findings were fixed.

---

_Fixed: 2026-09-13T16:16:34Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
