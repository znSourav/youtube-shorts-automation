---
phase: 02-core-generation-pipeline
fixed_at: 2026-09-13T00:00:00Z
review_path: .planning/phases/02-core-generation-pipeline/02-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-09-13T00:00:00Z
**Source review:** .planning/phases/02-core-generation-pipeline/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 5 (1 critical, 4 warning; Info findings excluded per `fix_scope: critical_warning`)
- Fixed: 5
- Skipped: 0

**Verification environment:** `workflow.use_worktrees` is `false` in `.planning/config.json`, so per the documented opt-out all edits, verification, and commits ran directly in the main checkout (no isolated worktree was created). All numbers below (typecheck, unit tests, boundary-script run) are reproducible from this same working tree.

## Fixed Issues

### CR-01: Video spend accounting under-counts a timed-out/blocked call, unlike every other paid path in this codebase

**Files modified:** `src/app/actions/generate-video.ts`
**Commit:** f3f6fdd
**Applied fix:** Read `src/providers/video/veo.ts` to confirm the exact dispatch/timeout boundary before editing, per the review's own caveat. Confirmed that `generateVideo()` only *returns* (rather than throwing) after its initial `ai.models.generateVideos()` call has already succeeded and returned an operation — the `timedOut`, `blocked`, and success outcomes are all post-dispatch results of that same already-billed call. The earlier catch block in `generateSceneVideoAction` (which does not call `recordSpend` at all) already covers the "call never dispatched" case (e.g. a thrown network error before any operation was created). Changed `billed: Boolean(result.filePath)` to `billed: true` unconditionally at the `recordSpend` call site, matching the "any dispatched call counts, including a blocked one" convention used in `director.ts:188` and `generate-images.ts:153`. Verified with `tsc --noEmit` (clean) and Tier 1 re-read; no real Veo API call was made.

### WR-01: `sceneImagePath`'s `extension` parameter is concatenated into the path with no shape validation

**Files modified:** `src/core/storage-paths.ts`
**Commit:** ed657e5
**Applied fix:** Added `EXTENSION_PATTERN = /^[a-z0-9]+$/i` alongside the existing `STORY_ID_PATTERN`, and made `sceneImagePath` throw `Invalid file extension "..."` when the leading-dot-stripped extension doesn't match it — closing the path-injection gap the review identified (a value like `"../../evil"` surviving the single-character `.replace(/^\./, "")` strip). Applied exactly as suggested in REVIEW.md. Verified with `tsc --noEmit` (clean) and `node --test src/core/storage-paths.test.ts` (26/26 pass, including the three existing extension-shaped cases: `jpg`, `webp`, `.png`).

### WR-02: A filesystem write failure mid-loop discards every already-generated scene status in `generateSceneImagesAction`

**Files modified:** `src/app/actions/generate-images.ts`
**Commit:** a885b58
**Applied fix:** Wrapped the `mkdirSync`/`writeFileSync` pair in a try/catch that pushes a failed-but-plain-language status for the affected scene and `continue`s the loop **without** setting `stopped`, so a local write failure (locked file, full disk, permissions) on one scene does not discard the `statuses` accumulated for prior scenes, and does not block subsequent scenes' already-budgeted attempts. Matches the review's suggested fix verbatim, including the "do not set `stopped`" rationale (the paid call already succeeded; only the local write failed). Verified with `tsc --noEmit` (clean) and Tier 1 re-read of the modified loop body.

### WR-03: `check-boundaries.ts`'s client-bundle scan does not cover `src/app/*.tsx`, so a violation in `page.tsx` would go undetected

**Files modified:** `src/scripts/check-boundaries.ts`
**Commit:** 625a848
**Applied fix:** Replaced the `f.includes("src/components/")` filter with a scan for any `.ts`/`.tsx` file containing a `"use client"` directive (matching `/^["']use client["'];?/m`), per the review's suggested fix. Also updated the header comment (invariant 1's description) and the passing-case console message to describe the new, broader scope accurately rather than leaving stale "src/components/"-only language. Verified with `tsc --noEmit` (clean) and by actually running the script (`node src/scripts/check-boundaries.ts`), which now scans `src/app/page.tsx` too and reports both invariants OK — no purely-local execution, no real provider call.

### WR-04: No server-side guard against a whitespace-only idea/character description triggering a paid Story Director call

**Files modified:** `src/app/actions/create-story.ts`
**Commit:** de86504
**Applied fix:** Added a `.trim()` emptiness check on `input.idea` and `input.characterDescription` at the top of `createStoryAction`, before `runStoryDirector` (and therefore before `checkCeiling`/the Gemini dispatch) is ever reached, returning the same plain-language error the review suggested. `src/components/story/CreateStoryForm.tsx` (also referenced in the finding's **File:** line) was left unmodified — the review's Fix section only proposes a server-side guard, and adding it fully closes the gap regardless of what the client-side `required` attribute does or doesn't catch. Verified with `tsc --noEmit` (clean); no test file exists yet for this action, so verification was Tier 1 (re-read) + Tier 2 (typecheck) only.

## Skipped Issues

None — all in-scope findings were fixed.

---

_Fixed: 2026-09-13T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
