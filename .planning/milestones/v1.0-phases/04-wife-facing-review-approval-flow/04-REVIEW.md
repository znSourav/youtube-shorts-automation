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
  warning: 1
  info: 0
  total: 2
status: issues_found
---

# Phase 04: Code Review Report (Sixth and Final Pass)

**Reviewed:** 2026-09-16T00:00:00Z
**Depth:** standard
**Files Reviewed:** 38
**Status:** issues_found

## Summary

This is a genuinely fresh read of every file in scope, not a re-confirmation of prior passes. The approval gate (`gates.ts`), the batch dispatch orchestrator (`batch.ts`), the per-scene retry cap (`caps.ts`), the storage-path validator (`storage-paths.ts`), the episode export writer (`episode-export.ts`), and the persistence layer (`story-repository.ts` / `generation-repository.ts` / `story-view.ts`) all held up under adversarial tracing of every branch, including the concurrency-sensitive paths (the `videoDispatchChain` mutex, the `storiesWithRunningBatch` story-scoped guard, and the fifth-pass `recordSpend` try/catch) that prior passes hardened. Their test suites exercise the documented edge cases faithfully and I could not find a case they miss.

One genuine, previously-unflagged defect surfaced on this pass in `generate-video.ts`: a successfully generated (and already paid-for) video's on-disk path is discarded from the database the moment the immediate post-generation read-back for playback fails, even though the function's own return value still knows and reports that same path. This both strands an already-billed asset outside the export pipeline and, if she retries, burns a genuine paid Veo dispatch and one of her three limited attempts to regenerate something that already existed. This is classified as a BLOCKER.

One further, narrower robustness gap was found in `page.tsx`'s client-side "stuck generation" detector: its clock is purely an in-memory ref with no server-side anchor, so a browser refresh silently resets the stuck-detection countdown even for a scene that has already been stuck for a long time, undermining the exact recovery affordance it exists to provide. This is classified as a WARNING (delay, not data loss or overspend).

The two items the review brief flagged as already-known and out of scope for this pass — `.env.local.example` being unreadable by this tooling, and the identical unprotected-`recordSpend` pattern in `generate-images.ts`/`director.ts` (deferred to Phase 6) — are not re-reported here.

## Critical Issues

### CR-01: A successfully generated, already-billed video's real file path is discarded when the post-generation playback read fails, stranding the asset and inviting a wasted re-dispatch

**File:** `src/app/actions/generate-video.ts:321-337`

**Issue:** By the time this branch runs, `result.blocked || !result.filePath` has already been checked and found false (line 314), so `result.filePath` is a real, valid on-disk path to a video that Veo has already generated and that has already been billed (`recordSpend` ran successfully just above, and `generationRecordBase.billed` is `true`). The only thing that fails in this branch is the immediate `readFileSync(result.filePath)` used to build the inline `data:` URL for this one HTTP response:

```ts
let videoDataUrl: string | null = null;
try {
  const videoBytes = readFileSync(result.filePath);
  videoDataUrl = `data:video/mp4;base64,${videoBytes.toString("base64")}`;
} catch (err) {
  console.error(`generateSceneVideoAction: failed to read generated video at ${result.filePath}`, err);
  const message = "The video was generated but could not be loaded for playback. Please try again.";
  await updateSceneVideo(storyId, sceneNumber, null, SceneAssetStatus.FAILED);
  await recordGeneration(storyId, { ...generationRecordBase, ok: false, message }, sceneNumber);
  return {
    ok: false,
    videoPath: result.filePath,
    videoDataUrl: null,
    message,
    durationSeconds,
  };
}
```

`updateSceneVideo(storyId, sceneNumber, null, SceneAssetStatus.FAILED)` writes `videoPath: null` and `videoStatus: FAILED` to the database — even though the function's own return value one line later still correctly reports `videoPath: result.filePath`. This is an internal inconsistency, not a deliberate design choice: compare the success path four lines down (`updateSceneVideo(storyId, sceneNumber, result.filePath, SceneAssetStatus.READY)`, line 339), which is exactly what this branch should also do with the path (only the status/message differ, since this response specifically couldn't show it back to her this one time).

Consequences, given the rest of this codebase's own architecture:
- `evaluateVideoDispatch` (gates.ts) treats `videoStatus !== "READY"` as eligible for a fresh dispatch, so "Try again" on this scene fires an entirely new, real, paid Veo call — even though the original clip was already generated and billed. This directly works against the project's hard $15 budget constraint (CLAUDE.md: "target actual spend $8-10... no exceptions") by spending again for no benefit.
- The retry also consumes one of the scene's three limited `videoAttempts` (D-03's click-loop guard) for a failure that has nothing to do with the video generation itself — a transient local I/O hiccup right after success can push a scene toward the exhausted-cap dead end.
- Because `videoPath` is now `null` and `videoStatus` is `FAILED`, `exportEpisodeAssets` (episode-export.ts) will never pick up this scene's clip (it requires `videoStatus === "READY" && videoPath !== null`), and neither `getStoryStatusAction` nor `loadStoryAction` will ever attempt to re-read the file (both gate their own `readFileSync` on `videoStatus === "READY"`). The already-rendered, already-paid file at `result.filePath` becomes permanently orphaned and invisible to every part of the pipeline she can reach — she has no way to discover or recover it, since no filesystem path is ever surfaced to her (T-03-15).

**Fix:** Preserve the known-good path and mark the scene `READY` (the generation itself did succeed); only the immediate inline preview failed, which a later poll/reload can retry independently:

```ts
} catch (err) {
  console.error(`generateSceneVideoAction: failed to read generated video at ${result.filePath}`, err);
  const message = "The video was generated but could not be loaded for playback. Please try again.";
  // The Veo call succeeded and the file exists at result.filePath -- only
  // this response's own inline read-back failed. Recording it as READY
  // with its real path (not null/FAILED) keeps it reachable by a later
  // poll/reload and by episode export, instead of orphaning an
  // already-billed asset and inviting a wasted re-dispatch.
  await updateSceneVideo(storyId, sceneNumber, result.filePath, SceneAssetStatus.READY);
  await recordGeneration(storyId, { ...generationRecordBase, ok: true, message: "Video generated." }, sceneNumber);
  return {
    ok: false,
    videoPath: result.filePath,
    videoDataUrl: null,
    message,
    durationSeconds,
  };
}
```

(If leaving the outward `ok`/message as a failure for this one response is still desired so the browser can show "please reload", that's compatible with persisting `READY`/`result.filePath` — the next poll tick or page reload will then correctly show the video as ready via `getStoryStatusAction`/`loadStoryAction`'s own read path, without ever re-dispatching Veo.)

## Warnings

### WR-01: The "stuck generation" detector's clock lives only in a browser ref and silently resets on every remount, delaying recovery for a genuinely stuck scene

**File:** `src/app/page.tsx:546-556` (stuck-timestamp bookkeeping), `src/app/page.tsx:104-105` (`generatingStartedAtRef` declaration), `src/components/story/VideoStatusScreen.tsx:9-13` (`STUCK_AFTER_MS`)

**Issue:** `generatingStartedAtRef` is a plain in-memory `useRef`, populated only as the polling effect observes a scene enter `"generating"`:

```ts
let stuck = false;
if (videoState === "generating") {
  const startedAt = generatingStartedAtRef.current[row.sceneNumber] ?? Date.now();
  generatingStartedAtRef.current[row.sceneNumber] = startedAt;
  stuck = Date.now() - startedAt > STUCK_AFTER_MS;
} else {
  delete generatingStartedAtRef.current[row.sceneNumber];
}
```

Nothing in this codebase persists when a scene actually entered `GENERATING` (the `Scene` table records only the enum status, no timestamp). This is exactly the recovery path 04-RESEARCH.md Pitfall 2 exists to cover — a dropped `after()` callback (dev-server recompile, or any process restart) leaves a scene at `GENERATING` in the database forever, with no further write ever coming. The one thing designed to notice that and offer a "Try again" button after `STUCK_AFTER_MS` (12 minutes) is this client-side clock — but the clock's only anchor is `Date.now()` captured the first time *this specific mounted page* observes the scene as generating. A browser refresh (which she might reasonably do herself, precisely because a video seems to be taking a very long time) wipes the ref, and the very next poll tick re-anchors `startedAt` to "now" again, regardless of how long the scene had actually been stuck server-side. The stuck affordance she is specifically trying to reach by reloading is what her reload just pushed another 12 minutes away.

This is not a data-loss or overspend risk — the underlying `videoStatus` and attempt count are unaffected, and she can still eventually get the "Try again" button if she leaves the tab open without reloading — but it materially undermines the one recovery mechanism this exact scenario was built for, in exactly the situation (a stuck-looking screen) where she is most likely to reload.

**Fix:** Anchor the stuck clock to something that survives a reload, since the schema has no per-scene "entered GENERATING at" timestamp today. Two options, either fine for this app's scale:
1. Add a nullable `videoGeneratingSince: DateTime?` column, set alongside the existing `GENERATING` write in `generate-video.ts`'s `dispatchSceneVideo` and cleared on every `READY`/`FAILED` write, and have `getStoryStatusAction` compute `stuck` server-side from that column instead of leaving it entirely to the browser.
2. At minimum, persist `generatingStartedAtRef`'s contents to `window.sessionStorage` (or `localStorage`, alongside the existing `LAST_STORY_ID_KEY` convention) keyed by `storyId:sceneNumber`, so a same-tab reload restores the original anchor instead of resetting it. This is strictly weaker than (1) — it does not survive opening the story fresh from "My Stories" on a different day — but is a much smaller change than a schema migration.

---

_Reviewed: 2026-09-16T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
