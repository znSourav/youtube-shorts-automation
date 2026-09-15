---
phase: 04-wife-facing-review-approval-flow
fixed_at: 2026-09-16T00:00:00Z
review_path: .planning/phases/04-wife-facing-review-approval-flow/04-REVIEW.md
iteration: 6
findings_in_scope: 2
fixed: 1
skipped: 1
status: partial
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-09-16T00:00:00Z
**Source review:** .planning/phases/04-wife-facing-review-approval-flow/04-REVIEW.md
**Iteration:** 6 (final -- this was the sixth and last review-fix cycle for this phase)

**Summary:**
- Findings in scope: 2 (1 Blocker/Critical, 1 Warning)
- Fixed: 1 (the Blocker)
- Skipped: 1 (the Warning, deliberately deferred and documented)

Iterations 1-5's nineteen findings were fixed and re-confirmed correct in separate, earlier commits.
This pass's fix was applied directly by the orchestrator.

## Fixed Issue

### CR-01 (BLOCKER): A successfully-generated, already-paid-for video was discarded when its immediate playback-preview readback failed

**Files modified:** `src/app/actions/generate-video.ts`
**Commit:** `651e914`

**Applied fix:** When `generateVideo()` succeeds (Veo genuinely writes `result.filePath` to disk and the
call is billed) but the immediate `readFileSync(result.filePath)` used to build this response's inline
`data:` URL preview throws, the code previously called `updateSceneVideo(storyId, sceneNumber, null,
SceneAssetStatus.FAILED)` — discarding the real, already-paid-for video the success branch four lines
below would have kept. This orphaned the clip: `exportEpisodeAssets`, `getStoryStatusAction`, and
`loadStoryAction` all gate on `videoStatus === "READY"`, so the finished video would never reach the
CapCut output folder even though the file was genuinely on disk; and a "Try again" click would dispatch
a brand-new paid Veo call and consume one of the scene's three limited retry attempts, for a failure
that had nothing to do with whether the generation itself succeeded.

Now mirrors the success path exactly: writes `READY` with the real `filePath`, and records the
generation as a true success (`ok: true, message: "Video generated."`) — an accurate reflection of
reality, since the generation genuinely succeeded and only this response's own inline preview failed.
The next poll tick or page reload gets an independent chance to read the same file again — likely
succeeding, since the original failure was local and transient (a locked file, an antivirus scan
mid-write, a momentary disk hiccup), not a property of the file itself. This immediate response still
cannot show her the video inline right now, so it still returns `ok: false` with a plain explanation —
but per this function's own documented callers, that return value is discarded by every real production
path (both `runBatchVideoDispatch`'s batch loop and `retrySceneVideoAction`'s single-scene retry rely
entirely on the next poll tick reading the real DB-backed status, never on this function's own return
value), so the corrected database write is what actually matters here.

This fix also reinforces the fourth-pass's `evaluateVideoDispatch` READY-refusal: once this scene
correctly reaches `READY`, it can never again be accidentally re-dispatched by any caller.

**Verification:** `npx tsc --noEmit` (clean), `npm run test:lib` (214/214, unchanged — this is an
error-handling correction around an existing I/O call, not a change to any pure function a unit test
exercises), `npm run build` (compiles), dev spend ledger re-confirmed unchanged at exactly `$3.0870` of
`$3.25`.

## Skipped Issue

### WR-01 (Warning): The stuck-generation detector's clock resets to zero on a page reload

**Files:** `src/app/page.tsx:546-556, 104-105`, `src/components/story/VideoStatusScreen.tsx:9-13`

**Why deferred:** The stuck-scene detector's 12-minute countdown lives only in a client-side `useRef`
(`generatingStartedAtRef`), with no server-side timestamp anchor — a browser refresh silently resets it
to zero even for a scene that has already been stuck (a dropped `after()` callback, 04-RESEARCH.md
Pitfall 2) for far longer, delaying the "Try again" recovery affordance's reappearance by up to another
12 minutes at exactly the moment (a screen that looks stuck) she'd be most likely to reload.

A correct fix requires a schema migration — a server-recorded "generating since" timestamp column on
`Scene`, written when a scene transitions to `GENERATING` and consumed by `getStoryStatusAction` to
compute "stuck" server-side instead of the client guessing elapsed time from its own mount — a
materially bigger, riskier change than any other fix across this six-pass review cycle, for a
Warning-severity UX delay with no budget or data-integrity consequence (the worst case is a longer wait
before the recovery button reappears, not lost money or lost work). Recorded as a known, tracked
limitation in `STATE.md` for a future phase (Phase 6, Reliability, Secrets Hygiene & Output Correctness,
or wherever D-05's stuck-recovery mechanism is next hardened) rather than expanding this already
six-pass review cycle's scope further.

## Review Cycle Summary (all six passes)

| Pass | Critical | Warning | Info | Fixed |
|------|----------|---------|------|-------|
| 1 | 1 | 3 | 0 | 4/4 |
| 2 | 3 | 4 | 2 | 7/7 (critical+warning scope) |
| 3 | 2 | 2 | 1 | 5/5 (critical+warning scope) |
| 4 | 1 | 0 | 0 | 1/1 |
| 5 | 1 | 1 | 0 | 2/2 |
| 6 | 1 | 1 | 0 | 1/2 (1 deliberately deferred and documented) |

Twenty findings fixed across six independent review passes, each pass verified by the orchestrator
directly reading every diff (not solely trusting a fixer agent's own report), with standalone empirical
proofs written for both concurrency-sensitive fixes (the CR-03 dispatch mutex, and the fourth-pass
story-scoped batch guard). One Warning-severity item explicitly deferred and documented rather than
silently dropped or scope-crept into a bigger change. This is the final review-fix cycle for this
phase — no further passes are planned.

---
*Fixed: 2026-09-16*
*Fixer: Claude (orchestrator, direct implementation)*
*Iteration: 6 (final)*
