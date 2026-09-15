---
status: complete
phase: 04-wife-facing-review-approval-flow
source: [04-01-SUMMARY.md, 04-02-SUMMARY.md, 04-03-SUMMARY.md, 04-04-SUMMARY.md, 04-VERIFICATION.md]
started: 2026-09-15T19:15:00Z
updated: 2026-09-15T19:20:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Video generation is gated behind explicit image approval (APPROVAL-01, SC1)
expected: No path — the visible "Generate All Videos" button or any other route — can dispatch a paid video call before she has pressed "Approve These Images" for that story.
result: pass
note: "Live-confirmed in the 2026-09-15 real end-to-end run, not just code-reviewed: story-1789498386163-pb6tfs's imagesApprovedAt (2026-09-15T18:54:37.457Z) is recorded strictly before the first real video-generation ledger entry (18:55:42), confirmed by direct Prisma query against prisma/dev.db in the 04-VERIFICATION.md re-verification pass. Structurally backed by evaluateVideoDispatch's approval check (gates.ts) and check-boundaries.ts invariant 5 (single paid video dispatch point)."

### 2. A single scene's image can be regenerated without affecting any other scene (IMAGE-02, SC2)
expected: Pressing "Regenerate this image" on one scene changes only that scene's image and attempt count; every other scene's image, video, and status stay untouched.
result: skipped
reason: "Deferred follow-up: the 2026-09-15 live run's story was already fully approved and video-complete by the time this was considered, and reaching this control on that same story required navigating back to the image-review screen -- which this session's own code review (CR-02, second pass) already found and documented has no live path once a story is approved. Testing it for real would require creating an entirely new story (~$0.40) just to reach the pre-approval window again. User explicitly chose to accept the current evidence and document this rather than spend further: evaluateImageRegeneration is unit-tested (cap refusal, alreadyApproved flag, not-blocked-by-approval), and handleRegenerateImage in page.tsx maps only the matching sceneNumber by construction (no component/DOM test framework exists in this repo to prove it live)."

### 3. Batch video generation tracks every scene independently (VIDEO-02, SC3 primary clause)
expected: Pressing "Generate All Videos" dispatches every approved scene's video job; each scene's row updates independently (WAITING -> GENERATING -> READY) via polling with no page-level loading gate.
result: pass
note: "Live-confirmed in the 2026-09-15 real run: created a real 5-scene story ('The Firefly Path'), approved real images, pressed 'Generate All Videos', and watched all 5 scenes progress sequentially -- Scene 1 showed 'Generating video... this can take a few minutes.' while Scenes 2-5 correctly still showed 'isn't available yet', then progression continued one scene at a time through all 5, confirmed via server logs ('VEO POLL: waiting for operation...') and real <video> players appearing (screenshot-confirmed: play button, 0:00 timestamp, volume/fullscreen controls) as each scene completed. Direct DB query confirms all 5 scenes reached videoStatus: READY independently with real videoPath values. Real cost: $1.985 total for this story (story+images+videos)."

### 4. A single failed scene can be retried without affecting other scenes (VIDEO-04, SC3 retry sub-clause)
expected: Pressing "Try again" on a failed scene re-dispatches only that scene; every other scene's status/path/attempt count is untouched; state survives a reload.
result: skipped
reason: "Deferred follow-up: the 2026-09-15 live run had zero failures (all 5 scenes succeeded on their first attempt, videoAttempts: 1 confirmed by direct DB query) -- there was no failed scene to retry, and forcing one on demand is non-deterministic (would require either intrusive engineering to fake a local failure, or gambling on the provider genuinely failing). User explicitly chose to accept the current evidence and document this. retrySceneVideoAction is a one-line delegation to the same gated dispatch the batch uses (verified by a dedicated delegation-text check) -- it structurally cannot skip approval or the retry-cap check, and that shared dispatch mechanism (generateSceneVideoAction / dispatchSceneVideo) was itself just proven live by test 3 above, including its CR-03 app-wide concurrency mutex (independently proven via a standalone script during code review) and its fourth/fifth-pass hardening against double-dispatch and lost ledger entries."

### 5. She can open a finished episode's output folder and find real, correctly-numbered clips (OUTPUT-01, OUTPUT-03, SC4)
expected: "Open Output Folder" opens Windows Explorer on the story's real folder; output/01_scene.mp4...0N_scene.mp4 exist, sort into scene order by filename, and are valid playable clips.
result: pass
note: "Live-confirmed in the 2026-09-15 real run: pressed 'Open Output Folder' and received the exact locked confirmation 'Opening the folder...'. Independently verified on disk (not from the app's own claim) in the 04-VERIFICATION.md re-verification: storage/stories/story-1789498386163-pb6tfs/output/ contains exactly 01_scene.mp4 through 05_scene.mp4, zero-padded and correctly ordered, each with a valid MP4 (ftyp/isom) header and real substantial size (1768232/590613/2675677/1608763/2238440 bytes -- not empty or corrupted). Could not visually confirm the literal Explorer window painting on screen (no available tool can observe the desktop) -- this is an acknowledged, honest tooling limit, not a gap in the test."

### 6. The Story Library lists every past story with no duplicates (LIBRARY-01, SC5)
expected: 'My Stories' shows one row per story with title/date/plain-language status/scene count; pressing it twice never lengthens the list; opening a row returns to that story's own scenes.
result: pass
note: "Unchanged from 04-04's own genuine live browser click-through (recorded in 04-04-SUMMARY.md and independently re-confirmed by this session's code review and phase verifier): 'My Stories' pressed twice in a row produced the identically-sized 3-row list both times, and clicking a row opened that exact story's own scenes. Not re-tested in the 2026-09-15 run since nothing in this area changed."

### 7. The complete create -> review -> approve -> generate -> output flow reads in plain language throughout (UI-01, SC6 primary clause)
expected: One continuous session, from typing a story idea through opening the output folder, uses only plain-language buttons and status text with no filesystem path, model id, story id, raw attempt count, or developer/API terminology anywhere.
result: pass
note: "Live-confirmed in the 2026-09-15 real run: one uninterrupted session went create -> real story -> real images -> real approval ('Images approved. You can now generate videos for every scene.') -> real batch video generation -> completion ('Every scene is ready. Your episode's clips are saved and numbered for CapCut.') -> real output folder ('Opening the folder...'). Every string observed was plain language; story.txt was independently read and confirmed free of paths/model ids/dev terms."

### 8. A real error message reads as plain language with no developer/API terminology (UI-01, SC6 error sub-clause)
expected: An error encountered anywhere in the flow (a scene failure, an over-cap refusal) reads as plain language with no filesystem path, model id, story id, or developer/API terminology.
result: skipped
reason: "Deferred follow-up: the 2026-09-15 live run completed with zero errors anywhere (5/5 images and 5/5 videos succeeded on the first attempt), so no error string was ever actually rendered and observed live. User explicitly chose to accept the current evidence and document this. Every refusal/confirmation string in gates.ts, approve-images.ts, regenerate-scene-image.ts, open-story-folder.ts, and list-stories.ts was checked against the UI-SPEC Copywriting Contract at the source-code level during phase verification and found free of paths/model ids/story ids -- content review, not a live-rendering observation, but the strings themselves are the same ones already proven to render correctly for the non-error cases in tests 1, 3, 5, and 7 above."

## Summary

total: 8
passed: 5
issues: 0
pending: 0
skipped: 3
blocked: 0

## Deferred Follow-Ups

- test: 2
  idea: "Live-test single-scene image regeneration in isolation (IMAGE-02, SC2) once a story is available that has real images but is not yet approved, or once a UI path back to image-regen after approval exists (CR-02's deferred recovery-UI half)."
  deferred_at: 2026-09-15
- test: 4
  idea: "Live-test single-scene video retry after a genuine failure (VIDEO-04, SC3 retry sub-clause) -- naturally, the next time a real scene fails during real use, or via a deliberate low-cost fault-injection session if desired."
  deferred_at: 2026-09-15
- test: 8
  idea: "Live-observe a real plain-language error render (SC6 error sub-clause) -- naturally, the next time a real error occurs during real use."
  deferred_at: 2026-09-15

## Gaps

[none -- zero issues found; three items deferred by explicit user decision, not gaps]
