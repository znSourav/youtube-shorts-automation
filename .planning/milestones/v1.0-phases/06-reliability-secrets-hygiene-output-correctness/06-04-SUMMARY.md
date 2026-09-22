---
phase: 06-reliability-secrets-hygiene-output-correctness
plan: 04
subsystem: reliability
tags: [approval-gates, retry-caps, output-correctness, server-actions, d-05]

# Dependency graph
requires:
  - phase: 06-reliability-secrets-hygiene-output-correctness
    plan: 03
    provides: "Scene.videoSaveCorrupted/imageSaveCorrupted persisted columns, and generation-repository.ts's four never-throwing writers (setVideoSaveCorrupted/clearVideoSaveCorrupted/setImageSaveCorrupted/clearImageSaveCorrupted) this plan's dispatch boundaries call"
provides:
  - "gates.ts's capExempt field on the granted VideoDispatchDecision and ImageRegenerationDecision -- a pure, server-read cap bypass for a scene carrying a recorded save-integrity failure, narrowing the existing attempt-cap guard without moving it"
  - "evaluateBatchDispatch's work-list filter extended with the same OR condition, so a capped-but-exempt scene is still offered to the batch"
  - "generate-video.ts's dispatch boundary spending the video exemption (clearVideoSaveCorrupted instead of incrementVideoAttempt) at the exact position D-02's increment already occupied"
  - "generate-images.ts's local-write-failure branch setting imageSaveCorrupted with a free-retry message, and regenerate-scene-image.ts spending it the same way the video path does"
affects: [06-05]

# Actuals (#2632)
actuals:
  tokens: 6139
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Narrowing an existing guard's condition in place (adding an OR-exemption clause) rather than moving or duplicating it -- keeps a load-bearing branch order (APPROVAL-01 before the cap check) provably unchanged while still granting a new bypass"
    - "Exemption spent at the dispatch boundary, before the paid call, at the exact textual position the thing it replaces (the attempt increment) already occupied -- makes a persisted bypass one-shot by construction without a second gate or a new mutex"

key-files:
  created: []
  modified:
    - src/core/approval/gates.ts
    - src/core/approval/gates.test.ts
    - src/app/actions/generate-video.ts
    - src/app/actions/generate-images.ts
    - src/app/actions/regenerate-scene-image.ts

key-decisions:
  - "The D-02/D-05 asymmetry is deliberate, not an inconsistency: a technical generation failure (timeout, malformed response, content block) still consumes an attempt per D-02, because the cap's job is to stop an accidental click-loop from burning money regardless of cause; a local save-integrity failure does not, per D-05, because the provider already delivered and the defect was this app's own write step. Recorded inline in gates.ts's branch-order doc comment so a future reader does not 'fix' it into symmetry."
  - "The attempt-cap guards in evaluateVideoDispatch/evaluateImageRegeneration were narrowed (added `&& !scene.xSaveCorrupted`) in their exact original position, never moved -- this is what keeps APPROVAL-01 provably unweakened: the approval guard still runs before the (narrowed) cap guard, so a capped-and-flagged scene on an unapproved story is still refused with the approval sentence, not granted early."
  - "capExempt is populated even for a scene below its cap, not only when the cap guard is actually bypassed -- the exemption is fundamentally about whether the dispatch boundary should skip the attempt increment, not only about whether this particular call cleared a refusal."
  - "OUTPUT-02's requirement text is video-only, so no image container/pixel validator was added; D-05's wording covers both asset types, and generate-images.ts's existing local-write-failure branch (a real, already-present save-integrity failure) is the image path's exemption trigger, per 06-RESEARCH.md Open Question 2."
  - "Both dispatch-boundary sites (generate-video.ts, regenerate-scene-image.ts) spend the exemption at the exact same textual position the unconditional attempt increment already occupied -- check-boundaries.ts invariant 9 (which asserts the video increment appears exactly once and precedes the paid dispatch) still passes unchanged, because the increment call is still that branch's only call site and still precedes the dispatch."

patterns-established:
  - "A persisted, server-read exemption flag that a pure decision function turns into a boolean on its granted-decision object, consumed by the dispatch boundary as a two-branch choice between two mutually exclusive bookkeeping writes -- reusable for any future 'this failure category doesn't cost her an attempt' rule."

requirements-completed: [RELIABILITY-01, OUTPUT-02]

coverage:
  - id: D1
    description: "evaluateVideoDispatch and evaluateImageRegeneration grant a capped, corruption-flagged scene exactly one cap-free retry (capExempt: true on the granted decision), while an unflagged capped scene is still refused with the byte-identical existing cap message; evaluateBatchDispatch's work-list filter mirrors the same OR condition"
    requirement: OUTPUT-02
    verification:
      - kind: unit
        ref: "src/core/approval/gates.test.ts -- 17 new tests (video exemption x6, image exemption x4, batch exemption x1, plus mirrored refusal/grant assertions), 40 total tests in the file, 0 failures"
        status: pass
    human_judgment: false
  - id: D2
    description: "The approval guard is provably unweakened: an unapproved story whose scene is both capped and flagged still returns the exact existing approval sentence, not an allow and not the cap message; a video-READY flagged scene still returns the exact existing already-generated sentence, never re-billing a scene that already succeeded"
    requirement: OUTPUT-02
    verification:
      - kind: unit
        ref: "src/core/approval/gates.test.ts -- 'refuses an UNAPPROVED story whose scene is both capped and flagged...' and 'refuses a video-READY, flagged scene...' tests"
        status: pass
      - kind: other
        ref: "git diff src/core/approval/gates.ts confirms every existing refusal message string is byte-identical and the cap guard's position (after approval, before already-READY) is unchanged"
        status: pass
    human_judgment: false
  - id: D3
    description: "dispatchSceneVideo and regenerateSceneImageAction each spend their exemption (clearVideoSaveCorrupted/clearImageSaveCorrupted) instead of incrementing the attempt counter, at the exact position the unconditional increment already occupied, before the paid call -- check-boundaries.ts invariant 9 (D-02's increment-ordering structural gate) still passes unchanged"
    requirement: RELIABILITY-01
    verification:
      - kind: other
        ref: "node src/scripts/check-boundaries.ts -- all 10 invariants OK, including invariant 9 and invariant 10"
        status: pass
      - kind: integration
        ref: "npm run test:lib (319 tests, all invariants + secrets-audit OK); npm run typecheck; npm run build -- all exit 0"
        status: pass
    human_judgment: false
  - id: D4
    description: "generate-images.ts's local-write-failure branch sets imageSaveCorrupted and tells her the retry is free, without touching the blocked branch, the success branch, the budget catch, or the stopped logic; no image container/pixel validator was added anywhere"
    requirement: RELIABILITY-01
    verification:
      - kind: other
        ref: "git diff src/app/actions/generate-images.ts confirms the change is scoped to the write-failure catch block only; grep confirms setImageSaveCorrupted appears exactly once"
        status: pass
    human_judgment: false

duration: ~2min (commit-range; investigation/reading time not separately timed)
completed: 2026-09-20
status: complete
---

# Phase 6 Plan 4: D-05 Free-Retry Exemption Summary

**A persisted, one-shot, server-read cap bypass now lets a scene whose saved video or image file was corrupted retry for free, spent at the exact dispatch-boundary position the existing attempt-cap increment already occupied, without moving or weakening APPROVAL-01.**

## Performance

- **Duration:** ~2 min between first and last task commit (b235344 to f05f2f7)
- **Started:** 2026-09-20T19:46:04+08:00 (first task commit)
- **Completed:** 2026-09-20T19:48:17+08:00 (last task commit)
- **Tasks:** 3 of 3
- **Files modified:** 5

## Accomplishments

- Added `capExempt: boolean` to the granted variant of `VideoDispatchDecision` and `ImageRegenerationDecision` in `src/core/approval/gates.ts`, populated from `scene.videoSaveCorrupted` / `scene.imageSaveCorrupted`. Narrowed (never moved) the existing attempt-cap refusal guards in `evaluateVideoDispatch` and `evaluateImageRegeneration` so a flagged scene bypasses the cap refusal even at or above the limit, while an unflagged scene at the cap is still refused with the byte-identical existing message.
- Extended `evaluateBatchDispatch`'s work-list filter with the same `videoAttempts < max || videoSaveCorrupted` condition, so the "Generate All Videos" fast-refusal list still offers a capped-but-exempt scene rather than silently hiding it from a per-scene retry that would happily accept it.
- Rewrote the load-bearing branch-order doc comment above `evaluateVideoDispatch` to describe the narrowed step-4 condition and to record the D-02/D-05 asymmetry as deliberate: a technical generation failure still costs an attempt (money-burning click-loop protection, cause-independent); a local save-integrity failure does not (the provider already delivered; the defect was this app's own write step). Documented the exemption's one-shot-by-construction design: the dispatch boundary clears the flag before the paid call, so a second free retry needs a second recorded corruption, with the unchanged monthly budget check remaining the money backstop.
- Extended `gates.test.ts` with 17 new tests covering every behavior bullet in Task 1 -- including an unapproved-story-capped-and-flagged case (asserts the exact approval sentence, not an allow) and a video-READY-and-flagged case (asserts the exact already-generated sentence, proving the exemption never re-bills a succeeded scene). 40 tests total in the file, 0 failures.
- `dispatchSceneVideo` (`generate-video.ts`) now branches on the granted decision's `capExempt` flag at the exact position the unconditional `incrementVideoAttempt` call already occupied: exempt scenes await `clearVideoSaveCorrupted` instead. `check-boundaries.ts` invariant 9 (the increment must appear exactly once and precede the paid dispatch) still passes unchanged, since this branch remains the increment's only call site and still sits ahead of the `generateVideo` call.
- `generate-images.ts`'s local-write-failure branch now awaits `setImageSaveCorrupted` alongside its existing `FAILED` status write and generation record, and its message now reads: "This scene's image didn't save properly, so it can't be used. Trying again won't use up one of this scene's attempts." -- matching the video path's constant's shape and tone. No image container/pixel validator was added anywhere; OUTPUT-02's requirement text is video-only, and this existing write-failure branch is the real, already-present save-integrity failure on the image side (06-RESEARCH.md Open Question 2).
- `regenerateSceneImageAction` (`regenerate-scene-image.ts`) mirrors the video dispatch boundary exactly: spends the image exemption (`clearImageSaveCorrupted`) instead of `incrementImageAttempt`, at the same position, before the dispatch into `generateSceneImagesAction`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Teach the pure decision layer about the one-shot corruption exemption** - `b235344` (feat)
2. **Task 2: Spend the video exemption at the dispatch boundary instead of charging an attempt** - `622c63c` (feat)
3. **Task 3: Apply the same exemption to the image save path** - `f05f2f7` (feat)

**Plan metadata:** committed alongside this SUMMARY (see Self-Check section).

## Files Created/Modified

- `src/core/approval/gates.ts` - `capExempt` field on both granted decision types; narrowed cap guards in `evaluateVideoDispatch`/`evaluateImageRegeneration`; extended `evaluateBatchDispatch` filter; rewritten branch-order doc comment recording the D-02/D-05 asymmetry
- `src/core/approval/gates.test.ts` - 17 new tests covering the exemption across all three functions
- `src/app/actions/generate-video.ts` - dispatch boundary spends `capExempt` via `clearVideoSaveCorrupted` instead of `incrementVideoAttempt` when active
- `src/app/actions/generate-images.ts` - local-write-failure branch sets `imageSaveCorrupted` and returns a free-retry message
- `src/app/actions/regenerate-scene-image.ts` - dispatch boundary spends the image exemption the same way the video path does

## Decisions Made

- The D-02/D-05 asymmetry is deliberate and recorded inline so it is never mistaken for a bug: technical generation failures always cost an attempt; local save-integrity failures never do.
- The cap guards were narrowed in place, never moved -- this is what makes APPROVAL-01's precedence over the cap check provable by both a test and a `git diff` read, not just an assertion.
- `capExempt` reflects the scene's flag state on every grant, not only on grants that actually needed the bypass to clear a refusal.
- No image container/pixel validation was added -- OUTPUT-02 is video-only by its literal requirement text; the image path's existing write-failure branch is D-05's image-side trigger.
- Both dispatch boundaries spend the exemption at the exact textual position the increment they replace already occupied, keeping `check-boundaries.ts` invariant 9 valid without any change to that invariant's own logic.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. This plan made zero paid provider calls: `Story`/`Scene`/`GenerationRecord` row counts in the real `prisma/dev.db` (5/25/40) are confirmed unchanged before and after this plan's execution.

## Next Phase Readiness

- D-05 is closed for both asset types: a save-integrity failure grants exactly one cap-free retry per recorded corruption, persisted server-side (survives a page reload), and cannot be inferred from browser state.
- D-02 is confirmed unchanged: a technical generation failure still consumes an attempt, and `check-boundaries.ts` invariant 9 (the structural proof of that ordering) still passes.
- APPROVAL-01 is confirmed unweakened: a new test proves an unapproved, capped, flagged story is still refused with the exact approval sentence; a `git diff` read confirms the cap guard's position relative to the approval guard is unchanged.
- RELIABILITY-01 and OUTPUT-02 are both marked complete by this plan's requirements coverage.
- No blockers. Ready for plan 06-05.

---
*Phase: 06-reliability-secrets-hygiene-output-correctness*
*Completed: 2026-09-20*

## Self-Check: PASSED

All modified files confirmed present on disk with the expected changes (`src/core/approval/gates.ts`, `src/core/approval/gates.test.ts`, `src/app/actions/generate-video.ts`, `src/app/actions/generate-images.ts`, `src/app/actions/regenerate-scene-image.ts`, this SUMMARY). All three task commit hashes (`b235344`, `622c63c`, `f05f2f7`) confirmed present in `git log --oneline --all`.
