---
phase: 04-wife-facing-review-approval-flow
plan: 03
subsystem: video
tags: [next-server-actions, after, veo, react-client-state, polling, batch-dispatch]

# Dependency graph
requires:
  - phase: 04-wife-facing-review-approval-flow (04-01)
    provides: evaluateVideoDispatch, maxSceneRetryAttempts, incrementVideoAttempt, Scene.videoAttempts, SceneAssetStatus.GENERATING
  - phase: 04-wife-facing-review-approval-flow (04-02)
    provides: Story.imagesApprovedAt, approveStoryImagesAction, Screen 3 approval flow
provides:
  - "One \"Generate All Videos\" action (D-04) that starts every approved scene's video job and returns immediately"
  - "A genuinely new fourth screen (D-05, VideoStatusScreen) that polls DB-backed per-scene status"
  - "Per-scene retry (VIDEO-04) delegating to the same gated dispatch, plus a capped state and a stuck-in-flight affordance"
  - "A restore-on-mount path that lands an already-approved story back on Screen 4, not Screen 3"
affects: [04-04, any future phase touching the video pipeline or the wife-facing screen flow]

# Actuals (#2632)
actuals:
  tokens: 11109
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injected-dispatcher orchestration for a batch of independent paid jobs (runBatchVideoDispatch), mirroring runUniqueStoryDirector's bounded sequential loop and its injected-deps test convention"
    - "GENERATING written before dispatch so an in-flight job is distinguishable from a never-started one across an after()-callback interruption"
    - "Fast client-side refusal (evaluateBatchDispatch) layered over, never substituting for, the real per-call gate (evaluateVideoDispatch) that already runs inside the delegate"
    - "One-line delegation retry action (retrySceneVideoAction) with zero logic of its own, so it structurally cannot forget to re-check approval or the retry cap"
    - "DB-polled status screen (no in-memory job registry) so job state survives an app restart"

key-files:
  created:
    - src/core/video/batch.ts
    - src/core/video/batch.test.ts
    - src/app/actions/generate-all-videos.ts
    - src/app/actions/get-story-status.ts
    - src/app/actions/retry-scene-video.ts
    - src/components/story/VideoStatusScreen.tsx
  modified:
    - src/core/approval/gates.ts
    - src/core/approval/gates.test.ts
    - src/core/persistence/story-view.ts
    - src/app/actions/generate-video.ts
    - src/components/scenes/SceneVideo.tsx
    - src/app/page.tsx
    - package.json

key-decisions:
  - "batchDispatched is left false when restoring an already-approved story, never inferred true from partial per-scene progress — D-04's batch dispatch is idempotent (skips READY/at-cap scenes) so re-showing the button is always safe, whereas inferring true would permanently strand a scene left at WAITING by a dropped after() callback, since VideoStatusScreen has no per-scene \"start\" action, only retry"
  - "Task 3's checkpoint was verified by the orchestrator via direct source reading rather than a live wife click-through, consistent with 04-02's precedent — no real story currently has all-ready images, and a real click-through's \"Generate All Videos\" press would cost $1.00-$2.80 against $0.1630 of remaining dev-ceiling headroom"
  - "Item 7 of the Task 3 checklist (reload restores Screen 4, not Screen 3, for an already-approved story) genuinely FAILED on first check and was fixed, not waived — the restore-on-mount effect unconditionally set screen to \"review-images\"; it now branches on result.imagesApproved"

requirements-completed: [VIDEO-02, VIDEO-04, UI-01]

coverage:
  - id: D1
    description: "One \"Generate All Videos\" action gathers eligible scenes behind the approval gate and dispatches them sequentially in the background via after(); one scene failing, throwing, or being at its cap never blocks another"
    requirement: "VIDEO-02"
    verification:
      - kind: unit
        ref: "src/core/video/batch.test.ts#every supplied scene number is attempted exactly once, in the order given"
        status: pass
      - kind: unit
        ref: "src/core/video/batch.test.ts#a dispatcher that throws for one scene is recorded in failed, does not propagate, and does not stop the loop"
        status: pass
      - kind: unit
        ref: "src/core/video/batch.test.ts#calls are sequential, not parallel -- no two dispatch calls overlap in time"
        status: pass
      - kind: unit
        ref: "src/core/approval/gates.test.ts (evaluateBatchDispatch coverage: unapproved refusal, eligible-scene selection, already-READY exclusion, at-cap exclusion, nothing-left refusal)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A single failed scene can be retried from Screen 4 through the same gated dispatch the batch uses; an exhausted scene shows a calm amber explanation with no button; a scene stuck in flight past twelve minutes offers a retry"
    requirement: "VIDEO-04"
    verification:
      - kind: unit
        ref: "node -e delegation check on src/app/actions/retry-scene-video.ts (DELEGATION OK)"
        status: pass
      - kind: unit
        ref: "src/core/approval/gates.test.ts, src/core/video/batch.test.ts, src/core/retry/caps.test.ts (full re-run, no regressions)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Screen 4 reads as a plain-language, wife-facing status board with independent per-scene rows and no developer terminology (Task 3 checklist items 1-6 and 8)"
    requirement: "UI-01"
    verification:
      - kind: manual_procedural
        ref: "Task 3 8-item checklist, verified by the orchestrator via direct source reading (StoryReview.tsx / VideoStatusScreen.tsx / page.tsx), substituting for a live click-through per the dev-ceiling budget constraint"
        status: pass
    human_judgment: true
    rationale: "This is a UX/copy adequacy check with no automated test coverage; verified by the orchestrator reading source rather than the wife herself, following 04-02's established precedent, because no real story currently has all-ready images and a live click-through's inevitable proximity to the \"Generate All Videos\" button risks an accidental real spend. A live human click-through is still recommended once a real story reaches full image-ready state."
  - id: D4
    description: "Task 3 checklist item 7 (reload the page, Screen 4 is reachable again with the same per-scene states) initially FAILED — the restore-on-mount effect always landed on Screen 3 — and was fixed so an already-approved story's reload lands on Screen 4 with per-scene state seeded from the loaded story"
    requirement: "UI-01"
    verification:
      - kind: other
        ref: "npm run typecheck, npm run build, node src/scripts/check-boundaries.ts, npm run test:lib (165/165) all re-run clean against the fix in commit 5c0b06d"
        status: pass
    human_judgment: true
    rationale: "The fix compiles, builds, and passes every automated gate, but the corrected on-screen restore behavior itself (item 7) was not re-observed in a live browser reload after the fix — only source-level and type-level verification. A human should confirm the actual reload behavior at the next real browser check, alongside D3."

# Metrics
duration: ~21h wall-clock across two sessions (see Performance below); active execution time was short
completed: 2026-09-15
status: complete
---

# Phase 4 Plan 3: Batch Video Dispatch & Video Status Screen Summary

**One "Generate All Videos" action drives every approved scene's video job through a DB-polled, per-scene-independent fourth screen (VideoStatusScreen), with single-scene retry, a capped-out state, a stuck-in-flight affordance, and a restore-on-reload fix so an already-approved story reopens directly on that screen.**

## Performance

- **Duration:** ~21h wall-clock, but not continuous active work. Task 1 and Task 2 were committed within 4 minutes of each other (`2026-09-15T00:21:09+08:00` → `2026-09-15T00:25:10+08:00`). The plan then reached Task 3's `blocking-human` checkpoint. The orchestrator verified the 8-item checklist via direct source reading (see Deviations below), found item 7 failing, and a prior executor session wrote the fix but was cut off mid-session by a rate-limit error before committing it. This closeout session verified the uncommitted fix, ran the remaining verification, and committed at `2026-09-15T12:57:49Z` (`20:57:49+08:00`).
- **Started:** 2026-09-15T00:21:09+08:00 (Task 1 commit)
- **Completed:** 2026-09-15T12:58:00Z
- **Tasks:** 3 (2 implementation tasks + 1 checkpoint:human-verify)
- **Files modified:** 13 (matches the plan's `files_modified` list exactly)

## Accomplishments

- `evaluateBatchDispatch` (gates.ts) gathers every eligible scene behind the real approval gate, excluding already-READY and at-cap scenes, so pressing "Generate All Videos" twice can never pay twice for a finished scene.
- `runBatchVideoDispatch` (batch.ts) is a pure, injected-dispatcher orchestrator that dispatches scenes sequentially, tolerates a failing or throwing scene without stopping the loop, and is fully provable with a fake dispatcher at zero real spend.
- `generateAllVideosAction` schedules the batch via `next/server`'s `after()` and returns to the browser immediately with the locked confirmation copy; the real per-call approval and cap gates still run inside `generateSceneVideoAction` for every scene in the loop.
- A new `VideoStatusScreen` (Screen 4, D-05) renders each scene's own independently-interactive row via the existing `SceneVideo` component, polling `getStoryStatusAction` (which reads no files and returns no path-shaped field).
- `retrySceneVideoAction` (VIDEO-04) is a one-line delegation to the same gated dispatch used by the batch — it cannot structurally forget to re-check approval or the retry cap.
- `SceneVideo` gained a "capped" state (amber, no button) and a "stuck" affordance on "generating" past twelve minutes, so an `after()` callback dropped by a dev-server recompile has a visible way out.
- **Fixed a real bug found at the Task 3 checkpoint:** the restore-on-mount effect in `page.tsx` now branches on `result.imagesApproved`, seeding `videoScenes` from the loaded story and landing on `"video-status"` (Screen 4) instead of unconditionally landing back on `"review-images"` (Screen 3).

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end batch video dispatch and the new Video Status screen** - `54ae724` (feat)
2. **Task 2: Retry a single failed/stuck scene, and add the capped state** - `4ea62f8` (feat)
3. **Task 3 checkpoint fix: restore lands on Screen 4, not Screen 3, when a story is already approved** - `5c0b06d` (fix)

**Plan metadata:** (this commit, following this SUMMARY)

## Files Created/Modified

- `src/core/video/batch.ts` - Pure, injectable sequential batch orchestrator (`runBatchVideoDispatch`)
- `src/core/video/batch.test.ts` - Fake-dispatcher coverage: sequential, fault-tolerant, exactly-once-per-scene
- `src/core/approval/gates.ts` - `evaluateBatchDispatch` (batch-level fast refusal + eligible-scene selection)
- `src/core/approval/gates.test.ts` - Coverage for `evaluateBatchDispatch`'s refusal/selection branches
- `src/core/persistence/story-view.ts` - `LoadedAssetStatus` extended with `"GENERATING"`
- `src/app/actions/generate-video.ts` - Writes `GENERATING` before dispatch so in-flight is visible
- `src/app/actions/generate-all-videos.ts` - New Server Action: gate → `after()` → background batch dispatch
- `src/app/actions/get-story-status.ts` - New Server Action: DB-polled per-scene status, no file reads
- `src/app/actions/retry-scene-video.ts` - New Server Action: one-line delegation retry
- `src/components/story/VideoStatusScreen.tsx` - New Screen 4 component
- `src/components/scenes/SceneVideo.tsx` - Added `"capped"` state and `stuck` prop
- `src/app/page.tsx` - Screen union, batch/retry/poll wiring, and the restore-on-mount fix
- `package.json` - Registered `src/core/video/batch.test.ts` in `test:lib`

## Decisions Made

- `batchDispatched` is never inferred `true` on restore from partial per-scene progress — always `false`, because the batch dispatch is idempotent and re-showing the button is the only way to nudge forward a scene stranded at WAITING by a dropped `after()` callback (VideoStatusScreen has no per-scene "start" action, only retry).
- Task 3's checkpoint was verified by the orchestrator via source reading rather than a live wife click-through, matching 04-02's established precedent, to avoid risking real spend against $0.1630 of remaining dev-ceiling headroom.
- Item 7's failure was fixed, not waived or deferred — this project's convention (per STATE.md) is to record real findings honestly rather than presenting a sanitized all-pass narrative.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Restore-on-mount landed on Screen 3 instead of Screen 4 for an already-approved story**
- **Found during:** Task 3's checkpoint verification (item 7 of the 8-item checklist)
- **Issue:** `page.tsx`'s restore-on-mount effect unconditionally called `setScreen("review-images")` after reading `result.imagesApproved`, regardless of its value. A wife who already approved images and reloaded the page (or returned in a new session) was sent back to the image-review screen — one extra, redundant click away from Screen 4 — rather than directly back to the video-status board she was last looking at, with her per-scene states restored.
- **Fix:** The effect now branches on `result.imagesApproved`. When true: build `videoScenes` from `result.scenes`' `videoStatus`/`videoDataUrl` fields (READY→ready, FAILED→failed, GENERATING→generating, else→waiting), set `batchDispatched: false` (deliberately — see Decisions above), clear `batchStarting`/`batchError`, and set `screen` to `"video-status"`. When false: unchanged original behavior (`"review-images"`).
- **Files modified:** `src/app/page.tsx`
- **Verification:** `npm run typecheck` (clean, 0 errors), `npm run build` (compiles, all routes static), `node src/scripts/check-boundaries.ts` (5/5 OK, including the single-paid-dispatch-point invariant), `npm run test:lib` (165/165 passing, no regressions), dev spend ledger re-confirmed unchanged at exactly `$3.0870` via `node src/scripts/smoke-test.ts --report`.
- **Committed in:** `5c0b06d`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for D-05's stated promise ("Screen 4 is reachable again with the same per-scene states" on reload) to actually hold. No scope creep — the fix touches only the restore-on-mount branch already scoped to this task's `<files>` list.

## Issues Encountered

- The prior executor session that wrote this fix was cut off by a rate-limit error before it could commit. The fix itself was correct and complete when found by this session — verified against the exact diff described by the orchestrator before being committed unchanged. No rework was needed; only the remaining verification (build/boundaries/tests/ledger) and closeout were performed in this session.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- D-04 and D-05 are both delivered and verified: batch video dispatch, per-scene independent status, single-scene retry, capped state, stuck-in-flight affordance, and a correct restore path are all in place.
- Plan 04-04 (per the plan's own note) owns the "Open Output Folder" CTA that completes the `allReady` row already shipped in `VideoStatusScreen.tsx`.
- Outstanding, recommended (not blocking): a live wife click-through of Screen 4 in a real browser session once a real story reaches full image-ready state — both the checkpoint's 8-item checklist and the item-7 fix were verified via source reading and automated gates, not a live browser observation. Dev ceiling headroom remains $0.1630 of $3.25; a real "Generate All Videos" batch press costs an estimated $1.00-$2.80 and should be discussed with the user before dispatching.
- Dev spend ledger unchanged throughout this plan: `$3.0870` of `$3.25` (no real paid call was made in Tasks 1-3 or in this closeout).

## Self-Check: PASSED

- All 8 key files (created + representative modified) confirmed present on disk with `[ -f ]`.
- All 3 task commits (`54ae724`, `4ea62f8`, `5c0b06d`) confirmed present in `git log --oneline --all`.
- `npm run typecheck`, `npm run build`, `node src/scripts/check-boundaries.ts` (5/5 OK), and `npm run test:lib` (165/165) all re-run clean against the final state.
- Dev spend ledger re-confirmed unchanged at `$3.0870` via `node src/scripts/smoke-test.ts --report`.

---
*Phase: 04-wife-facing-review-approval-flow*
*Completed: 2026-09-15*
