---
phase: 04-wife-facing-review-approval-flow
reviewed: 2026-09-16T00:00:00Z
depth: standard
files_reviewed: 38
files_reviewed_list:
  - .env.local.example
  - package.json
  - prisma/migrations/20260914153829_phase4_approval_and_attempts/migration.sql
  - prisma/schema.prisma
  - src/app/actions/approve-images.ts
  - src/app/actions/generate-all-videos.ts
  - src/app/actions/generate-video.ts
  - src/app/actions/get-story-status.ts
  - src/app/actions/list-stories.ts
  - src/app/actions/load-story.ts
  - src/app/actions/open-story-folder.ts
  - src/app/actions/regenerate-scene-image.ts
  - src/app/actions/retry-scene-video.ts
  - src/app/page.tsx
  - src/components/scenes/SceneCard.tsx
  - src/components/scenes/SceneVideo.tsx
  - src/components/story/MyStoriesList.tsx
  - src/components/story/VideoStatusScreen.tsx
  - src/core/approval/gates.test.ts
  - src/core/approval/gates.ts
  - src/core/output/episode-export.test.ts
  - src/core/output/episode-export.ts
  - src/core/persistence/generation-repository.test.ts
  - src/core/persistence/generation-repository.ts
  - src/core/persistence/story-repository.ts
  - src/core/persistence/story-view.test.ts
  - src/core/persistence/story-view.ts
  - src/core/retry/caps.test.ts
  - src/core/retry/caps.ts
  - src/core/storage-paths.test.ts
  - src/core/storage-paths.ts
  - src/core/video/batch.test.ts
  - src/core/video/batch.ts
  - src/lib/db.test.ts
  - src/lib/spend-ledger.test.ts
  - src/lib/test-db.ts
  - src/scripts/check-boundaries.ts
  - src/scripts/story-probe.ts
  - src/types/better-sqlite3.d.ts
findings:
  critical: 1
  warning: 0
  info: 0
  total: 1
status: issues_found
---

# Phase 4: Code Review Report (Fourth Pass / Convergence Check)

**Reviewed:** 2026-09-16T00:00:00Z
**Depth:** standard (with targeted cross-file tracing per the review brief)
**Files Reviewed:** 38
**Status:** issues_found

## Summary

This is a genuinely fresh pass, not a re-confirmation of the prior three. I re-read every gate
(`evaluateVideoDispatch`, `evaluateBatchDispatch`, `evaluateApproval`, `evaluateImageRegeneration`),
the CR-03 mutex in `generate-video.ts`, the batch runner, every Server Action in scope, the schema/
migration, and the client-side state machine in `page.tsx`/`VideoStatusScreen.tsx`/`SceneVideo.tsx`
that drives them, specifically hunting for anything the three prior passes' fixes might have left
open or newly interact badly with.

The sixteen previously-fixed findings all still look correctly closed on this reading (the CR-03
mutex genuinely serializes every call into `dispatchSceneVideo` app-wide; the CR-01 batch filter
genuinely excludes `GENERATING`/`READY` scenes from a *snapshot*; WR-02's attempt-counter placement
is correctly load-bearing only at the real dispatch boundary; IN-01's dedup set is correctly keyed).

However, tracing the interaction between `generateAllVideosAction`'s snapshot-then-background-loop
design and the client's own `batchDispatched` reset behavior surfaced one real, not-yet-closed
double-dispatch path — a genuine budget/data-integrity gap, not a re-confirmation of anything
already fixed. Full detail below. This is the only finding from this pass; I did not find
Warning- or Info-level issues worth reporting once this was accounted for — the rest of the changed
surface reads clean.

## Critical Issues

### CR-01: Two overlapping "Generate All Videos" batches can double-dispatch (and double-spend) the same not-yet-reached scenes

**Files:**
- `src/core/approval/gates.ts:47-82` (`evaluateVideoDispatch`)
- `src/core/approval/gates.ts:163-195` (`evaluateBatchDispatch`)
- `src/app/actions/generate-all-videos.ts:40-71` (`generateAllVideosAction`)
- `src/app/page.tsx:170-206` (`applyLoadedStory`, specifically the `setBatchDispatched(false)` reset and its accompanying comment)

**Issue:**

The CR-03 mutex (`generate-video.ts`'s `videoDispatchChain`) guarantees that no two calls into
`dispatchSceneVideo` ever *execute concurrently*. The CR-01 fix from the third pass makes
`evaluateBatchDispatch` exclude any scene whose `videoStatus` is already `"GENERATING"` or
`"READY"` **at the moment that snapshot is taken**. Neither of these closes the case where two
independent `generateAllVideosAction` calls are made for the *same story* while the first one's
`after()` background loop is still working through its own scene list — which is a completely
realistic, even design-anticipated, sequence of events in this app:

1. The wife clicks "Generate All Videos" for a 7-scene story. `generateAllVideosAction` computes
   `sceneNumbers = [1,2,3,4,5,6,7]` (all `WAITING`) and schedules an `after()` callback that calls
   `runBatchVideoDispatch`, which dispatches scene 1, awaits it (a live Veo call, potentially
   minutes), then scene 2, etc. — **strictly sequentially, one scene enqueued onto the mutex at a
   time**, not all seven queued up front.
2. While scene 2 (say) is still genuinely in flight, the wife reloads the page, or reopens the same
   story from "My Stories" (`handleOpenLibraryStory` → `applyLoadedStory`). `applyLoadedStory`
   **unconditionally sets `batchDispatched` back to `false`** for any approved story (see the doc
   comment at `page.tsx:170-182`, which explicitly argues this is "always safe... mid-batch"), so
   the "Generate All Videos" button reappears on Screen 4.
3. She clicks it again. `generateAllVideosAction` runs a second time, fetches a **fresh** snapshot:
   scene 1/2 are excluded (`READY`/`GENERATING`), but scenes 3–7 are still `WAITING` (batch 1's
   sequential loop hasn't reached them yet — it's still awaiting scene 2). `evaluateBatchDispatch`
   correctly-by-its-own-contract returns `sceneNumbers = [3,4,5,6,7]` and a **second** `after()`
   callback is scheduled.
4. Batch 2's loop starts immediately and enqueues `generateSceneVideoAction(3)`, `(4)`, ... onto the
   *same* app-wide mutex — ahead of batch 1's own eventual call for scene 3, since batch 1 is still
   blocked awaiting scene 2's real network round-trip. Batch 2 runs scenes 3–7 to completion
   (mutex-serialized, but each one is a real, separate, billed Veo call).
5. Once batch 1's scene 2 finally resolves, batch 1's loop proceeds to call
   `generateSceneVideoAction(3)` — now enqueued *after* batch 2 has already finished all of 3–7.
   `evaluateVideoDispatch` (`gates.ts:47-82`) **does not check `scene.videoStatus` at all** — it
   only checks approval, scene existence, `videoAttempts >= cap`, and `imageStatus`. Since scene 3
   is now `READY` (written by batch 2) but still under its attempt cap, `evaluateVideoDispatch`
   grants dispatch **again**. The scene is regenerated a second time, for no benefit, at real cost.
   The same happens for scenes 4, 5, 6, 7.

Net effect: every scene batch 1 had not yet reached when batch 2 was triggered gets a real, paid
Veo call **twice** — doubling that portion of the story's video spend against the "$15 hard cap,
no exceptions, no bypass via retry" constraint, and consuming two attempts out of the
`MAX_SCENE_RETRY_ATTEMPTS` cap instead of one per scene.

This is strictly worse than a pure cost duplication in one more way: if the duplicate dispatch's
`checkCeiling` call (`generate-video.ts:171`) throws because the *first* batch's legitimate spend
already consumed the remaining headroom, `dispatchSceneVideo` calls
`updateSceneVideo(storyId, sceneNumber, null, SceneAssetStatus.FAILED)` — **downgrading an already-
`READY` scene (with a perfectly good video file already on disk) to `FAILED`**. Two further
consequences follow from that:
- `getStoryStatusAction`/`VideoStatusScreen` would then show that scene as failed/"budget reached"
  even though a working clip exists, misleading the wife into thinking generation failed.
- `exportEpisodeAssets` (`episode-export.ts:195`) gates on `scene.videoStatus === "READY"` to decide
  whether to include a clip — a scene wrongly downgraded to `FAILED` this way is silently **omitted
  from the CapCut-ready output folder**, even though its video file is sitting on disk untouched.
  This is exactly the "silently shipping" failure mode the project's own constraints are written to
  prevent.

Neither the CR-03 mutex nor the third-pass CR-01 batch-snapshot filter closes this, because:
- The mutex only prevents two dispatches for the same scene from running *at the same instant*; it
  does nothing about two dispatches for the same scene running back-to-back, one after the other.
- `evaluateBatchDispatch`'s filter is a one-time snapshot at the moment a batch is *requested*; it
  has no way to see work that a **different, already-running** batch invocation will reach later.
- The one gate that runs immediately before every real dispatch — `evaluateVideoDispatch` — is
  deliberately scene-status-blind (by the third pass's own explicit design, to keep the stuck-
  `GENERATING` single-scene retry path alive), so it grants dispatch for an already-`READY` scene
  exactly as readily as for a never-started one.

Note this does not require two browser tabs or any unusual timing to trigger — the race window is
scene-generation-duration wide (each Veo call can legitimately take minutes), and reopening a story
mid-batch via "My Stories" or a page reload is exactly the flow `page.tsx`'s own comment describes
as an expected, safe user action.

**Fix:**

The narrowest fix that preserves the third pass's explicit intent (never breaking the stuck-
`GENERATING` retry path) is to make `evaluateVideoDispatch` refuse when the scene is already
`videoStatus === "READY"` — a scene that has already succeeded should never be re-dispatched by any
caller, batch or single-scene, and this is the one status value with no legitimate reason to ever
re-enter dispatch:

```ts
// src/core/approval/gates.ts, inside evaluateVideoDispatch, after the cap check
// and before the imageStatus check:
if (scene.videoStatus === "READY") {
  return {
    allowed: false,
    message: "This scene's video has already been generated.",
  };
}
```

With this in place, batch 1's late-arriving call for scene 3 (now `READY` from batch 2) is refused
gracefully at the single authoritative gate, instead of silently re-dispatching. This does not
touch the `GENERATING` case at all, so `retrySceneVideoAction`'s ability to re-dispatch a scene
stuck at `GENERATING` after a dropped `after()` callback (04-RESEARCH.md Pitfall 2) is unaffected.

This closes the specific "already-succeeded scene gets re-billed" case, which is the majority of the
damage above. It does not, by itself, prevent two overlapping batches from both attempting a scene
that is simultaneously `WAITING` in both snapshots and not yet reached by either loop — but because
the mutex still serializes actual execution, only one of those two calls will ever get to a scene
while it is genuinely still `WAITING`; whichever runs second will find it `READY` (post-fix, refused)
or (in the rarer instant-tie case) `GENERATING` (still a gap, but a much narrower and cheaper one —
one duplicate call maximum instead of the current unbounded-until-cap behavior). If a fully airtight
guarantee is wanted, the durable fix is a story-scoped server-side "batch already running" flag
(e.g. a boolean or timestamp column, or an in-memory `Set<storyId>` guarded the same way
`videoDispatchChain` is) that `generateAllVideosAction` checks and sets before scheduling its
`after()` work, and clears when the batch's loop completes — independent of the client's
`batchDispatched` state, which cannot be trusted to reflect whether a previous request's background
work is still alive.

---

_Reviewed: 2026-09-16T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
