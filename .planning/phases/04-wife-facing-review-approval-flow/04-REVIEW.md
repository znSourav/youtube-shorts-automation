---
phase: 04-wife-facing-review-approval-flow
reviewed: 2026-09-15T00:00:00Z
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
  critical: 2
  warning: 2
  info: 1
  total: 5
status: issues_found
---

# Phase 4: Code Review Report (third pass)

**Reviewed:** 2026-09-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 38
**Status:** issues_found

## Summary

This is a genuinely fresh, full pass, not a re-confirmation of the prior two passes' fixes. The previously-fixed items (CR-01/WR-01/WR-02/WR-03 from pass 1; CR-01/CR-02/CR-03/WR-04/WR-05/WR-06/WR-07 from pass 2) were spot-checked in context while reading the surrounding code and all still look correct — in particular the CR-03 mutex (`videoDispatchChain` in `src/app/actions/generate-video.ts`) does serialize every call into `dispatchSceneVideo` app-wide, it recovers cleanly from a rejected link in the chain (both the success and failure continuations run the next dispatch, and the chain-advancing `.then` swallows both outcomes so a rejection can never poison future calls), and `batch.ts`'s own sequential `for` loop already awaits each call before starting the next, so the mutex adds no new deadlock risk there — worst case it adds queueing delay when a single-scene retry is dispatched while a batch is mid-flight, which is the intended trade-off, not a defect.

However, this pass found two new Critical-severity defects that neither prior pass caught, both centered on the same root cause: **nothing in the video-dispatch path checks a scene's *current* `videoStatus` before dispatching it again.** `evaluateVideoDispatch` (the single gate every video call goes through) checks approval, the retry-cap, and image readiness — never whether the scene is already `READY` or already `GENERATING`. That gap is normally invisible because the UI only offers a dispatch path (a button) for scenes that need one — except for the "Generate All Videos" batch action, which the app deliberately allows the wife to re-trigger after any page reload/story reopen (`batchDispatched` is unconditionally reset to `false` in `applyLoadedStory`), specifically to recover a batch an earlier session's crash left stranded. `evaluateBatchDispatch`'s own eligibility filter only excludes scenes that are already `READY`, not ones that are currently `GENERATING` — so re-opening a story (Library, or a page refresh) while a previous batch is still genuinely alive and mid-flight, and clicking "Generate All Videos" again, dispatches a second real, billed Veo call for every scene still in progress, burning one of that scene's limited retry attempts and overwriting its in-progress/just-finished video for no benefit. This directly undermines the project's hard, no-exceptions $15 budget constraint (CLAUDE.md) and contradicts the code's own documented claim that the batch is idempotent.

The second Critical issue is a UI-only but user-facing correctness bug: because `videoAttempts` is now incremented *before* the paid Veo call is dispatched (an intentional fix from pass 2, WR-02), a scene's *final* allowed attempt reaches the retry cap the instant it starts generating, not when it finishes. `page.tsx`'s poll loop treats "cap reached" as taking priority over every state except `"ready"` — including `"generating"` — so for several minutes (up to the ~10-minute Veo timeout), the wife is shown a dead-end amber message ("...has reached its limit... you can continue with what's ready, or start a new story") for a scene that is still actively being generated and may well succeed a moment later. The scene self-corrects to "ready" if it succeeds, so no data is corrupted, but the message is actively false while it is shown, on the one screen (D-05) whose entire purpose is trustworthy status reporting to a non-technical user.

Two further Warning-level issues were found: a leftover, unconditionally-rendered "Video generation for this scene isn't available yet." placeholder on every scene tile of the Review Images screen (dead code from Phase 2 that Phase 4's separate `VideoStatusScreen` was supposed to make obsolete but never removed from `SceneCard`), and a budget-ceiling refusal that renders identically to a transient failure with an infinite, cost-free but pointless "Try again" loop.

`.env.local.example` could not be read (denied by the sandbox's directory permission settings on both the `Read` tool and `Bash cat`), so this review could not verify its contents (e.g. absence of a real secret checked in as a placeholder value). This is a coverage gap, not a finding against the file itself — worth a manual look outside this tool.

## Critical Issues

### CR-01: Video dispatch has no guard against a scene that is already READY or already GENERATING — re-opening a story mid-batch and clicking "Generate All Videos" again pays for and overwrites an in-flight or just-finished video

**File:** `src/core/approval/gates.ts:47-82` (`evaluateVideoDispatch`), `src/core/approval/gates.ts:159-190` (`evaluateBatchDispatch`), `src/app/actions/generate-video.ts:127-332` (`dispatchSceneVideo`), `src/app/page.tsx:160-200` (`applyLoadedStory`)

**Issue:**

`evaluateVideoDispatch` — the single gate every call into `dispatchSceneVideo` passes through, for both the batch and single-scene-retry paths — checks four things in order: story exists, images approved, scene exists, `videoAttempts < cap`, image is READY. It never checks `scene.videoStatus`. So it will happily grant a dispatch for a scene that is already `READY` (video already generated and paid for) or already `GENERATING` (a different call for the same scene is presently in flight), as long as that scene's attempt count is still under the cap.

`evaluateBatchDispatch`'s own eligibility filter (the "fast refusal for the wife's benefit only" — line 179) is:
```ts
s.imageStatus === "READY" &&
s.imagePath !== null &&
s.videoStatus !== "READY" &&
s.videoAttempts < maxVideoAttempts,
```
This excludes `READY` scenes but explicitly does **not** exclude `GENERATING` ones.

`page.tsx`'s `applyLoadedStory` resets `batchDispatched` to `false` on every restore (mount-time page load/refresh, and every "open this story from the Library" action), with this reasoning in the comment at line 173:

> "D-04's batch dispatch is idempotent (it skips already-READY/at-cap scenes), so re-showing 'Generate All Videos' is always safe"

That claim is only half true — it skips `READY` and at-cap scenes, but not `GENERATING` ones, which is exactly the state a scene is in for the entire multi-minute duration of its Veo call.

Concrete reproduction, using only normal UI actions the app explicitly supports (VIDEO-03's "browser-resume" feature exists specifically to let her navigate away and come back mid-generation):

1. Wife clicks "Generate All Videos". `generateAllVideosAction` schedules `runBatchVideoDispatch` via `after()` and returns immediately; `batchDispatched` becomes `true` in the browser, hiding the button.
2. A few seconds later, scene 3 is marked `GENERATING` server-side (this takes minutes per scene — plenty of time for the next steps).
3. Wife navigates to "My Stories" (Library) and re-opens the same story. `handleOpenLibraryStory` → `applyLoadedStory` runs, which unconditionally sets `batchDispatched: false` again, and seeds `videoScenes` showing scene 3 as `"generating"` (correctly, from `loadStoryAction`'s fresh read). The "Generate All Videos" button reappears (`!dispatched && !allReady`).
4. Wife (not realizing this is redundant, since nothing in the button's own copy or disabled-state distinguishes "nothing has started" from "some scenes are still working") clicks "Generate All Videos" again.
5. `evaluateBatchDispatch` re-evaluates: scene 3 is `videoStatus: "GENERATING"`, which is `!== "READY"`, so it is included in the new batch's `sceneNumbers`.
6. The new batch's dispatch for scene 3 is queued behind the CR-03 mutex. Once the FIRST in-flight dispatch for scene 3 completes (success or failure), the SECOND dispatch's turn arrives. `evaluateVideoDispatch` re-checks attempts/approval/image-readiness only — not `videoStatus` — so if scene 3's attempts are still under the cap, it is granted again: a brand-new, real, billed Veo call is dispatched for a scene that may have *just finished successfully*, overwriting the freshly-written `video.mp4` at the same `sceneVideoPath(storyId, sceneNumber)` and consuming one more of that scene's limited retry attempts for zero benefit.

This is a genuine, non-hypothetical budget/data-integrity defect: it burns real money against the project's explicit, non-negotiable $15 hard cap (CLAUDE.md: "no exceptions, no bypass via retry") without gating it, and it can silently exhaust a scene's retry cap on redundant work, leaving her with fewer real retries available for an actual failure later.

**Fix:** Add a `videoStatus`-aware guard. The minimal, most defensible fix is inside `evaluateVideoDispatch` itself (since every caller — batch and single-scene retry — already goes through it), refusing a scene whose `videoStatus` is already `"READY"` or `"GENERATING"`:
```ts
// in evaluateVideoDispatch, after the imageStatus check, before granting:
if (scene.videoStatus === "READY") {
  return { allowed: false, message: "This scene's video has already been generated." };
}
if (scene.videoStatus === "GENERATING") {
  return { allowed: false, message: "This scene's video is already being generated." };
}
```
`retrySceneVideoAction`'s only caller path is a `"failed"`/`"generating"+stuck` button, so this does not remove any legitimate retry path — it only closes the gap `evaluateBatchDispatch`'s filter already tries (and fails) to close. Also update `evaluateBatchDispatch`'s own filter to exclude `"GENERATING"` scenes from the candidate list, so a re-run batch doesn't even attempt to re-queue them:
```ts
s.videoStatus !== "READY" && s.videoStatus !== "GENERATING" &&
```
And correct the now-inaccurate idempotency comment in `page.tsx`'s `applyLoadedStory`.

---

### CR-02: VideoStatusScreen shows a false "reached its limit" dead-end message for a scene that is still actively generating, not just for one that has failed

**File:** `src/app/page.tsx:556-568`, `src/components/scenes/SceneVideo.tsx:66-68`

**Issue:** Because `incrementVideoAttempt` runs immediately before the paid `generateVideo()` call (pass 2's WR-02 fix, `src/app/actions/generate-video.ts:225-231`), a scene's *last* allowed attempt reaches `videoAttempts >= maxAttempts` the instant that attempt begins, not when it resolves. `getStoryStatusAction` reports `capReached: true` for that scene while its `videoStatus` is still `"GENERATING"` (`src/app/actions/get-story-status.ts:82`).

In `page.tsx`'s poll loop:
```ts
let videoMessage: string | null =
  videoState === "failed" ? "This scene's video could not be created." : null;

// D-03: the cap is checked LAST so it takes priority over "failed"
// -- an exhausted scene shows the calm amber explanation, never
// the red failure message, even though its underlying videoStatus
// is also FAILED.
if (row.capReached && videoState !== "ready") {
  videoState = "capped";
  videoMessage = `This scene's video has reached its limit of ${status.maxAttempts} attempts. ...`;
}
```
The comment's stated intent is explicitly to take priority over `"failed"` only. The actual condition (`videoState !== "ready"`) also matches `"generating"`, so for the entire duration of the scene's last Veo call (which can legitimately take several minutes, up to just under the 10-minute `POLL_TIMEOUT_MS` in `veo.ts`), the wife is shown the amber "reached its limit... you can continue with what's ready, or start a new story to try again" message — with `SceneVideo`'s `"capped"` branch (`SceneVideo.tsx:66-68`) rendering *only* that text and no retry affordance, no "still working" indication, nothing. If the call ultimately succeeds, the next poll tick corrects it to `"ready"` (the `ready` branch is checked first and skips the override), so the state is self-healing — but for however long the call is in flight, the primary and only wife-facing status screen (D-05's whole reason for existing) tells her something false: that the scene has permanently failed and nothing more can be done, while a paid, potentially-successful generation is quietly still running behind that message.

This is most severe with `MAX_SCENE_RETRY_ATTEMPTS=1` (a supported configuration per `caps.ts`), where it fires on every scene's very first and only attempt — i.e., the "capped" dead-end message would be shown for the *entire* generation time of every single scene in that configuration, never showing "Generating video..." at all.

**Fix:** Only treat a scene as "capped" once it has actually stopped trying — i.e., require the *status*, not just the attempt count, to reflect exhaustion:
```ts
if (row.capReached && videoState === "failed") {
  videoState = "capped";
  videoMessage = `...`;
}
```
(This matches the comment's own stated intent — "takes priority over failed" — exactly, and leaves `"generating"` alone so the wife continues to see accurate "still working" copy until the call actually resolves one way or the other.)

## Warnings

### WR-01: SceneCard renders a stale, irrelevant "Video generation for this scene isn't available yet." message under every scene on the Review Images screen

**File:** `src/components/scenes/SceneCard.tsx:44-61, 106-114`; call site `src/app/page.tsx:704-717`

**Issue:** `SceneCard` still carries the full video-slot API from Phase 2 (`videoState`, `videoSrc`, `onGenerateVideo`, `onRetryVideo`, `videoWaitingHint`, etc.) and unconditionally renders a `<SceneVideo>` at the bottom of every card. Phase 4 replaced that slot's actual job with a dedicated `VideoStatusScreen` (Screen 4) — `VideoStatusScreen.tsx`'s own doc comment even explains it deliberately does *not* reuse `SceneCard` for this reason ("there is no image slot on this screen"). But the one remaining call site, `page.tsx:704-717` (the Review Images screen), never passes any of `SceneCard`'s video props. With `videoState` defaulting to `"waiting"` and no `onGenerateVideo`/`videoWaitingHint` supplied, `SceneVideo`'s `"waiting"` branch falls through to:
```tsx
return (
  <p className="text-xs text-zinc-400 dark:text-zinc-500">
    {waitingHint ?? "Video generation for this scene isn't available yet."}
  </p>
);
```
So every scene tile on the Review Images screen — a screen entirely about approving *images*, before video generation is even unlocked — shows this leftover, out-of-context sentence about video. It is dead functionality that was never cleaned up when Phase 4 moved video status to its own screen, and it is confusing noise on a screen a non-technical user is meant to read carefully before approving.

**Fix:** Remove the video-slot props and the `<SceneVideo>` render entirely from `SceneCard` (nothing in the current codebase supplies or needs them), or, if `SceneCard` is meant to stay a shared/future-proof component, at minimum stop rendering `<SceneVideo>` unconditionally — only render it when a caller actually opts in (e.g. `{videoState && <SceneVideo ... />}`).

### WR-02: A budget-ceiling refusal is indistinguishable from a transient failure and offers an infinite, pointless "Try again" loop

**File:** `src/app/actions/generate-video.ts:170-192`; `src/app/page.tsx:556-557`; `src/components/scenes/SceneVideo.tsx:90-108`

**Issue:** When `checkCeiling` throws `CeilingExceededError`, `dispatchSceneVideo` marks the scene `FAILED` but deliberately does **not** increment `videoAttempts` (correct per the WR-02/pass-2 rationale: no paid call was dispatched, so no attempt should be consumed). The polled status screen, however, renders every non-capped `FAILED` scene identically — a generic `"This scene's video could not be created."` message with a `"Try again"` button (`page.tsx:556-557`, `SceneVideo.tsx:90-108`) — with no distinction for "the monthly budget is exhausted, retrying will not help." Because the attempt was never consumed, this scene also never reaches `capReached`, so the wife can click "Try again" indefinitely; each click will fail the same way (harmlessly, since `checkCeiling` re-blocks every time) but nothing ever tells her retrying is futile until the ceiling resets.

**Fix:** Thread the specific refusal reason through to the poll response (e.g. add a `budgetExceeded: boolean` field to `SceneVideoStatusRow`, set from a new best-effort marker `dispatchSceneVideo` could persist, or — simpler — have `getStoryStatusAction` cross-check the current ledger headroom) and render a distinct, calmer message ("The generation budget has been reached for this project.") with the retry button removed, mirroring the `"capped"` treatment already used for the per-scene attempt cap.

## Info

### IN-01: `getStoryStatusAction` logs a fresh `console.error` on every 3-second poll tick for a scene whose recorded video is missing on disk

**File:** `src/app/actions/get-story-status.ts:69-74`

**Issue:** The `existsSync` downgrade-to-FAILED check is a sensible defensive read, but it re-logs `` `getStoryStatusAction: scene ${scene.sceneNumber}'s video file is missing on disk` `` on every poll cycle (every `POLL_INTERVAL_MS` = 3000ms) for as long as the Video Status screen stays open and that scene's DB row still says `READY` with a missing file — which, since nothing in this action ever corrects the DB row itself, is indefinitely. Over a session left open, this can produce a large volume of repeated, identical log lines for one already-understood condition.

**Fix:** De-duplicate (log once per scene per session, e.g. via an in-memory `Set` keyed by `${storyId}:${sceneNumber}`), or drop to a single log at the point the DB row itself gets corrected, rather than on every poll read.

---

_Reviewed: 2026-09-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
