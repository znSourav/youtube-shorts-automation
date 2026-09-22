---
phase: 03-persistence-structural-uniqueness
plan: 03
subsystem: database
tags: [prisma, sqlite, generation-record, cost-durability, browser-restore, video-03]

# Dependency graph
requires:
  - phase: 03-persistence-structural-uniqueness
    provides: "03-01's Story/Scene/GenerationRecord Prisma schema and story-repository.ts; 03-02's uniqueness gate wired into createStoryAction, check.ts's runUniqueStoryDirector"
provides:
  - "src/core/persistence/generation-repository.ts -- recordGeneration/recordGenerations/updateSceneImage/updateSceneVideo, the sole door for generation-record writes and scene asset-status updates"
  - "Dual-write wiring at both paid asset call sites (generate-images.ts, generate-video.ts): every scene's saved path+status and every dispatched call's cost now survive a restart"
  - "check.ts's spend accumulation (story + uniqueness-comparison records) flushed by create-story.ts once the story row exists"
  - "src/core/persistence/story-view.ts -- pure, path-free mapper from a persisted row to the browser-safe restore payload"
  - "src/app/actions/load-story.ts -- loadStoryAction, the browser-resume read path"
  - "page.tsx's localStorage-backed restore-on-mount effect (VIDEO-03 soft, browser half -- shipped, not dropped)"
affects: [03-04-real-proof-run, phase-04-story-library, phase-05-budget-system]

# Actuals (#2632)
actuals:
  tokens: 18100
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Best-effort repository writes: every generation-repository.ts function wraps its own write in try/catch, logs one line, and returns normally -- a durability record can be lost, a paid asset never is"
    - "Optional spend accumulator parameter (PendingGenerationRecord[]) threaded through compareViaLlm/runUniqueStoryDirector as a side-effect collector, so the existing boolean-returning escalate/compareViaLlm signatures -- and every prior test that depends on them -- stay unchanged"
    - "Readiness UI keyed off imageDataUrl (what actually renders) rather than imagePath (internal bookkeeping only), so a restored story with no path still reports correct readiness"

key-files:
  created:
    - src/core/persistence/generation-repository.ts
    - src/core/persistence/generation-repository.test.ts
    - src/core/persistence/story-view.ts
    - src/core/persistence/story-view.test.ts
    - src/app/actions/load-story.ts
  modified:
    - src/core/uniqueness/check.ts
    - src/core/uniqueness/check.test.ts
    - src/app/actions/create-story.ts
    - src/app/actions/generate-images.ts
    - src/app/actions/generate-video.ts
    - src/app/page.tsx
    - src/scripts/persistence-probe.ts
    - package.json

key-decisions:
  - "Temp-database test helper (findMigrationSql/tmpDatabaseUrl) DUPLICATED into generation-repository.test.ts rather than extracted into a shared module -- db.test.ts (the only other consumer) is outside this plan's declared files_modified list, and the project has no existing shared-test-helper convention to extend into. A future plan can extract it if a third consumer appears."
  - "check.ts's escalate hook and compareViaLlm's boolean return type were kept BYTE-FOR-BYTE unchanged; spend accumulation rides an optional `spend?: PendingGenerationRecord[]` side-effect parameter instead, so all 20+ existing 03-02 tests needed zero changes."
  - "A story-director attempt that fails (blocked/parse_failed/validation_failed) still gets a durable STORY-typed spend record, but with model='unknown (story director attempt failed before model attribution)' rather than a real model id -- StoryDirectorFailure carries no modelUsed and director.ts was out of this plan's files_modified scope. estimatedUsd still mirrors runStoryDirector's real conservative estimate. Logged to WINDOWS.md #6."
  - "VIDEO-03's browser-resume half SHIPPED (not dropped under the soft escape hatch) -- verified directly against a real prisma/dev.db, not just unit tests (see Next Phase Readiness). The one accepted narrow gap: a restored scene's video Generate/Retry action is intentionally disabled, since a restored scene carries no filesystem path (T-03-15) and generateSceneVideoAction needs one. Logged to WINDOWS.md #7."
  - "allImagesReady/readyCount/SceneCard readiness switched from checking imagePath truthiness to imageDataUrl truthiness -- imagePath is internal bookkeeping only (generate-images.ts's own convention) and is deliberately null for a restored scene, so the old check would have reported a fully-ready restored story as 0-of-N ready."

patterns-established:
  - "Every generation-repository.ts write is best-effort: try/catch, one console.error line naming story+scene+failure, return normally, never throw -- documented at the top of the file with the reasoning, matching generate-images.ts's own disk-write-failure precedent."
  - "A ceiling-refused or thrown (undispatched) call gets a scene status update but NO generation record; a dispatched call (success, blocked, or otherwise-failed) always gets exactly one record -- the same accounting boundary spend-ledger.ts's recordSpend already draws."

requirements-completed: [IMAGE-01, IMAGE-03, PERSIST-01, VIDEO-03]

coverage:
  - id: D1
    description: "Every scene's saved image path is recorded against its own database row, using the identical string sceneImagePath produced for the disk write -- never a rebuilt or model-derived string (IMAGE-01)"
    requirement: "IMAGE-01"
    verification:
      - kind: integration
        ref: "src/core/persistence/generation-repository.test.ts#updateSceneImage sets the path and the ready status, readable by a second independently-constructed client"
        status: pass
      - kind: manual_procedural
        ref: "node --env-file=.env.local src/scripts/persistence-probe.ts --simulate-assets -- scenes-with-image=3 of 3"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every dispatched image, video, story, and uniqueness-comparison call creates a durable record carrying a non-null estimated cost, the model used (where the call's own result reports it), the billed flag, success, and a plain-language message (IMAGE-03)"
    requirement: "IMAGE-03"
    verification:
      - kind: integration
        ref: "src/core/persistence/generation-repository.test.ts#recordGeneration creates a row whose estimated cost is non-null and equal to what was passed (IMAGE-03)"
        status: pass
      - kind: unit
        ref: "src/core/uniqueness/check.test.ts#an always-colliding three-attempt run produces three story-typed spend entries, one per dispatched attempt"
        status: pass
      - kind: unit
        ref: "src/core/uniqueness/check.test.ts#compareViaLlm pushes one uniqueness-typed spend entry when a comparison is dispatched"
        status: pass
      - kind: unit
        ref: "src/core/uniqueness/check.test.ts#a ceiling-refused comparison pushes nothing to spend -- nothing was dispatched"
        status: pass
    human_judgment: false
  - id: D3
    description: "A database write failure never discards an already-paid-for image or video, and never stops generation of the remaining scenes -- every repository write is best-effort by contract"
    verification:
      - kind: integration
        ref: "src/core/persistence/generation-repository.test.ts#a scene number with no row logs exactly once and returns without throwing, leaving the other scenes untouched"
        status: pass
      - kind: integration
        ref: "src/core/persistence/generation-repository.test.ts#recordGeneration against a nonexistent story logs exactly once and returns without throwing"
        status: pass
    human_judgment: false
  - id: D4
    description: "The file spend ledger (src/lib/spend-ledger.ts) remains byte-for-byte unmodified and stays the sole enforcement gate; the ledger total is unchanged at $2.9370 before and after this plan; zero real paid provider calls were dispatched anywhere in this plan"
    verification:
      - kind: other
        ref: "git diff --exit-code -- src/lib/spend-ledger.ts (exit 0); node -e ledger-total-check prints LEDGER 2.9370 before and after"
        status: pass
    human_judgment: false
  - id: D5
    description: "PERSIST-01's video-status database half: a scene's video path and status written before a second client is constructed are still readable afterwards"
    requirement: "PERSIST-01"
    verification:
      - kind: integration
        ref: "src/core/persistence/generation-repository.test.ts#updateSceneVideo followed by a fresh client read returns the video status and path (VIDEO-03's database half)"
        status: pass
    human_judgment: false
  - id: D6
    description: "VIDEO-03's browser-resume half: reopening the browser restores the last story's scenes and statuses via localStorage + loadStoryAction, with no filesystem path ever crossing into the returned payload, and a missing-on-disk file downgrading only that scene rather than failing the whole restore"
    requirement: "VIDEO-03"
    verification:
      - kind: unit
        ref: "src/core/persistence/story-view.test.ts#the fully serialised payload contains no occurrence of the storage root directory name"
        status: pass
      - kind: integration
        ref: "Direct invocation of loadStoryAction against the real prisma/dev.db (ad hoc, not a committed test): a scene with a real file on disk returns READY with a working data URL; a scene whose file is missing downgrades to FAILED; an unknown id and a malformed id both return not-found rather than throwing"
        status: pass
      - kind: automated_ui
        ref: "npm run dev serves HTTP 200; no browser-driving tool was available in this executor session to click through the actual restore UI"
        status: unknown
    human_judgment: true
    rationale: "The core restore mechanics (server-side mapping, path-free payload, file-missing downgrade, not-found handling) were proven directly against the real database, not just mocked. The remaining gap is a live click-through of the actual browser UI (open a fresh tab, watch the scenes reappear) -- no browser-driving tool was available to this executor. Should be confirmed at /gsd-verify-work or end-of-phase UAT."

duration: 23min
completed: 2026-09-13
status: complete
---

# Phase 3 Plan 03: Generation Records & Browser Restore Summary

**Scene image/video paths, statuses, and every paid call's cost now survive an app restart via a best-effort GenerationRecord dual-write; reopening the browser fully restores the last story's scenes via a path-free `loadStoryAction` -- VIDEO-03's soft browser-resume criterion shipped, not dropped.**

## Performance

- **Duration:** 23 min
- **Started:** 2026-09-13T11:06:01Z (approx, from 03-02's completion)
- **Completed:** 2026-09-13T11:29:45Z
- **Tasks:** 2
- **Files created:** 5
- **Files modified:** 8

## Accomplishments

- `src/core/persistence/generation-repository.ts`: the sole door for `GenerationRecord` writes and scene image/video path+status updates -- every function is best-effort by contract (try/catch, one log line, never throws), documented with the reasoning that a durability record is worth less than the paid asset it describes
- `generate-images.ts`/`generate-video.ts` now write a scene status and a cost-carrying record after every dispatched call -- ready+record on success, failed+false-success-record on a dispatched-but-unusable outcome, failed-status-only (no record) on a ceiling-refused or thrown (undispatched) call, mirroring `recordSpend`'s own dispatched-vs-undispatched boundary exactly. `src/lib/spend-ledger.ts` is untouched -- confirmed via `git diff --exit-code` -- and stays the sole real budget enforcement point
- `check.ts`'s `runUniqueStoryDirector`/`compareViaLlm` now accumulate a `spend: PendingGenerationRecord[]` (one story entry per dispatched director attempt including collided ones, one uniqueness entry per dispatched comparison) via an optional side-effect accumulator parameter -- the existing boolean-returning `escalate`/`compareViaLlm` signatures stayed byte-for-byte unchanged, so all of 03-02's tests needed zero modification. `create-story.ts` flushes it via `recordGenerations` once the story row exists
- `persistence-probe.ts` gains `--simulate-assets`: performs the exact repository calls the two paid actions perform, at zero cost, against the fixture `--write` story. Also fixed `runWrite` to clear prior `GenerationRecord` rows first -- now that `GenerationRecord` has its first writer, a stale row from a prior `--simulate-assets` run would otherwise block `--write`'s re-run via a foreign-key constraint (found and fixed during Task 1 verification)
- `src/core/persistence/story-view.ts`: a pure, I/O-free mapper whose output types (`LoadedStory`/`LoadedSceneStatus`) declare **no path field at all** -- mechanically proven by a serialise-then-search test, not just a convention
- `src/app/actions/load-story.ts`: `loadStoryAction(storyId)` validates the id through `storyDir()` before any query, attaches `data:` URLs for READY scenes by reading their DB-recorded path server-side, and downgrades a scene to FAILED (rather than failing the whole restore) when its file is missing on disk
- `page.tsx` persists the story id to `localStorage` on creation (cleared at the start of every new attempt so a stale id can't outlive its story) and rehydrates on mount via `loadStoryAction`, falling back silently to the create screen on a stale/not-found id, with no UI flash while restoring
- Verified the full restore path directly against the real `prisma/dev.db` (not just unit tests, since no browser-driving tool was available in this executor session): a scene with a real file on disk returns READY with a working `data:` URL, a scene whose file is missing downgrades to FAILED, and both an unknown and a malformed story id return not-found rather than throwing -- the serialized response never contained `storage/stories`
- Zero real paid provider calls anywhere in this plan; the dev ledger is confirmed unchanged at **$2.9370 of $3.00** before and after both tasks

## Task Commits

1. **Task 1: Every scene asset and every paid call becomes durable, without ever losing a paid result** - `f2b3815` (feat)
2. **Task 2: Reopening the browser restores the last story's scenes and their statuses** - `1a07bc9` (feat)

**Plan metadata:** committed alongside this SUMMARY

## Files Created/Modified

- `src/core/persistence/generation-repository.ts` -- `recordGeneration`, `recordGenerations`, `updateSceneImage`, `updateSceneVideo`, `PendingGenerationRecord`
- `src/core/persistence/generation-repository.test.ts` -- 6 integration tests against a temp SQLite file
- `src/core/persistence/story-view.ts` -- `toLoadedStory`, `LoadedStory`, `LoadedSceneStatus`
- `src/core/persistence/story-view.test.ts` -- 4 pure-mapper tests, no database, no filesystem
- `src/app/actions/load-story.ts` -- `loadStoryAction`, `LoadStoryResult`
- `src/core/uniqueness/check.ts` -- spend accumulation on `runUniqueStoryDirector`/`compareViaLlm`
- `src/core/uniqueness/check.test.ts` -- 5 new spend-accumulation tests
- `src/app/actions/create-story.ts` -- flushes `result.spend` via `recordGenerations` after the save
- `src/app/actions/generate-images.ts` -- dual write at every branch (ready/blocked/disk-failure/ceiling/thrown)
- `src/app/actions/generate-video.ts` -- dual write at every branch (ready/timeout/blocked/unreadable/ceiling/read-failure/thrown)
- `src/app/page.tsx` -- localStorage-backed restore effect, imageDataUrl-keyed readiness, `canGenerateVideo` guard
- `src/scripts/persistence-probe.ts` -- `--simulate-assets` mode, `runWrite` GenerationRecord cleanup fix
- `package.json` -- `test:lib` gains the two new test files

## Decisions Made

- Temp-database test helper duplicated (not extracted) into `generation-repository.test.ts` -- see key-decisions in frontmatter for the full reasoning.
- `check.ts`'s spend accumulation rides an optional side-effect parameter rather than changing `compareViaLlm`'s/`escalate`'s return types, to avoid touching 03-02's ~20 existing tests.
- A failed story-director attempt's spend record uses a placeholder `model` string rather than a real model id (director.ts out of scope) -- logged to WINDOWS.md.
- Readiness checks (`allImagesReady`, `readyCount`, `SceneCard` state) switched from `imagePath` to `imageDataUrl` truthiness so a restored story reports correct readiness; a new `canGenerateVideo` guard keeps the video button honestly disabled after a restore, since regenerating requires a real path a restore deliberately never exposes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `persistence-probe.ts`'s `runWrite` would break its own re-runnability once `GenerationRecord` got a writer**
- **Found during:** Task 1, re-running `--write` after `--simulate-assets` during verification
- **Issue:** `runWrite` only cleared prior `Scene`/`Story` rows for the probe id, not `GenerationRecord` rows. Once this plan gave `GenerationRecord` its first writer (`--simulate-assets`), a second `--write` invocation would leave orphaned `GenerationRecord` rows referencing a deleted `Story`, or fail outright on the foreign-key constraint.
- **Fix:** Added `prisma.generationRecord.deleteMany({ where: { storyId: PROBE_STORY_ID } })` before the existing `Scene`/`Story` deletes.
- **Files modified:** `src/scripts/persistence-probe.ts`
- **Verification:** Ran `--write` -> `--simulate-assets` -> `--write` -> `--simulate-assets` -> `--read` in sequence; every step succeeded with the expected idempotent counts.
- **Committed in:** `f2b3815` (Task 1 commit)

**2. [Rule 1 - Bug] Restored-story readiness would have read as 0-of-N ready**
- **Found during:** Task 2, while designing the restore's interaction with the existing "Generate Video" button
- **Issue:** `allImagesReady`/`readyCount`/`SceneCard`'s `state` all keyed off `imagePath` truthiness. A restored scene's `imagePath` is deliberately null (T-03-15 forbids a path crossing into the browser), so a fully-restored, fully-ready story would have shown "0 of N ready" and a permanently disabled video button, even though every scene image was visibly rendering.
- **Fix:** Switched the three checks to `imageDataUrl` truthiness -- the value that actually renders, and the one value both the live-generation and restore paths always populate together with `ok: true`.
- **Files modified:** `src/app/page.tsx`
- **Verification:** Confirmed via code review that the live-generation path's `imagePath`/`imageDataUrl` are always set/unset together, so this is a no-op behavior change for live generation and a correctness fix for restore.
- **Committed in:** `1a07bc9` (Task 2 commit)

**3. [Rule 2 - Missing Critical] Video button would silently no-op after a restore**
- **Found during:** Task 2, immediately after fixing Deviation 2 above
- **Issue:** Fixing the readiness check (Deviation 2) would have enabled the "Generate Video" button and per-scene retry for a restored, fully-ready story -- but `handleGenerateVideo` requires a real `imagePath`, which a restored scene never has (T-03-15). Without a guard, the wife could click a visibly-enabled button that does nothing.
- **Fix:** Added `canGenerateVideo = allImagesReady && Boolean(videoTargetStatus?.imagePath)`, used for the button's `disabled` prop and the per-scene retry handler; added an honest explanatory message for this specific state.
- **Files modified:** `src/app/page.tsx`
- **Verification:** Traced through both the live-generation path (imagePath present -> `canGenerateVideo` behaves identically to the old `allImagesReady`) and the restore path (imagePath null -> button stays disabled with an explanatory message).
- **Committed in:** `1a07bc9` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 missing critical). **Impact on plan:** All three were necessary for correctness once the restore path existed; none introduced scope creep or a new dependency.

## Issues Encountered

- No browser-driving tool (Playwright, etc.) was available in this executor session to perform Task 2's `<human-check>` as a literal live click-through. Substituted with a direct, real invocation of `loadStoryAction` against the actual `prisma/dev.db` (not a mock), covering the ready-with-real-file case, the missing-file-downgrade case, and both not-found cases -- see coverage item D6's `human_judgment: true` rationale. A live visual click-through should still happen at `/gsd-verify-work` or end-of-phase UAT.
- `npm run lint` fails on the same pre-existing `typescript`/`typescript-eslint` version mismatch documented in 03-02-SUMMARY.md and WINDOWS.md -- unrelated to this plan's changes, `npm run typecheck` and `npm run build` both pass clean.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- **VIDEO-03 outcome: SHIPPED, not dropped.** The database half (scene image/video path+status survives a restart) and the browser-resume half (reopening the browser restores the last story) both work. Verified directly against `prisma/dev.db`: a restored scene with a real file returns READY with a working `data:` URL; a scene whose file is missing on disk downgrades to FAILED without breaking the rest of the restore; an unknown or malformed story id returns not-found rather than throwing; the serialized restore payload never contains `storage/stories`.
- **Accepted narrow gap (documented, not silently broken):** after a restore, the per-scene video Generate/Retry action is intentionally disabled, since a restored scene carries no filesystem path (T-03-15) and `generateSceneVideoAction` needs a real path to re-read the source image. A fresh full generation is required to animate a scene again. This is the one place VIDEO-03's soft criterion and T-03-15's hard prohibition are in tension, resolved in T-03-15's favor per the threat model.
- Plan 03-04 (the real end-to-end proof run) inherits a fully-wired persistence layer: every scene's real path/status and every real call's real cost will now be durable during that run, with zero code changes needed there.
- The dev ledger's `$0.0630` headroom is fully intact -- nothing in this plan spent any of it.
- Phase 5's per-story spend breakdown (BUDGET-03) can now query `GenerationRecord` grouped by `storyId` directly -- every record carries a required (never nullable) `storyId` foreign key, exactly as 03-RESEARCH.md's Architectural Responsibility Map anticipated.

---
*Phase: 03-persistence-structural-uniqueness*
*Completed: 2026-09-13*

## Self-Check: PASSED

- `src/core/persistence/generation-repository.ts` -- FOUND
- `src/core/persistence/generation-repository.test.ts` -- FOUND
- `src/core/persistence/story-view.ts` -- FOUND
- `src/core/persistence/story-view.test.ts` -- FOUND
- `src/app/actions/load-story.ts` -- FOUND
- Commit `f2b3815` -- FOUND in `git log --oneline --all`
- Commit `1a07bc9` -- FOUND in `git log --oneline --all`
- All plan-level `<verification>` items re-run and passing: `node --test` over both new test files plus the extended `check.test.ts` (33/33, 0 failures, no network access used); `npm run test:lib` (123/123 passing); `node --env-file=.env.local src/scripts/persistence-probe.ts --write` then `--simulate-assets` reports `scenes-with-image=3 scenes-with-video=3 records=6 records-with-cost=6` and `PERSISTENCE PROBE: assets ok`; `git diff --exit-code -- src/lib/spend-ledger.ts` exits 0; `storage/_smoketest/spend-ledger.json` total confirmed exactly $2.9370 both before and after the plan; `npm run typecheck` passes clean; `npm run build` passes clean; `node src/scripts/check-boundaries.ts` exits 0 with all 4 invariants `OK:`. `npm run lint` fails on the same pre-existing, unrelated `typescript`/`typescript-eslint` version mismatch documented in 03-02-SUMMARY.md and WINDOWS.md.
