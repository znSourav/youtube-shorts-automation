---
phase: 06-reliability-secrets-hygiene-output-correctness
plan: 03
subsystem: output
tags: [mp4box, prisma, sqlite, mp4-validation, server-actions, output-correctness]

# Dependency graph
requires:
  - phase: 06-reliability-secrets-hygiene-output-correctness
    plan: 02
    provides: "check-boundaries.ts's stripWholeLineComments helper and ALLOWED_VIDEO_DISPATCH_PATH constant (invariants 8/9), which invariant 10 reuses; generate-video.ts's post-06-02 shape (blockKind selector, httpOptions timeouts) that this plan edits alongside without disturbing"
provides:
  - "src/core/output/mp4-validation.ts -- validateMp4Buffer/evaluateMp4Info, a zero-dependency-adjacent MP4 container proof (OUTPUT-02), proven against a real committed Veo fixture and three real forgeries"
  - "src/core/output/fixtures/veo-720x1280-4s.mp4 -- a real, committed Veo-generated MP4 fixture (590,613 bytes, 4.0s, 720x1280) other tests/phases can reuse"
  - "Scene.videoGeneratingSince/videoSaveCorrupted/imageSaveCorrupted -- the three persisted columns plan 06-04 needs for D-05's free-retry exemption and the stuck-generation detector's server-anchored clock fix"
  - "generation-repository.ts's four new never-throwing writers: setVideoSaveCorrupted/clearVideoSaveCorrupted/setImageSaveCorrupted/clearImageSaveCorrupted"
  - "check-boundaries.ts invariant 10 -- the save-time MP4 validation structural gate, keeping the success-path READY write unreachable without validation"
affects: [06-04, 06-05]

# Actuals (#2632)
actuals:
  tokens: 11649
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: ["mp4box@2.4.1"]
  patterns:
    - "Pure verdict function delegated to from a byte/parser-level validator (evaluateMp4Info <- validateMp4Buffer), mirroring gates.ts's guard-clause-then-typed-decision shape -- the duration/aspect-ratio rules are directly testable with plain numbers, no second real fixture needed per shape"
    - "Server-anchored timestamp derived from a status argument inside the repository layer (updateSceneVideo writes videoGeneratingSince itself, keyed off the status it's already given), so no call site can forget to set or clear it"
    - "Content-scan + ordering-scan structural invariant pair in check-boundaries.ts (invariant 10: exactly-once call count + last-occurrence character-index ordering), extending 06-02's invariant 8/9 pattern to a third build-time guarantee"

key-files:
  created:
    - src/core/output/mp4-validation.ts
    - src/core/output/mp4-validation.test.ts
    - src/core/output/fixtures/veo-720x1280-4s.mp4
    - prisma/migrations/20260920113239_phase6_reliability_fields/migration.sql
  modified:
    - src/core/persistence/story-repository.ts
    - src/core/persistence/generation-repository.ts
    - src/app/actions/generate-video.ts
    - src/scripts/check-boundaries.ts
    - prisma/schema.prisma
    - package.json

key-decisions:
  - "mp4box pinned exactly at 2.4.1 (no caret), matching the project's existing precedent for audited/pinned dependencies (Prisma 7.10.0) -- re-confirmed live against the npm registry (npm view mp4box scripts.postinstall returned empty, no postinstall key in the full scripts object) immediately before installing, per the plan's own re-confirmation requirement"
  - "evaluateMp4Info split out as its own exported pure function (Task 1's deliberate correction 1) and missing video-track dimensions treated as an explicit INVALID verdict rather than a silent skip of the 9:16 check (correction 2) -- both reviewed and intentional per the plan's own framing, not a re-derivation of 06-RESEARCH.md's reference snippet"
  - "Video-track dimension selection falls back through three steps (info.videoTracks[0], then the first track with a video descriptor, then the first track with a non-zero track_width) before giving up -- confirmed against the real fixture's actual mp4box output shape (info.videoTracks[0].track_width/track_height), not assumed from the research snippet alone"
  - "updateSceneVideo derives videoGeneratingSince from its existing status argument rather than a new parameter -- no existing call site's signature changes, and no call site can forget to set or clear it"
  - "The four new corruption-flag writers copy the existing best-effort contract verbatim (try/catch/console.error/return, never throw) -- confirmed via grep that no `throw` statement exists in generation-repository.ts outside doc comments"
  - "generate-video.ts's readback-failure branch (no bytes to validate) is textually unchanged, confirmed via git diff; incrementVideoAttempt is untouched -- D-05 exempts save-integrity failures from the retry-cap increment path, not from the generation attempt that already ran"
  - "The invalid file is deliberately left on disk rather than deleted -- the next attempt overwrites the same path, and episode-export.ts's existing file-existence downgrade only applies to an already-READY scene, so deletion would add a new I/O failure mode on an already-failing path for no benefit"
  - "Rule 3 auto-fix: episode-export.test.ts's and story-view.test.ts's StoryWithScenes-typed scene fixtures needed the three new fields to keep npm run typecheck at 0 (a blocking issue, not in the plan's own files list) -- added with the schema defaults (null/false/false), no new assertions; story-view.test.ts's separate, deliberately narrower LibrarySceneSummary fixture was left untouched since that type mirrors listStoriesWithSceneCounts's narrow selection, which the plan explicitly says not to touch"

patterns-established:
  - "mp4-validation.ts's evaluateMp4Info/validateMp4Buffer split as the template for any future save-time content-proof: byte/parser work in the outer function, every judgement delegated to an exported pure function testable with plain fixtures"
  - "check-boundaries.ts invariant 10's exactly-once-call-count + last-occurrence-ordering scan as the template for 'a specific write must never be reachable before a specific proof has run' -- reusable for any future save-then-validate-then-mark-ready flow"

requirements-completed: [OUTPUT-02]

coverage:
  - id: D1
    description: "A zero-dependency-adjacent MP4 container validator (mp4box), proven against a real Veo-generated fixture (4.0s, 720x1280, exact 9:16) and against an empty buffer, an undersized buffer, a synthetic text-signature buffer, and a synthetic JPEG-signature buffer -- all four rejected, the real fixture accepted with exact duration/width/height equalities"
    requirement: OUTPUT-02
    verification:
      - kind: unit
        ref: "src/core/output/mp4-validation.test.ts -- 12 tests covering every behavior bullet"
        status: pass
      - kind: other
        ref: "git ls-files -- src/core/output/fixtures/veo-720x1280-4s.mp4 (fixture genuinely tracked); npm ls mp4box reports 2.4.1; npm view mp4box scripts.postinstall empty"
        status: pass
    human_judgment: false
  - id: D2
    description: "Three additive Scene columns (videoGeneratingSince, videoSaveCorrupted, imageSaveCorrupted) in a tracked Prisma migration, plus four never-throwing repository writers and updateSceneVideo's self-maintaining generation timestamp -- Story/Scene/GenerationRecord row counts in the real prisma/dev.db unchanged before and after (5/25/40)"
    requirement: OUTPUT-02
    verification:
      - kind: unit
        ref: "src/core/persistence/generation-repository.test.ts -- 9 new tests covering the new columns and writers"
        status: pass
      - kind: other
        ref: "npx prisma migrate status (up to date, no drift, both before schema edit and after migration); node -e (better-sqlite3 row counts) confirmed 5/25/40 unchanged pre- and post-migration"
        status: pass
    human_judgment: false
  - id: D3
    description: "generate-video.ts's post-download block validates the already-read buffer before any READY write can happen; an invalid verdict writes FAILED with a null path, sets the video corruption flag, records a billed:true generation with the fixed plain-language message, and returns that message verbatim with no technical detail; the readback-failure branch and incrementVideoAttempt are textually unchanged; check-boundaries.ts invariant 10 keeps the success-path READY write structurally unreachable before validation"
    requirement: OUTPUT-02
    verification:
      - kind: other
        ref: "node src/scripts/check-boundaries.ts -- invariant 10 OK line; negative-case proof (temporarily removing the validateMp4Buffer call) reliably failed the gate, reverted before commit"
        status: pass
      - kind: integration
        ref: "npm run test:lib (307 tests, all 11 invariants + secrets-audit.ts's 5 checks OK); npm run build; npm run typecheck all exit 0; git diff src/app/actions/generate-video.ts confirms the readback-failure branch and incrementVideoAttempt are unchanged"
        status: pass
    human_judgment: false

duration: 7min (commit-range; investigation/reading time not separately timed)
completed: 2026-09-20
status: complete
---

# Phase 6 Plan 3: MP4 Validation, Reliability Columns, and Save-Time Enforcement Summary

**A real MP4 container validator (mp4box) proven against a genuine Veo-generated clip and three forgeries now runs on every saved video's already-in-memory bytes before the scene is ever marked READY, backed by three new persisted Scene columns and a build-time invariant that makes the unvalidated path structurally unreachable.**

## Performance

- **Duration:** ~7 min between first and last task commit (9369b80 to 43ce46b)
- **Started:** 2026-09-20T19:32:09+08:00 (first task commit)
- **Completed:** 2026-09-20T19:39:36+08:00 (last task commit)
- **Tasks:** 3 of 3
- **Files modified:** 15 (5 created, 10 modified; 2 additional out-of-plan test fixtures touched as a Rule 3 auto-fix, see Deviations)

## Accomplishments

- Added `src/core/output/mp4-validation.ts` (`validateMp4Buffer`, `evaluateMp4Info`, `MIN_PLAUSIBLE_MP4_BYTES`, `DEFAULT_DURATION_TOLERANCE_SECONDS`, `CORRUPT_VIDEO_MESSAGE`) -- a zero-dependency-adjacent MP4 container proof using `mp4box@2.4.1`, transcribing 06-RESEARCH.md Pattern 4's verified implementation with two deliberate corrections (a split pure verdict function, and an explicit INVALID verdict for missing video-track dimensions instead of a silent skip of the 9:16 rule).
- Copied the real Veo-generated clip `storage/stories/story-1789498386163-pb6tfs/scenes/02/video.mp4` (590,613 bytes, byte-identical, confirmed via `Buffer.compare`) to the committed fixture `src/core/output/fixtures/veo-720x1280-4s.mp4` and wrote `mp4-validation.test.ts` (12 tests) covering every behavior bullet, resolving the fixture path relative to the test file.
- Re-confirmed `mp4box`'s clean install-script verdict live against the npm registry (`npm view mp4box scripts.postinstall` empty, full `scripts` object has no `postinstall` key) immediately before installing at the pinned version.
- Added three additive `Scene` columns (`videoGeneratingSince DateTime?`, `videoSaveCorrupted Boolean @default(false)`, `imageSaveCorrupted Boolean @default(false)`) via migration `20260920113239_phase6_reliability_fields` -- a full-table redefinition (Prisma's own batching behavior for multiple new SQLite columns), additive with no data loss, confirmed against the real `prisma/dev.db`: Story=5/Scene=25/GenerationRecord=40 unchanged before and after.
- Extended `generation-repository.ts`'s `updateSceneVideo` to derive `videoGeneratingSince` from its existing `status` argument (set on GENERATING, cleared otherwise) and added four never-throwing writers (`setVideoSaveCorrupted`/`clearVideoSaveCorrupted`/`setImageSaveCorrupted`/`clearImageSaveCorrupted`) copying the module's existing best-effort contract verbatim.
- Widened `story-repository.ts`'s `StoryWithScenes` interface with the three new fields (`findStoryWithScenes` already returns them via `include`); `listStoriesWithSceneCounts`'s narrow explicit selection was left untouched.
- Restructured `generate-video.ts`'s post-download block into three steps (read buffer, validate, build data URL) -- an invalid verdict writes the scene FAILED with a null path, sets the corruption flag, records a `billed: true` generation with the fixed `CORRUPT_VIDEO_MESSAGE`, and returns that message verbatim with the technical reason going only to `console.error`; the readback-failure branch and `incrementVideoAttempt` are textually unchanged (confirmed via `git diff`).
- Added `check-boundaries.ts` invariant 10: the `validateMp4Buffer` call must appear exactly once and the LAST `SceneAssetStatus.READY` write must textually follow it, on comment-stripped source -- verified both positively and negatively (a temporary regression removing the validator call reliably failed the gate, reverted before committing).

## Task Commits

Each task was committed atomically:

1. **Task 1: A real MP4 container validator, proven against a real Veo file and three real forgeries** - `9369b80` (feat)
2. **Task 2: Persist the three reliability columns and their best-effort writers** - `3e4617a` (feat)
3. **Task 3: Validate at save time inside the single video dispatch point** - `43ce46b` (feat)

**Plan metadata:** committed alongside this SUMMARY (see Self-Check section).

## Files Created/Modified

- `src/core/output/mp4-validation.ts` - `validateMp4Buffer`/`evaluateMp4Info` and the module's exported constants (new)
- `src/core/output/mp4-validation.test.ts` - 12 tests covering every behavior bullet (new)
- `src/core/output/fixtures/veo-720x1280-4s.mp4` - the committed real Veo-generated fixture (new)
- `prisma/migrations/20260920113239_phase6_reliability_fields/migration.sql` - the three new Scene columns (new)
- `prisma/schema.prisma` - `videoGeneratingSince`/`videoSaveCorrupted`/`imageSaveCorrupted` on `Scene`, with the schema-shape decision recorded inline
- `src/core/persistence/generation-repository.ts` - `updateSceneVideo`'s self-maintaining timestamp; four new never-throwing writers
- `src/core/persistence/story-repository.ts` - `StoryWithScenes` widened with the three new fields
- `src/core/persistence/generation-repository.test.ts` - 9 new tests for the new columns and writers
- `src/core/approval/gates.test.ts` - `sceneFixture` gained the three new fields' schema defaults (no new assertions; plan 06-04 owns gate behaviour)
- `src/app/actions/generate-video.ts` - the post-download block restructured into read/validate/succeed steps
- `src/scripts/check-boundaries.ts` - invariant 10 (save-time validation structural gate)
- `package.json` / `package-lock.json` - `mp4box` pinned at `2.4.1`; `test:lib` gained `mp4-validation.test.ts`
- `src/core/output/episode-export.test.ts`, `src/core/persistence/story-view.test.ts` - Rule 3 auto-fix: `StoryWithScenes`-typed scene fixtures gained the three new fields' schema defaults to keep `npm run typecheck` at 0 (see Deviations)

## Decisions Made

- `mp4box` pinned exactly at `2.4.1` (matching Prisma's own precedent for audited/pinned dependencies in this project), re-confirmed clean against the live npm registry immediately before installing.
- `evaluateMp4Info` split out as an exported pure function, and missing video-track dimensions treated as an explicit INVALID verdict -- both deliberate, reviewed corrections to 06-RESEARCH.md's own reference snippet, not a deviation from it.
- Video-track dimension selection falls back through `info.videoTracks[0]` → first track with a `video` descriptor → first track with non-zero `track_width`, confirmed against the real fixture's actual mp4box output shape before writing the fallback chain.
- `updateSceneVideo` derives `videoGeneratingSince` from its existing `status` argument rather than a new parameter, so no call site can forget to set or clear it.
- The invalid video file is deliberately left on disk rather than deleted, documented inline in `generate-video.ts`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `episode-export.test.ts` and `story-view.test.ts`'s `StoryWithScenes` fixtures needed the three new Scene fields to keep typecheck at 0**
- **Found during:** Task 2, immediately after widening `StoryWithScenes`
- **Issue:** Both files construct scene literals typed as `StoryWithScenes["scenes"][number]`; widening that interface (required by Task 2's own action text) broke `npm run typecheck` in two files the plan's own file list did not enumerate, both of which are required to pass by this task's and Task 3's own `<verify>` blocks.
- **Fix:** Added `videoGeneratingSince: null, videoSaveCorrupted: false, imageSaveCorrupted: false` to every scene literal in both files (mechanically, matching each literal's own indentation), matching the schema defaults. No new assertions added. `story-view.test.ts`'s separate `LibrarySceneSummary` fixture (a deliberately narrower type mirroring `listStoriesWithSceneCounts`'s untouched selection) was explicitly left alone.
- **Files modified:** `src/core/output/episode-export.test.ts`, `src/core/persistence/story-view.test.ts`
- **Verification:** `npm run typecheck` exits 0; both files' existing test suites still pass inside `npm run test:lib`'s full 307-test run.
- **Committed in:** `3e4617a` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for correctness (typecheck must pass per this plan's own acceptance criteria and the phase's `<verification>` block). No scope creep -- only the schema-default fields were added, no new test assertions.

## Issues Encountered

- `npx prisma generate` needed an explicit run after `prisma migrate dev` for the new columns to appear on the generated client's runtime data model in this session -- the generated output (`src/generated/prisma/`, gitignored) was stale until then, causing three test failures (`actual: undefined` on the new boolean/date fields) that resolved immediately after regenerating. Not a plan defect; resolved before the Task 2 commit, no code changes needed.

## User Setup Required

None - no external service configuration required. This plan made zero paid provider calls (every verification ran against a committed fixture, synthetic buffers, or the real local `prisma/dev.db`).

## Next Phase Readiness

- OUTPUT-02 is closed: every saved video file is proved to be a genuine, non-empty, playable MP4 at approximately the requested duration and exactly 9:16 before the scene is ever shown as ready, with a plainly-explained, durably-recorded free-retry exemption on failure.
- The three new Scene columns (`videoGeneratingSince`, `videoSaveCorrupted`, `imageSaveCorrupted`) and the four new repository writers are in place and tested, ready for plan 06-04 to consume: `gates.ts`'s D-05 free-retry bypass, `get-story-status.ts`'s server-computed `stuck` field (Pattern 5), and the image-save-corruption path this plan deliberately left for 06-04 to wire (only the schema/writer half was this plan's job; the image dispatch action's own integration is out of scope here).
- `check-boundaries.ts` now enforces 10 invariants (plus `secrets-audit.ts`'s 5 checks) as part of every `npm run test:lib` run; plans 06-04/06-05 inherit invariant 10 as a standing guarantee.
- No blockers. `Story`/`Scene`/`GenerationRecord` row counts in `prisma/dev.db` are unchanged across this entire plan (5/25/40) -- zero paid calls, as the plan required.

---
*Phase: 06-reliability-secrets-hygiene-output-correctness*
*Completed: 2026-09-20*

## Self-Check: PASSED

All created files confirmed present on disk (`src/core/output/mp4-validation.ts`, `src/core/output/mp4-validation.test.ts`, `src/core/output/fixtures/veo-720x1280-4s.mp4`, `prisma/migrations/20260920113239_phase6_reliability_fields/migration.sql`, this SUMMARY). All three task commit hashes (`9369b80`, `3e4617a`, `43ce46b`) confirmed present in `git log --oneline --all`.
