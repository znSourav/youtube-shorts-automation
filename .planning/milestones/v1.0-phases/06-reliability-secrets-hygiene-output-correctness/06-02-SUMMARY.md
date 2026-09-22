---
phase: 06-reliability-secrets-hygiene-output-correctness
plan: 02
subsystem: reliability
tags: [nextjs, server-actions, google-genai, gemini, veo, timeouts, error-handling]

# Dependency graph
requires:
  - phase: 06-reliability-secrets-hygiene-output-correctness
    plan: 01
    provides: assertApiKeyConfigured/MissingApiKeyError pre-flight guard pattern (mirrored here for the block-classification selectors); check-boundaries.ts/secrets-audit.ts as the two automated structural gates this plan's invariants 8/9 extend
provides:
  - "src/core/config/provider-timeouts.ts -- LLM_HTTP_TIMEOUT_MS/IMAGE_HTTP_TIMEOUT_MS/VIDEO_HTTP_TIMEOUT_MS, imported by all six Google GenAI call sites"
  - "veo.ts's VideoBlockKind/plainLanguageVideoBlockMessage discriminator -- mirrors gemini-image.ts's stage pattern for the video provider"
  - "director.ts's StoryBlockStage/plainLanguageStoryBlockMessage selector -- the same pattern for the Story Director"
  - "check-boundaries.ts invariant 8 (timeout coverage) and invariant 9 (D-02 increment-ordering) -- future provider files/generate-video.ts edits are held to both structurally"
affects: [06-03, 06-04, 06-05]

# Actuals (#2632)
actuals:
  tokens: 9424
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Per-attempt HTTP timeout via httpOptions.timeout on every Google GenAI config object, sourced from one leaf constants module (provider-timeouts.ts) so a loop-level bound (POLL_TIMEOUT_MS) and a per-call bound never get conflated"
    - "blockKind/blockStage discriminator + guard-then-fall-through plainLanguage*Message selector, extended from gemini-image.ts's already-correct pattern to veo.ts and director.ts -- classify the real cause server-side, return one of a small set of named constants, never a raw provider string"
    - "Structural invariant pairs in check-boundaries.ts (content-scan + import-scan for invariant 8, string-ordering scan for invariant 9) that fail the build on regression rather than relying on code review to re-catch a closed gap"

key-files:
  created:
    - src/core/config/provider-timeouts.ts
    - src/providers/video/veo.test.ts
  modified:
    - src/providers/llm/gemini.ts
    - src/providers/image/gemini-image.ts
    - src/providers/video/veo.ts
    - src/core/budget/dispatch-chain.ts
    - src/core/story/director.ts
    - src/core/story/director.test.ts
    - src/core/uniqueness/check.ts
    - src/app/actions/create-story.ts
    - src/app/actions/generate-video.ts
    - src/scripts/check-boundaries.ts
    - package.json

key-decisions:
  - "Timeout values kept exactly as 06-RESEARCH.md's Assumption A3 sized them (180s LLM, 120s image, 60s per video HTTP attempt) -- deliberately generous, a defense against an infinite hang rather than a latency optimization, with no empirical slow-call data gathered this session to justify tightening them"
  - "veo.ts's poll call (ai.operations.getVideosOperation) gained its own per-call httpOptions.timeout distinct from POLL_TIMEOUT_MS -- confirmed via the installed SDK's own .d.ts (GetOperationConfig.httpOptions) that this is a real, separate opt-in bound a single hung poll would otherwise bypass entirely"
  - "check-boundaries.ts invariant 8 scans for the literal content substring \"timeout:\" after stripping whole-line // comments, not a stricter AST-level check -- consistent with every other content-scan invariant already in this file (invariant 4's raw-SQL-method scan), and verified both positively (all three provider files pass) and negatively (temporarily removing veo.ts's import reliably fails the gate, reverted before committing)"
  - "create-story.ts's two collapsed blocked branches (MAX_TOKENS special case + generic block) collapsed into one branch calling plainLanguageStoryBlockMessage -- the selector's own branch order (MAX_TOKENS first, then prompt-stage, then fall-through) reproduces the exact prior special-casing, so no behavior regressed, only the generic branch's message improved"

patterns-established:
  - "provider-timeouts.ts as the single source of truth for every Google GenAI per-call HTTP bound -- a future provider addition imports from here rather than inlining a literal, and check-boundaries.ts invariant 8 fails the build if it doesn't"
  - "blockKind (veo.ts) / blockStage (director.ts, re-emitted through check.ts's UniqueStoryFailure) as the load-bearing discriminator every message-selection Server Action branches on, never blockReason/detail directly -- those stay server-console-only diagnostic strings"

requirements-completed: [RELIABILITY-01]

coverage:
  - id: D1
    description: "All six Google GenAI HTTP call sites (Story Director primary/fallback, structural-comparison tie-breaker, image generation primary/fallback, Veo dispatch, Veo poll) carry an explicit per-attempt timeout sourced from one shared constants module, closing 05-REVIEW.md WR-01's confirmed unbounded-hang gap in serializeDispatch"
    requirement: RELIABILITY-01
    verification:
      - kind: unit
        ref: "src/core/story/director.test.ts -- 'every provider HTTP timeout constant is a finite integer greater than zero'"
        status: pass
      - kind: other
        ref: "node src/scripts/check-boundaries.ts -- invariant 8 OK line; negative-case proof (temporarily removing veo.ts's provider-timeouts import) confirmed to fail the gate, reverted before commit"
        status: pass
    human_judgment: false
  - id: D2
    description: "veo.ts's GenerateVideoResult carries a blockKind (content | technical) discriminator on all three blocked branches; generate-video.ts selects the message by cause -- a genuine RAI content block tells her to rephrase, an operation error or malformed response still says try again -- with incrementVideoAttempt/updateSceneVideo/recordGeneration/the timedOut branch all textually unchanged (D-02)"
    requirement: RELIABILITY-01
    verification:
      - kind: unit
        ref: "src/providers/video/veo.test.ts -- 6 tests covering every behavior bullet"
        status: pass
      - kind: other
        ref: "node src/scripts/check-boundaries.ts -- invariant 9 OK line (retry-cap increment appears exactly once and precedes the dispatch call); git diff src/app/actions/generate-video.ts confirms only the blocked branch's message line changed"
        status: pass
    human_judgment: false
  - id: D3
    description: "director.ts's plainLanguageStoryBlockMessage splits the Story Director's collapsed block message by classifyStoryResponse's own stage: MAX_TOKENS keeps its existing cut-short sentence, a prompt-stage block gets the rephrase framing, every other cause gets try-again -- with no model/API terminology in any of the three constants. create-story.ts's two collapsed branches become one; parse_failed and the validation fall-through are untouched"
    requirement: RELIABILITY-01
    verification:
      - kind: unit
        ref: "src/core/story/director.test.ts -- 7 new tests covering the selector and the forbidden-terminology assertion"
        status: pass
      - kind: integration
        ref: "npm run test:lib (287 tests pass, all 9 check-boundaries.ts invariants + secrets-audit.ts's 5 checks OK); npm run build exits 0"
        status: pass
    human_judgment: false

duration: 7min (commit-range; investigation/reading time not separately timed)
completed: 2026-09-20
status: complete
---

# Phase 6 Plan 2: HTTP Timeout Coverage, Video Block-Kind, and Story Block-Stage Summary

**All six Google GenAI HTTP call sites now carry an explicit per-attempt timeout, the video provider gained a content/technical block-kind discriminator mirroring the image provider's proven pattern, and the Story Director's collapsed block message now differentiates by its existing classification stage -- with two new build-time invariants (8 and 9) structurally protecting both guarantees.**

## Performance

- **Duration:** ~7 min between first and last task commit (799d026 to 61de6bf)
- **Started:** 2026-09-20T19:18:15+08:00 (first task commit)
- **Completed:** 2026-09-20T19:22:44+08:00 (last task commit)
- **Tasks:** 3 of 3
- **Files modified:** 13 (2 created, 11 modified)

## Accomplishments

- Added `src/core/config/provider-timeouts.ts` (`LLM_HTTP_TIMEOUT_MS`, `IMAGE_HTTP_TIMEOUT_MS`, `VIDEO_HTTP_TIMEOUT_MS`) and wired `httpOptions.timeout` into all six Google GenAI call sites -- `gemini.ts`'s two `generateContent` calls, `gemini-image.ts`'s two `generateContent` calls, and `veo.ts`'s `generateVideos` dispatch plus its `getVideosOperation` poll call -- closing 05-REVIEW.md WR-01's confirmed unbounded-hang gap in `serializeDispatch`'s shared queue at its root (the SDK's own opt-in mechanism), not a `Promise.race` wrapper.
- Extended `dispatch-chain.ts`'s header comment (no executable change) documenting why the queue deliberately has no timeout of its own and why every function it serializes must carry its own bound.
- Added `check-boundaries.ts` invariant 8: any `src/providers/` file importing `@google/genai` must also import `provider-timeouts.ts` and set a `timeout:` key on a comment-stripped config object. Verified both positively (all three provider files pass) and negatively (temporarily removing the import from `veo.ts` reliably failed the gate; reverted before committing).
- Gave `veo.ts` a `VideoBlockKind` (`"content" | "technical"`) discriminator on `GenerateVideoResult`, mirroring `gemini-image.ts`'s `stage` pattern: the genuine RAI content-safety block is `"content"`, an operation error and a malformed/empty response are both `"technical"`. `generate-video.ts` now selects the message via `plainLanguageVideoBlockMessage(result.blockKind)` instead of one hardcoded sentence -- `incrementVideoAttempt`, `updateSceneVideo`, `recordGeneration`, and the `timedOut` branch are all textually unchanged (D-02).
- Added `check-boundaries.ts` invariant 9, structurally enforcing D-02: `generate-video.ts`'s awaited `incrementVideoAttempt` call must appear exactly once and must textually precede the awaited `generateVideo` dispatch call, on comment-stripped source.
- Split the Story Director's collapsed block message: `director.ts` exports `StoryBlockStage` and `plainLanguageStoryBlockMessage`, branching MAX_TOKENS (cut-short, unchanged) → prompt-stage (rephrase, new) → everything else (try-again, replaces the old model-naming sentence). `blockStage` flows from `classifyStoryResponse` through `StoryDirectorFailure` and `UniqueStoryFailure` to `create-story.ts`, which now has one blocked branch instead of two collapsed ones.

## Task Commits

Each task was committed atomically:

1. **Task 1: Bound every provider HTTP call so a hang can never wedge the shared dispatch queue** - `799d026` (feat)
2. **Task 2: Give the video provider a block-kind discriminator and branch her message on it** - `cdabc23` (feat)
3. **Task 3: Split the Story Director's collapsed block message by its existing stage discriminator** - `61de6bf` (feat)

**Plan metadata:** committed alongside this SUMMARY (see Self-Check section).

## Files Created/Modified

- `src/core/config/provider-timeouts.ts` - `LLM_HTTP_TIMEOUT_MS`/`IMAGE_HTTP_TIMEOUT_MS`/`VIDEO_HTTP_TIMEOUT_MS` (new)
- `src/providers/video/veo.test.ts` - 6 tests covering the block-kind selector, constants, and type (new)
- `src/providers/llm/gemini.ts` - `httpOptions.timeout` on both `generateContent` config objects (LLM)
- `src/providers/image/gemini-image.ts` - `httpOptions.timeout` on both inline `generateContent` config objects (image)
- `src/providers/video/veo.ts` - `httpOptions.timeout` on the `generateVideos` dispatch and the poll call; `VideoBlockKind`, `plainLanguageVideoBlockMessage`, `VIDEO_CONTENT_BLOCK_MESSAGE`/`VIDEO_TECHNICAL_BLOCK_MESSAGE`, `blockKind` set on all three blocked branches
- `src/core/budget/dispatch-chain.ts` - header comment only, documenting the no-timeout-of-its-own contract
- `src/core/story/director.ts` - `StoryBlockStage`, `plainLanguageStoryBlockMessage`, `STORY_CUT_SHORT_MESSAGE`/`STORY_REPHRASE_MESSAGE`/`STORY_TRY_AGAIN_MESSAGE`, `blockStage` populated on the blocked return
- `src/core/story/director.test.ts` - timeout-constants finiteness guard (Task 1) + 7 tests for the story block-message selector (Task 3)
- `src/core/uniqueness/check.ts` - `UniqueStoryFailure.blockStage`, re-emitted from `StoryDirectorFailure.blockStage`
- `src/app/actions/create-story.ts` - single blocked branch calling `plainLanguageStoryBlockMessage`, replacing two collapsed branches
- `src/app/actions/generate-video.ts` - blocked branch calls `plainLanguageVideoBlockMessage(result.blockKind)`
- `src/scripts/check-boundaries.ts` - invariant 8 (timeout coverage) and invariant 9 (D-02 increment ordering)
- `package.json` - `test:lib` gains `veo.test.ts`, inserted immediately after `gemini.test.ts`

## Decisions Made

- Timeout values kept exactly as 06-RESEARCH.md's Assumption A3 sized them (180s LLM, 120s image, 60s per video HTTP attempt) -- deliberately generous, a defense against an infinite hang, not a latency optimization.
- `veo.ts`'s poll call gained its own per-call `httpOptions.timeout`, confirmed via the installed SDK's `.d.ts` (`GetOperationConfig.httpOptions`) to be a real, separate opt-in bound distinct from `POLL_TIMEOUT_MS`.
- Invariant 8 scans for the literal content substring `"timeout:"` after stripping whole-line `//` comments -- consistent with this file's existing content-scan invariants, and verified both positively and negatively before committing.
- `create-story.ts`'s two collapsed blocked branches collapsed into one calling the selector; the selector's own branch order (MAX_TOKENS first, then prompt-stage, then fall-through) exactly reproduces the prior special-casing, so no behavior regressed -- only the generic branch's message improved (no more "blocked by the model").

## Deviations from Plan

None - plan executed exactly as written. All three tasks' automated verification and acceptance criteria passed on the first attempt with no auto-fixes needed.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. This plan made zero paid provider calls (every verification was a unit test, a static structural check, `npm run test:lib`, or `npm run build`).

## Next Phase Readiness

- RELIABILITY-01's differentiated provider-failure messaging (D-01) is now complete for all three providers (image was already correct; video and story are closed by this plan) and D-02's retry-cap-unconditional-on-cause guarantee is now structurally enforced, not just documented.
- 05-REVIEW.md WR-01 is closed at its root for all six real Google GenAI call sites this codebase has.
- Plans 06-03 through 06-05 can rely on `check-boundaries.ts`'s now-9 invariants (including the new timeout-coverage and increment-ordering gates) as part of every `test:lib` run, and can follow the same `blockKind`/`blockStage` discriminator-plus-selector pattern for any future provider-failure classification need.
- No blockers. OUTPUT-02's MP4 validity check and the remaining reliability items (per 06-RESEARCH.md's architecture map) remain for later plans in this phase, untouched by this plan.

---
*Phase: 06-reliability-secrets-hygiene-output-correctness*
*Completed: 2026-09-20*

## Self-Check: PASSED

All created files confirmed present on disk (`src/core/config/provider-timeouts.ts`, `src/providers/video/veo.test.ts`, this SUMMARY). All three task commit hashes (`799d026`, `cdabc23`, `61de6bf`) confirmed present in `git log --oneline --all`.
