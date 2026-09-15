---
phase: 04-wife-facing-review-approval-flow
reviewed: 2026-09-15T00:00:00Z
depth: standard
files_reviewed: 39
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
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-09-15T00:00:00Z
**Depth:** standard
**Files Reviewed:** 39
**Status:** issues_found

## Summary

This phase implements the wife-facing approval gate (D-01/D-02/APPROVAL-01), the per-scene retry-cap
guard (D-03), the batch "Generate All Videos" dispatch with a polling status screen (D-04/D-05), the
Library screen (LIBRARY-01), and the episode export/output-folder flow (OUTPUT-01/OUTPUT-03). The gating
logic itself (`src/core/approval/gates.ts`) is well-isolated, pure, and thoroughly unit-tested — the
branch ordering that keeps approval checked before scene existence is correct and matches its tests. The
persistence layer's best-effort-by-contract writes and the episode export's stale-clip hygiene are both
implemented and tested correctly.

The most significant defect found is in the client-side polling effect in `src/app/page.tsx`: once every
scene reaches a terminal video state, the polling interval is permanently cleared, but the UI still offers
a per-scene "Try again" retry action after that point (VIDEO-04). Retrying a scene after the batch has
fully settled leaves the UI stuck showing "Generating video..." forever, with no mechanism left to observe
the real outcome short of a full page reload — a direct contradiction of D-05's purpose (a status screen
that reflects the database's real state). This is classified as Critical because it silently breaks a
documented, user-facing recovery path for the target non-technical user.

Three further Warnings and two Info items are documented below. `.env.local.example` could not be read by
this reviewer (blocked by local tool permission settings) and so was not inspected for accidentally
committed secrets or unsafe defaults — flagged as IN-02 for manual follow-up.

## Critical Issues

### CR-01: Video-status polling stops forever once the batch settles, breaking single-scene retry (VIDEO-04)

**File:** `src/app/page.tsx:557-587` (polling effect), interacting with `src/app/page.tsx:449-463` (`handleRetryScene`)

**Issue:** The Screen 4 polling effect computes `allTerminal` once every scene's `videoStatus` is `READY`
or `FAILED`, and permanently clears its own `setInterval` at that point:

```ts
const allTerminal =
  status.scenes.length > 0 &&
  status.scenes.every((row) => row.videoStatus === "READY" || row.videoStatus === "FAILED");
if (allTerminal) {
  clearInterval(intervalId);
  // ...finalizeEpisodeAction fires here...
}
```

The `useEffect` that owns this interval only re-runs when `screen` or `storyId` changes (`}, [screen,
storyId]);`), and nothing else in the component restarts it. However, `VideoStatusScreen`/`SceneVideo`
still render a "Try again" button for any scene whose `videoStatus` is `FAILED` and under its retry cap —
exactly the VIDEO-04 single-scene retry path, which is supported *after* the batch has otherwise finished
(e.g., 2 of 3 scenes succeeded, 1 failed transiently, batch is "done", she retries the one failure).

When she clicks "Try again" at that point, `handleRetryScene` optimistically sets that scene's state to
`"generating"` and calls `retrySceneVideoAction`, but there is no longer any active poll to ever read the
real outcome back from the database. The scene is stuck showing "Generating video... this can take a few
minutes." indefinitely. Because `allReady` requires every scene to be `"ready"`, `batchDispatched` is
already `true` (so "Generate All Videos" never reappears), and `stuck`/retry-button visibility both depend
on the same dead polling loop to ever flip, there is no in-app way to recover — only a full page
reload (which re-mounts the restore effect and re-triggers the polling effect) fixes it, and that is not an
obvious action for the target non-technical user.

**Fix:** Don't stop polling purely because scenes are currently terminal; only stop once there is truly
nothing left she could ever retry (every scene `READY`, or `FAILED` **and** at its retry cap), and/or
restart the poll immediately from `handleRetryScene` itself so a retry is never orphaned:

```ts
// In the poll() effect: only stop when nothing is retriable anymore.
const nothingLeftToRetry = status.scenes.every(
  (row) => row.videoStatus === "READY" || (row.videoStatus === "FAILED" && row.capReached),
);
if (nothingLeftToRetry) {
  clearInterval(intervalId);
  // ...finalize as before...
}
```

```ts
// In handleRetryScene: force an immediate re-poll after dispatching the retry,
// e.g. by lifting `poll` out of the effect (via a ref) and invoking it here,
// or by toggling a piece of state the polling effect depends on.
```

## Warnings

### WR-01: `capMessage` is set for any refusal once the story exists, not only for a reached retry cap

**File:** `src/app/actions/regenerate-scene-image.ts:72-87`

**Issue:** The function's own doc comment states `capMessage` is "Non-null only when this refusal is
specifically a reached retry cap". The implementation instead keys this purely on whether `story` is
non-null:

```ts
const decision = evaluateImageRegeneration(story, sceneNumber, maxSceneRetryAttempts());
if (!decision.allowed) {
  return {
    ok: false,
    sceneNumber,
    imageDataUrl: null,
    message: decision.message,
    capMessage: story !== null ? decision.message : null,
    approvalNotice: null,
  };
}
```

`evaluateImageRegeneration` (`src/core/approval/gates.ts:107-131`) refuses with `story !== null` in *two*
distinct cases: "That scene could not be found in this story." (scene lookup miss) and the cap-reached
message. Both would set `capMessage` here, not just the cap case. The browser (`src/app/page.tsx:395-398`)
renders any non-null `capMessage` as the calm amber "cap reached" note rather than a generic error, so a
scene-not-found refusal — however unlikely to be reachable from the current UI, since the client always
passes a real `scene.scene_number` sourced from the loaded story — would be mislabeled if ever hit (e.g.
after a data/DB drift between client and server state).

**Fix:** Discriminate on the decision's refusal *reason*, not on story existence, e.g. by having
`evaluateImageRegeneration`'s refusal carry a `reason: "not-found" | "cap"` tag, or by comparing
`decision.message` against the known cap-message template before setting `capMessage`.

### WR-02: A scene's retry-attempt counter is consumed even when no paid Veo call was ever dispatched

**File:** `src/app/actions/generate-video.ts:176-208`

**Issue:** The doc comment states the attempt increment is placed "at the money-consuming boundary on
purpose" so that only a scene that "reached dispatch" consumes one of its limited attempts. In the actual
ordering, `incrementVideoAttempt` runs *before* the scene's source image is even read from disk:

```ts
await incrementVideoAttempt(storyId, sceneNumber);          // line 181 -- attempt consumed here
await updateSceneVideo(storyId, sceneNumber, null, SceneAssetStatus.GENERATING); // line 189

let imageBytes: Buffer;
let mimeType: string;
try {
  imageBytes = readFileSync(imagePath);                     // line 194 -- can still fail, purely locally
  mimeType = mimeTypeForImagePath(imagePath);
} catch (err) {
  // ...marks FAILED, but the attempt above was already spent...
```

A transient local failure (file locked by antivirus, a moved/renamed scenes folder, a disk hiccup) that
prevents the image from ever being read consumes one of only `MAX_SCENE_RETRY_ATTEMPTS` (default 3)
attempts without a single paid Veo call ever being dispatched. Three such local failures in a row would
permanently exhaust that scene's retry cap (D-03) with zero dollars spent and zero real generation
attempts made — the opposite of the guard's stated intent.

**Fix:** Move `incrementVideoAttempt` to after the image bytes are successfully read (immediately before
`generateVideo(...)` is called), so only failures that could plausibly correspond to a real dispatch
consume an attempt.

### WR-03: Unbounded overlapping poll() calls in the video-status effect can apply a stale status after a fresher one

**File:** `src/app/page.tsx:485-587`

**Issue:** `poll()` is invoked immediately and then again every `POLL_INTERVAL_MS` (3000ms) via
`setInterval(poll, POLL_INTERVAL_MS)`, with no guard preventing a new invocation from starting while a
previous one is still in flight:

```ts
const intervalId = setInterval(poll, POLL_INTERVAL_MS);
poll();
```

`poll()` conditionally calls `loadStoryAction` (which reads and base64-encodes every ready scene's image
and video bytes) whenever any newly-`READY` scene lacks cached media. If that call takes longer than
3000ms — plausible for multiple sizeable video files on a slower disk — a second `poll()` cycle can start
and finish (updating `videoScenes` from its own, newer `status` snapshot) before the first, slower cycle's
`setVideoScenes` call finally runs with its now-stale `status` snapshot, momentarily regressing displayed
state (e.g. a scene flips from "ready" back to "generating" for one tick) until the next poll corrects it.
The `videoSrc` field itself is defended against this (it prefers `existingSrc` over a freshly-fetched one),
but `videoState`/`videoMessage` are not.

**Fix:** Guard against overlapping polls, e.g. with an `isPollingRef` flag checked at the top of `poll()`
that skips the tick if a previous call hasn't resolved yet:

```ts
const inFlightRef = useRef(false);
async function poll() {
  if (inFlightRef.current) return;
  inFlightRef.current = true;
  try {
    // ...existing body...
  } finally {
    inFlightRef.current = false;
  }
}
```

## Info

### IN-01: `openStoryFolderAction` reports success even when no folder was opened (non-Windows)

**File:** `src/app/actions/open-story-folder.ts:97-109`

**Issue:** On any non-`win32` platform, the function only logs to the server console and never spawns
`explorer.exe`, yet still returns `{ ok: true, message: "Opening the folder...", clipCount: ... }` —
identical to the real success case. Given the project's stated platform constraint (single Windows
laptop, single user), production impact is nil, but this would silently mislead anyone running the dev
server on macOS/Linux (e.g. during future maintenance) into believing the folder-open succeeded.

**Fix:** Return a distinct `ok: true` (or a dedicated `unsupported: true` flag) with a message that does
not claim a folder was opened when `process.platform !== "win32"`.

### IN-02: `.env.local.example` could not be reviewed

**File:** `.env.local.example`

**Issue:** This file is listed in the required reading set but this reviewer's file-access tooling denied
reading it ("File is in a directory that is denied by your permission settings"). Its contents (env var
names, any example values) were therefore not checked for accidentally-real secrets, unsafe defaults, or
drift from the variables actually consumed by this phase's code (`MAX_SCENE_RETRY_ATTEMPTS`,
`MONTHLY_BUDGET_USD`, etc.).

**Fix:** No code fix — recommend a manual check (or a re-run with adjusted tool permissions) to confirm
this file contains only placeholder values and documents every environment variable this phase's code
reads.

---

_Reviewed: 2026-09-15T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
