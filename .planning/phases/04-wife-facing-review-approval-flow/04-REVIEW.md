---
phase: 04-wife-facing-review-approval-flow
reviewed: 2026-09-15T00:00:00Z
depth: standard
files_reviewed: 37
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
  critical: 3
  warning: 4
  info: 2
  total: 9
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-09-15
**Depth:** standard
**Files Reviewed:** 37 (`.env.local.example` could not be read -- sandboxed out by the review environment's own permission settings; not reviewed, not held against the implementation)
**Status:** issues_found

## Summary

This is a re-review of the wife-facing review/approval/video-status flow after four prior findings (CR-01, WR-01, WR-02, WR-03) were reported fixed. All four fixes were re-verified against the current code and traced end-to-end; all four are correct and complete (see "Verification of previously-fixed issues" below).

A fresh pass over every listed file, however, surfaces three new Critical-tier issues and four Warnings. The most serious is a chain of two defects that combine to permanently strand a wife's episode with no error message and no recovery path: a failed image regeneration is silently swallowed by the browser (page.tsx never surfaces a non-cap failure), and once a story is approved there is no way back to the screen that could retry it, so a scene stuck at `imageStatus=FAILED` also stays stuck at `videoStatus=WAITING` forever -- the completion banner, the auto-export, and the Library's status label all silently never fire for that story. A third Critical issue is a budget-ceiling race between the sequential "Generate All Videos" batch and an independently-dispatchable single-scene retry, which can push combined spend past the project's hard $-ceiling exactly the way the project's own written constraint says must never happen ("no exceptions, no bypass via retry").

## Verification of previously-fixed issues

- **CR-01 (polling stopped permanently once the batch settled)** -- FIXED. `page.tsx`'s poll effect (`nothingLeftToRetry`, lines 581-586) now only clears the interval when every scene is `READY` or `FAILED && capReached`; a scene that is still `GENERATING`, or `FAILED` but under its retry cap, keeps the poll alive. Traced through the "stuck" (`stuck: true`) and plain-`FAILED` retry paths -- both keep at least one scene out of the terminal set, so the interval cannot be cleared while a retry affordance is still on screen. Confirmed correct.
- **WR-01 (capMessage mislabeling)** -- FIXED. `evaluateImageRegeneration` (`gates.ts` lines 115-140) now tags every refusal with a `reason: "not-found" | "cap"`, and `regenerate-scene-image.ts` (line 84) discriminates on `decision.reason === "cap"` rather than on `story`'s truthiness. Confirmed correct.
- **WR-02 (attempt counter consumed on a purely local failure)** -- FIXED for the video path. `generate-video.ts` now places `incrementVideoAttempt` (line 213) immediately before the real `generateVideo` dispatch, after both the ceiling check (which returns early without incrementing, lines 162-174) and the local image-read (which also returns early without incrementing, lines 184-202). Confirmed correct for video. Note: the equivalent fix was **not** carried over to the image-regeneration path -- see WR-06 below (new finding, not a regression of this one).
- **WR-03 (overlapping poll() calls)** -- FIXED. `page.tsx`'s polling effect now guards with a `pollInFlight` boolean (lines 495-505): a new `poll()` call returns immediately if the previous cycle's `pollOnce()` hasn't resolved yet. Confirmed correct.

## Critical Issues

### CR-01: A failed image regeneration is silently swallowed by the browser

**File:** `src/app/page.tsx:388-423`
**Issue:** `handleRegenerateImage` only reacts to two of `regenerateSceneImageAction`'s outcomes: a cap refusal (`result.capMessage`) and success (`result.ok`). When the regeneration genuinely fails mid-flight (Gemini blocks it, an unexpected error, etc.) -- `result.ok === false` and `result.capMessage === null` -- neither branch fires. `sceneStatuses` is never updated, so `SceneCard` keeps rendering the scene's previous "ready" state and the OLD image, while `generateSceneImagesAction`'s own internal failure path has already written `imageStatus = FAILED` to the database (mirroring `generate-video.ts`'s documented convention). The wife sees no error at all and has no reason to believe anything went wrong, while the persisted truth has already diverged from what she is looking at.
**Fix:**
```tsx
async function handleRegenerateImage(sceneNumber: number) {
  if (!storyId || regeneratingScene !== null) return;
  setRegeneratingScene(sceneNumber);

  try {
    const result = await regenerateSceneImageAction(storyId, sceneNumber);

    if (result.capMessage) {
      setImageCapMessages((prev) => ({ ...prev, [sceneNumber]: result.capMessage as string }));
    }

    setSceneStatuses((prev) =>
      prev.map((status) =>
        status.sceneNumber === sceneNumber
          ? {
              sceneNumber,
              imagePath: null,
              imageDataUrl: result.ok ? result.imageDataUrl : null,
              ok: result.ok,
              message: result.message,
            }
          : status,
      ),
    );

    if (result.approvalNotice) {
      setPostApprovalNotice(result.approvalNotice);
    }
  } finally {
    setRegeneratingScene(null);
  }
}
```

### CR-02: A scene whose image regeneration fails after approval permanently strands the episode

**File:** `src/app/page.tsx:160-204` (restore routing), `src/core/approval/gates.ts:159-190` (`evaluateBatchDispatch`), `src/app/page.tsx:581-586` (poll termination)
**Issue:** D-02 deliberately allows regenerating an image after the story is already approved, and `regenerate-scene-image.ts` even returns a dedicated `approvalNotice` for exactly this case. But nothing in this codebase provides a way to recover once that post-approval regeneration itself fails:
- `evaluateBatchDispatch` only dispatches scenes with `imageStatus === "READY"` (gates.ts lines 174-183), so a scene left at `imageStatus = FAILED` is never included in "Generate All Videos" and its `videoStatus` stays `WAITING` forever.
- The video-status screen's own poll-termination condition (`nothingLeftToRetry`, page.tsx lines 581-586) only treats `READY` or `FAILED && capReached` as terminal; a scene stuck at `WAITING` is neither, so the poll runs forever, `allVideosReady` never becomes true, the "Every scene is ready..." banner and `finalizeEpisodeAction` auto-export never fire, and `computeLibraryStatus` (story-view.ts) reports this story as indefinitely "Generating Videos" (never "Needs Attention"), since that label only checks `videoStatus === FAILED`, not `imageStatus`.
- There is no button anywhere on the video-status screen (`VideoStatusScreen`/`SceneVideo`) to regenerate an image, and once `imagesApprovedAt` is set, both the mount-time restore effect and the Library's `handleOpenLibraryStory` route straight to `"video-status"` (`applyLoadedStory`, page.tsx lines 160-204) -- the `"review-images"` screen that has the only regenerate-image control becomes permanently unreachable for that story, even across a page reload.

Combined with CR-01 above (the failure isn't even reported when it happens), the wife can end up on a video-status screen with one scene silently frozen at "waiting" forever, no error explaining why, and no way to fix it short of abandoning the story and starting a new one.
**Fix:** Two independent levers close this: (1) surface the regeneration failure (CR-01's fix) so she at least knows a scene needs attention; (2) give the video-status/Library screens a way back to a per-scene image-regeneration control (or embed a lightweight one directly in `VideoStatusScreen`) for any scene whose `imageStatus !== "READY"`, so the story is never permanently unreachable once approved. At minimum, `computeLibraryStatus` should treat an approved story with a non-READY `imageStatus` scene as `"Needs Attention"` rather than `"Generating Videos"`, so this state is at least visible instead of silently indistinguishable from normal progress.

### CR-03: Budget-ceiling race between the video batch and a single-scene retry

**File:** `src/app/actions/generate-video.ts:162-174,241-255`, `src/app/actions/retry-scene-video.ts`, `src/app/page.tsx:449-463`
**Issue:** `src/core/video/batch.ts`'s own doc comment states the sequential batch dispatch exists specifically to keep "exactly one paid call in flight at once." That invariant only holds *within* one `runBatchVideoDispatch` call, though. `retrySceneVideoAction` (a one-line delegation to `generateSceneVideoAction`) has no coordination with an in-flight batch: while `generateAllVideosAction`'s `after()` callback is sequentially working through scene N, the wife can click "Try again" on an already-failed scene M and dispatch a second, fully independent `generateSceneVideoAction` call concurrently. Both calls independently run `checkCeiling(estimatedUsd)` then, only after a multi-minute Veo round trip, `recordSpend(...)`. Because a Veo call can take minutes and neither call synchronizes with the other, both `checkCeiling` reads can observe the ledger before either has recorded its spend, so both can pass even when their combined cost would exceed `DEV_CEILING_USD`/`MONTHLY_BUDGET_USD`. This is precisely the "no bypass via retry" scenario the project's own hard budget constraint calls out as never acceptable.
**Fix:** Serialize all paid dispatches (batch scenes and manual retries alike) through a single in-process mutex/queue keyed at the app level (not just within one `runBatchVideoDispatch` call), or re-check the ceiling immediately before `recordSpend` (not just before dispatch) and roll back/refuse if the post-dispatch total would exceed it. At minimum, disable the "Try again" affordance for every other scene while a batch (or another retry) is in flight, mirroring the "only one regeneration at a time" guard `regeneratingScene` already provides for images.

## Warnings

### WR-04: Retry/regenerate re-entrancy guards can be defeated by a fast double click

**File:** `src/components/scenes/SceneVideo.tsx:83-99` (no `disabled` prop on the failed/stuck "Try again" button), `src/app/page.tsx:449-463`
**Issue:** `handleRetryScene`'s only re-entrancy guard is `if (!storyId || retryingScene !== null) return;`, read from React state captured in the button's render-time closure. Unlike the "waiting" state's "Generate video" button (`disabled={disabled}`) or the "Generate All Videos" button (`disabled={starting}`), the "Try again" button in both the `failed` and `generating`+`stuck` branches of `SceneVideo` never receives a `disabled` attribute at all. Two rapid clicks (or two very close successive taps) before React re-renders can both read the stale `retryingScene === null` closure and both dispatch `generateSceneVideoAction` for the same scene, consuming two retry attempts and billing twice for what was meant to be a single retry.
**Fix:** Pass `disabled={retryingScene !== null}` through to `SceneVideo`'s retry button (as is already done for the waiting-state button), and/or move the guard into a `useRef` checked synchronously at the very start of the handler instead of relying solely on state.

### WR-05: `getStoryStatusAction` trusts the raw DB video status without checking the file still exists

**File:** `src/app/actions/get-story-status.ts:53-63`, `src/app/page.tsx:530-573`
**Issue:** `loadStoryAction` explicitly downgrades a scene's status to `FAILED` when its recorded path is missing on disk ("the database and the filesystem can legitimately disagree"). `getStoryStatusAction` -- polled every `POLL_INTERVAL_MS` while the wife is on the video-status screen -- has no equivalent check; it reports whatever `videoStatus` is persisted, verbatim. If a video file is deleted or moved out from under the app after being marked `READY` (the exact scenario `load-story.ts`'s own comment anticipates), the poll will report that scene as `"ready"`, which can flip `nothingLeftToRetry`/`allVideosReady` to true, show "Every scene is ready. Your episode's clips are saved and numbered for CapCut.", and trigger the auto-export -- even though `exportEpisodeAssets` will silently list that scene under `clipsMissing` because its source file does not exist. She has no way to learn from the UI that one clip did not make it into the output folder.
**Fix:** Have `getStoryStatusAction` (or `findStoryWithScenes`'s caller) check file existence for any scene reporting `videoStatus === "READY"`, the same way `loadStoryAction` already does, and downgrade the reported status when the file is missing.

### WR-06: Image-regeneration attempt counter is still consumed on a purely local, pre-dispatch failure

**File:** `src/app/actions/regenerate-scene-image.ts:89-104`
**Issue:** WR-02 deliberately moved `incrementVideoAttempt` to sit immediately before the paid Veo dispatch in `generate-video.ts`, specifically so a local failure that never reaches the provider (a ceiling refusal, an unreadable image file) does not cost the wife one of her limited retry attempts. `regenerateSceneImageAction` was not given the same treatment: `incrementImageAttempt` (line 91) runs unconditionally before calling into `generateSceneImagesAction`, ahead of whatever local pre-dispatch checks that function performs internally. Any local failure inside that call (e.g. a local read/validation error that never reaches Gemini's Image API) still burns one of the scene's limited image-regeneration attempts, the exact class of bug WR-02 was written to eliminate -- just not eliminated on this sibling path.
**Fix:** Move the increment inside (or immediately ahead of) the actual per-scene dispatch boundary inside the image generation path, matching `generate-video.ts`'s now-corrected placement, so only a call that reaches the real provider boundary consumes an attempt.

### WR-07: Silent, unlogged catch branch in the ceiling check

**File:** `src/app/actions/generate-video.ts:162-174`
**Issue:** Every other failure branch in this file calls `console.error` before returning (image-read failure, `generateVideo` throwing, missing generated file). The `checkCeiling` catch block is the one exception: for any error that is not a `CeilingExceededError`, it returns a generic `"...due to an unexpected error."` message with no server-side log line at all. A corrupted ledger file or any other unexpected failure in the pre-flight budget check would be completely invisible in the server console.
**Fix:**
```ts
} catch (err) {
  const message =
    err instanceof CeilingExceededError
      ? "The generation budget was reached, so this scene's video could not be created."
      : "This scene's video could not be created due to an unexpected error.";
  if (!(err instanceof CeilingExceededError)) {
    console.error(`generateSceneVideoAction: checkCeiling failed unexpectedly for story ${storyId} scene ${sceneNumber}`, err);
  }
  await updateSceneVideo(storyId, sceneNumber, null, SceneAssetStatus.FAILED);
  return { ok: false, videoPath: null, videoDataUrl: null, message, durationSeconds };
}
```

## Info

### IN-01: Duplicate, divergent MIME-type inference helpers

**File:** `src/app/actions/generate-video.ts:56-69` (`mimeTypeForImagePath`), `src/app/actions/load-story.ts:39-52` (`imageMimeTypeForPath`)
**Issue:** Two near-identical helpers infer an image's MIME type from its extension, but behave differently for an unrecognized extension: one throws (caught and surfaced as a failure), the other silently defaults to `"image/jpeg"`. Neither is the single source of truth the rest of this codebase otherwise insists on (e.g. `storage-paths.ts`'s single `EXTENSION_PATTERN`).
**Fix:** Extract one shared helper (e.g. alongside `storage-paths.ts`) and have both call sites use it, deciding once whether an unrecognized extension should throw or degrade gracefully.

### IN-02: `buildStoryJson`'s clip file name is a re-derived literal, not sourced from `storage-paths.ts`

**File:** `src/core/output/episode-export.ts:70`
**Issue:** `buildStoryJson` reconstructs the clip's file name inline as `` `${String(scene.sceneNumber).padStart(2, "0")}_scene.mp4` `` instead of deriving it from `outputClipPath` (or a shared basename helper). OUTPUT-03's entire correctness guarantee rests on this exact naming convention; a future change to `outputClipPath` in `storage-paths.ts` would silently desynchronize from this duplicated literal with no compiler or test signal pointing at the mismatch (the existing test suite asserts each independently, not that they agree).
**Fix:** Derive the `clip_file` value from a shared basename helper (or from `outputClipPath` with the directory prefix stripped) so there is exactly one place that knows the clip naming convention.

---

_Reviewed: 2026-09-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
