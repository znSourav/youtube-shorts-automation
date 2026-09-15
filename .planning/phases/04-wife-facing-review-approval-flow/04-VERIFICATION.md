---
phase: 04-wife-facing-review-approval-flow
verified: 2026-09-15T18:39:04Z
status: human_needed
score: 3/6 truths verified, 3 present-but-behavior-unverified
behavior_unverified: 3
overrides_applied: 0
requirements_checked: [APPROVAL-01, IMAGE-02, VIDEO-02, VIDEO-04, LIBRARY-01, OUTPUT-01, OUTPUT-03, UI-01]
behavior_unverified_items:
  - truth: "SC3 — She can generate videos for every approved scene, see each scene's job tracked with its own status, and retry a single failed scene (VIDEO-02, VIDEO-04)."
    test: "Approve a real story's images, press 'Generate All Videos', and watch Screen 4 while at least 2 scenes generate concurrently in the background. Force one scene to fail (or wait for a natural failure) and press 'Try again' on it only."
    expected: "Each scene's row updates independently (WAITING -> GENERATING -> READY/FAILED) via polling with no page-level loading gate; a failed scene's retry does not touch any other scene's status, path, or attempt count; the status persists across a reload."
    why_human: "Every batch-dispatch/orchestration unit test uses an injected fake dispatcher (zero real Veo calls) — this proves the orchestration logic (sequential, fault-tolerant, exactly-once) but not that next/server's after() actually survives to completion in this app's real runtime, that GENERATING is actually visible mid-flight, or that the poll loop actually reflects real state changes in a browser. No story in prisma/dev.db has ever reached a generated video in this phase; this was never observed live (04-03-SUMMARY.md, 04-04-SUMMARY.md)."
  - truth: "SC4 — She can open a finished episode's output folder directly from the app and find its clips numbered in the correct order for CapCut import (OUTPUT-01, OUTPUT-03)."
    test: "With a real completed episode (every scene video READY), press 'Open Output Folder' and confirm Windows Explorer opens on the right folder, that output/01_scene.mp4...0N_scene.mp4 sort in scene order, and that one clip plays in a real video player."
    expected: "Explorer opens on the correct directory; clip names sort into scene order by filename; a clip opens and plays as a valid, non-empty MP4."
    why_human: "The clip-naming/sort logic is unit-proven (src/core/storage-paths.test.ts's dedicated sort test, src/core/output/episode-export.test.ts), but the live open (execFile('explorer.exe', ...) actually painting an Explorer window, and a real numbered clip actually existing and playing) has never been observed — 04-04-SUMMARY.md explicitly records this item as 'NOT independently reproduced' because no story in the current database has ever reached a ready video, and the two on-disk folders with real Phase-2 video predate the current database's Story rows entirely."
  - truth: "SC6 — She can complete the entire create -> review -> approve -> generate -> output flow using only plain-language buttons and status text (UI-01)."
    test: "One continuous session: type a story idea, review it, generate scene images, approve them, generate all videos, watch Screen 4 to completion, retry any failure, then open the output folder — read every sentence out loud."
    expected: "Every screen transition and every string reads as plain language with no filesystem path, model id, story id, raw attempt count, or developer/API terminology, and the whole journey completes without a dead end."
    why_human: "This is the phase's overall goal statement and has never been exercised end-to-end in one continuous run with real generated assets. Every plan's SUMMARY records its own 'blocking-human' checkpoint as either substituted with orchestrator source-reading (04-02, most of 04-03) or only partially live (04-04: Library and empty-folder paths were live; approve/generate-video/real-output-folder were not, for the same budget reason each time)."
coincidental_reliance_items: []
human_verification:
  - test: "Approve a real story's images, press 'Generate All Videos', and watch Screen 4 while at least 2 scenes generate concurrently. Force or wait for one scene to fail; press 'Try again' on that scene only."
    expected: "Each scene row updates independently; a retry never touches another scene's status/path/attempt count; state survives a reload."
    why_human: "No real batch video dispatch has ever run in this phase (dev ledger unchanged at $3.0870 throughout); only fake-dispatcher unit tests exercise this path."
  - test: "With a real completed episode, press 'Open Output Folder'. Confirm Explorer opens on the right folder, output/ clips sort by name into scene order, and one clip plays."
    expected: "Explorer opens on the correct directory; numbered clips are present and playable in scene order."
    why_human: "Never observed live — no story in the current database has ever reached a ready video; the source-level execFile call and the sort-order unit test are the only evidence so far."
  - test: "Run the complete create -> review -> approve -> generate-all-videos -> Screen 4 -> retry -> open-output-folder flow in one continuous session, reading every screen's text out loud."
    expected: "No dead ends, no developer/API terminology anywhere, and the flow completes to a playable, correctly-numbered set of clips."
    why_human: "This is UI-01 and the phase's own stated goal; it has never been run end-to-end with real generated assets at any point across all four plans of this phase."
---

# Phase 4: Wife-Facing Review & Approval Flow Verification Report

**Phase Goal:** The actual non-technical target user can complete the full create-story-form → review-screens → approval → video-status-screen → find-output flow using only plain-language buttons and status text.
**Verified:** 2026-09-15T18:39:04Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Truths below are the ROADMAP.md Phase 4 Success Criteria, verified against the current codebase (post six-pass code review), not solely against SUMMARY.md narration.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: Video generation cannot start for a story — through any path, not just the visible UI — until images are explicitly approved. | ✓ VERIFIED | `evaluateVideoDispatch` (src/core/approval/gates.ts:58-97) checks `story.imagesApprovedAt === null` as branch 2, before scene lookup — an explicit ordering test asserts the approval refusal wins over a scene-not-found refusal (`gates.test.ts`). `check-boundaries.ts` invariant 5 (verified live: `OK: the image and video providers each have a single paid dispatch point`) makes a second Veo call site outside `generate-video.ts` a failing structural gate, so the batch path (`evaluateBatchDispatch`) and the retry path (`retrySceneVideoAction`, a one-line delegation) cannot route around it. `evaluateVideoDispatch` also refuses an already-`READY` scene (fourth-pass review fix, CR-01) and a `>= cap` scene. This is pure, zero-I/O logic and is fully provable without a live server; the ordering assertion is the load-bearing proof. |
| 2 | SC2: A single scene's image can be regenerated without affecting any other scene's image, video, or status. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `evaluateImageRegeneration` is unit-tested (cap refusal, `alreadyApproved` flag, not-blocked-by-approval). `handleRegenerateImage` in `page.tsx` maps only the matching `sceneNumber` (acceptance criteria required this; no automated test of `page.tsx` itself exists — no component/DOM test framework is set up anywhere in this repo). The action itself (`regenerateSceneImageAction`) reuses the single existing image dispatch point (`check-boundaries.ts` invariant 5 stays green) and increments the counter before dispatch. No real image regeneration was ever exercised live in this phase — 04-02-SUMMARY.md's own Task 3 checkpoint substituted a browser tool + source read for a live click, because no story had all-ready images within dev-ledger budget. |
| 3 | SC3: She can generate videos for every approved scene, see each scene's job tracked with its own status, and retry a single failed scene without affecting others. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `runBatchVideoDispatch` is thoroughly proven with an injected fake dispatcher (sequential, fault-tolerant, exactly-once-per-scene, no overlap) — `node --test src/core/video/batch.test.ts` passes. `evaluateBatchDispatch` correctly excludes already-READY/GENERATING/at-cap scenes (unit-tested). `retrySceneVideoAction` is a one-line delegation (verified by a dedicated delegation-text check). But no real Veo dispatch has ever occurred anywhere in Phase 4 — the dev spend ledger is unchanged at exactly `3.0870` from the start of the phase to now, and every story currently in `prisma/dev.db` has every scene at `imageStatus: WAITING, videoStatus: WAITING` (confirmed by direct query in this verification). `next/server`'s `after()` background-dispatch behavior, the GENERATING-visible-mid-flight property, and the live poll loop actually reflecting DB state in a browser have never been observed running. |
| 4 | SC4: She can open a finished episode's output folder directly from the app and find its clips numbered in the correct order for CapCut import. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `outputClipPath`'s zero-pad + `src/core/storage-paths.test.ts`'s dedicated "sort of clip names 1-12 equals ascending scene order" test both pass live in this session. `exportEpisodeAssets` is heavily unit-tested (14/14 in `episode-export.test.ts`, including the sixth-checkpoint `folderMissing` fix). `openStoryFolderAction`/`finalizeEpisodeAction` are the sole process-spawning call site (`check-boundaries.ts` invariant 6, verified live: `OK: only the output-folder action may spawn an operating-system process`). But the live `execFile("explorer.exe", ...)` opening a real Explorer window on a folder containing real, playable, correctly-numbered clips has never been observed — 04-04-SUMMARY.md explicitly records this item (checklist item 6) as "NOT independently reproduced," because no story in the database has ever reached a ready video and the two on-disk folders that do have real Phase-2 video predate the current database's Story rows entirely (confirmed independently again in this verification: zero scenes across all three current stories have a non-null `videoPath`). |
| 5 | SC5 (soft): She can see a list of all past stories with title, date, status, and scene count, and open any one, with no duplicate entries from normal use. | ✓ VERIFIED | Genuinely live-verified, not substituted: 04-04-SUMMARY.md records a real browser click-through — "My Stories" pressed twice in a row from the create screen produced the identically-sized 3-row list both times, and clicking a row opened that exact story's own scenes. Backed by `listStoriesWithSceneCounts`'s dedicated no-duplicates test (`src/lib/db.test.ts`, re-run clean in this session: 22/22 pass) and `computeLibraryStatus`'s 5-label precedence coverage (`story-view.test.ts`, re-run clean: all branches pass). This is the one Success Criterion in this phase actually exercised live end-to-end with real application state — a genuinely stronger evidentiary bar than the others. |
| 6 | SC6: She can complete the entire create → review → approve → generate → output flow using only plain-language buttons and status text, with plain-language errors. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Every refusal/confirmation string in `gates.ts`, `approve-images.ts`, `regenerate-scene-image.ts`, `open-story-folder.ts`, `list-stories.ts` was checked against the UI-SPEC Copywriting Contract by the plans' own acceptance criteria and is free of paths/model ids/story ids in this reading. No debt markers (`TBD`/`FIXME`/`XXX`) found across all phase-touched files in this session's scan. But no single continuous session has ever run the full create → review → approve → generate → status → output journey with real generated assets — each plan's `blocking-human` checkpoint independently hit the same $0.1630-of-$3.25 dev-ledger-headroom wall and substituted source-reading or a partial live check instead (04-01: no live check at all, deferred to end-of-phase UAT per its own rationale; 04-02: substituted; 04-03: substituted, though one real bug was found and fixed via source reading; 04-04: partially live — Library and an empty/never-populated folder path were live, approve/generate-video/real-output-folder were not). |

**Score:** 3/6 truths verified (3 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/approval/gates.ts` | Access-control surface: evaluateVideoDispatch/evaluateApproval/evaluateImageRegeneration/evaluateBatchDispatch | ✓ VERIFIED | Present, pure (imports only the `StoryWithScenes` type), all branches unit-tested |
| `src/core/retry/caps.ts` | `maxSceneRetryAttempts()`, env-configurable | ✓ VERIFIED | Present, mirrors `maxRegenerationAttempts`, 8 test cases pass |
| `src/core/video/batch.ts` | `runBatchVideoDispatch`, injectable sequential orchestrator | ✓ VERIFIED | Present, no I/O imports, sequential/fault-tolerant behavior proven with a fake dispatcher |
| `src/core/output/episode-export.ts` | `exportEpisodeAssets`, `buildStoryJson`, `buildStoryText` | ✓ VERIFIED | Present, 14/14 tests pass including the folder-missing fix |
| `src/app/actions/approve-images.ts` | `approveStoryImagesAction` | ✓ VERIFIED | Present, wired to `evaluateApproval`/`markImagesApproved` |
| `src/app/actions/regenerate-scene-image.ts` | `regenerateSceneImageAction` | ✓ VERIFIED | Present, reuses the single image dispatch point |
| `src/app/actions/generate-all-videos.ts` | `generateAllVideosAction` | ✓ VERIFIED | Present, dispatches via `after()`, returns immediately |
| `src/app/actions/get-story-status.ts` | `getStoryStatusAction` | ✓ VERIFIED | Present, no file reads, no path field |
| `src/app/actions/retry-scene-video.ts` | `retrySceneVideoAction` | ✓ VERIFIED | Present, one-line delegation confirmed via text check |
| `src/app/actions/open-story-folder.ts` | `openStoryFolderAction`, `finalizeEpisodeAction` | ✓ VERIFIED | Present, sole process-spawning call site |
| `src/app/actions/list-stories.ts` | `listStoriesAction` | ✓ VERIFIED | Present, no parameters, type-only re-exports |
| `src/components/story/VideoStatusScreen.tsx` | Screen 4 (dedicated, not bolted onto Screen 3) | ✓ VERIFIED | Present, distinct component; live-confirmed distinct in 04-03's checkpoint |
| `src/components/story/MyStoriesList.tsx` | Library screen | ✓ VERIFIED | Present, live-confirmed rendering real rows in 04-04's checkpoint |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `generateSceneVideoAction` | `evaluateVideoDispatch` | approval → cap → READY-guard → ceiling, in fixed order | ✓ WIRED | Confirmed by reading `generate-video.ts` and the gate's own doc comment; ordering unit-tested |
| Approve These Images button | `approveStoryImagesAction` → `evaluateApproval` → `markImagesApproved` | page.tsx handler → Server Action → gate → repository write | ✓ WIRED (code-level) | Confirmed by source read; not live-clicked (see SC2/SC6) |
| Regenerate this image button | `regenerateSceneImageAction` → `evaluateImageRegeneration` → `incrementImageAttempt` → `generateSceneImagesAction` (1-element array) | page.tsx handler → Server Action → gate → counter → single existing dispatch point | ✓ WIRED (code-level) | `check-boundaries.ts` invariant 5 confirms no second image dispatch point was opened |
| Generate All Videos button | `generateAllVideosAction` → `evaluateBatchDispatch` → `after()` → `runBatchVideoDispatch` → `generateSceneVideoAction` per scene | page.tsx handler → Server Action → gate → background orchestrator → per-scene gated dispatch | ✓ WIRED (code-level) | Confirmed by source read + unit tests on the orchestrator; not live-exercised (SC3) |
| a scene flipping to READY | VideoStatusScreen's inline player | poll (`getStoryStatusAction`) → `loadStoryAction` on transition → `SceneVideo` | ✓ WIRED (code-level) | Confirmed by source read; polling behavior never observed live (SC3) |
| Open Output Folder button | `openStoryFolderAction` → `exportEpisodeAssets` → `execFile("explorer.exe", ...)` | page.tsx handler → Server Action → export → OS spawn | ✓ WIRED (code-level) | `check-boundaries.ts` invariant 6 confirms sole spawn point; never observed opening a real Explorer window with real content (SC4) |
| a Library row | `loadStoryAction` → `applyLoadedStory` → review-images screen | page.tsx handler → Server Action → shared restore mapping | ✓ WIRED, live-confirmed | 04-04's genuine browser click-through opened a real story's own scenes |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `evaluateVideoDispatch` grant | `imagePath` | `scene.imagePath` (DB row, `findStoryWithScenes`) | Yes — resolved server-side, never client-supplied | ✓ FLOWING |
| `getStoryStatusAction` rows | `videoStatus`/`imageStatus`/`videoAttempts` | `findStoryWithScenes` (live DB query, no file reads) | Yes | ✓ FLOWING |
| `listStoriesWithSceneCounts` | Library rows | `Story`/`Scene` `findMany` with nested select | Yes — live-confirmed against real 3-story DB | ✓ FLOWING |
| `exportEpisodeAssets` clips | `output/NN_scene.mp4` | copied from `scene.videoPath` on disk | Not yet exercised with a real ready video anywhere in this DB (all `videoPath` are `null`) | ⚠️ STATIC (no real source data exists to flow yet — not a wiring defect, a data-availability gap) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Boundary invariants (6, including the two this phase added) | `node src/scripts/check-boundaries.ts` | 6 `OK:` lines, no `BOUNDARY CHECK FAILED` | ✓ PASS |
| Full lib test suite | `npm run test:lib` | 214/214 pass | ✓ PASS |
| Typecheck | `npm run typecheck` | clean, 0 errors | ✓ PASS |
| Production build | `npm run build` | compiles, static pages generated | ✓ PASS |
| OUTPUT-03 mechanical proof | `node --test --test-name-pattern="sort" src/core/storage-paths.test.ts` | 1/1 pass | ✓ PASS |
| Library no-duplicates + status precedence | `node --test src/core/persistence/story-view.test.ts src/lib/db.test.ts` | 22/22 pass | ✓ PASS |
| Dev spend ledger unchanged | `node -e "...spend-ledger.json..."` | `LEDGER 3.0870` | ✓ PASS (no paid call made by this verification) |
| CR-01 (sixth-pass review) fix present in live source | Read `src/app/actions/generate-video.ts:321-350` | Writes `READY`/real path instead of `FAILED`/null on a post-generation readback failure | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| APPROVAL-01 | 04-01, 04-02 | Video generation cannot start until images are approved, through any path | ✓ SATISFIED (code-level) | `evaluateVideoDispatch`, `check-boundaries.ts` invariant 5, ordering test |
| IMAGE-02 | 04-01, 04-02 | Regenerate a single scene's image without affecting any other scene | ⚠️ SATISFIED (code-level), behavior unverified | See SC2 above |
| VIDEO-02 | 04-03 | Generate videos for every approved scene, each tracked independently | ⚠️ SATISFIED (code-level), behavior unverified | See SC3 above |
| VIDEO-04 | 04-01, 04-03 | Retry a single failed scene's video, counted toward its own cap | ✓ SATISFIED (code-level) | `evaluateVideoDispatch` cap branch, `retrySceneVideoAction` delegation, unit-tested; live retry never exercised (folds into SC3) |
| LIBRARY-01 (soft) | 04-04 | List of past stories, no duplicates, open any one | ✓ SATISFIED, live-verified | Genuine live click-through in 04-04; explicitly shipped in full per the task brief, not documented as a limitation |
| OUTPUT-01 | 04-04 | Predictable local folder structure, openable from the app | ⚠️ SATISFIED (code-level), behavior unverified | See SC4 above |
| OUTPUT-03 | 04-04 | Output clips numbered for correct CapCut import order | ✓ SATISFIED (mechanical proof), live folder-open unverified | Sort-order unit test is a strong, direct proof of the naming/ordering contract itself; the live Explorer-open experience is the unverified part |
| UI-01 | 04-01 through 04-04 | Full flow completable with plain-language UI only | ⚠️ SATISFIED (code-level), behavior unverified | See SC6 above |

No orphaned requirements: all 8 IDs from the task brief (APPROVAL-01, IMAGE-02, VIDEO-02, VIDEO-04, LIBRARY-01, OUTPUT-01, OUTPUT-03, UI-01) appear in exactly the union of the four plans' `requirements:` frontmatter, and REQUIREMENTS.md's traceability table maps all of them to Phase 4 with a "Complete" status consistent with the code-level evidence above (with the caveat that "Complete" reflects implementation + gating + unit-test proof, not a live behavioral run, for IMAGE-02/VIDEO-02/VIDEO-04/OUTPUT-01/UI-01).

### Anti-Patterns Found

None. Scanned every file this phase created or modified for `TBD`/`FIXME`/`XXX`/`HACK`/`PLACEHOLDER`/empty-implementation patterns — zero matches. The six-pass code review (`04-REVIEW.md`, `04-REVIEW-FIX.md`) independently found and fixed 20 real defects across the phase's lifetime (a budget-ceiling race condition, an orphaned already-paid-for-video bug, a permanently-stranded-episode bug, and others); the one remaining open item (WR-01, the stuck-generation detector's client-only clock resetting on reload) is a documented, deliberately deferred Warning-severity limitation recorded in `STATE.md`'s decision log — not a silently dropped requirement, and not re-flagged here as a gap per this verification's own instructions.

### Probe Execution

Not applicable — this phase has no `scripts/*/tests/probe-*.sh` convention and none is referenced by its plans, SUMMARYs, or success criteria.

### Human Verification Required

1. **Batch video generation with per-scene independence and single-scene retry (SC3, VIDEO-02, VIDEO-04)**
   **Test:** Approve a real story's images, press "Generate All Videos," and watch Screen 4 while multiple scenes generate. Force or wait for one scene to fail, then press "Try again" on that scene only.
   **Expected:** Each row updates independently through WAITING → GENERATING → READY/FAILED via polling; the retry touches only that scene's status/path/attempt count; state survives a reload.
   **Why human:** No real Veo dispatch has ever occurred in this phase (ledger unchanged at $3.0870 throughout); only a fake-dispatcher unit test exercises the orchestration logic, not the real `after()`/polling/GENERATING-visibility behavior in a running app.

2. **Open a real finished episode's output folder (SC4, OUTPUT-01, OUTPUT-03)**
   **Test:** With a story whose every scene video is READY, press "Open Output Folder." Confirm Explorer opens on the correct folder, that `output/01_scene.mp4`...`0N_scene.mp4` sort into scene order, and that one clip plays in a real video player.
   **Expected:** A real Explorer window opens on the right directory; numbered clips exist, sort correctly, and are playable.
   **Why human:** No story in the current database has ever reached a ready video (confirmed by direct query in this verification: every scene's `videoPath` is currently `null`); 04-04-SUMMARY.md explicitly records this exact check as not independently reproduced.

3. **One continuous end-to-end run of the full wife-facing flow (SC6, UI-01 — the phase's own stated goal)**
   **Test:** In a single session, create a story, review it, generate scene images, approve them, generate all videos, watch Screen 4 to completion, retry any failure, and open the output folder — reading every sentence out loud.
   **Expected:** No dead ends, no developer/API terminology anywhere, and the journey completes to a correctly-numbered, playable set of clips.
   **Why human:** This exact continuous run has never happened in this phase. Every one of the four plans' `blocking-human` checkpoints independently hit the same dev-ledger-headroom constraint ($0.1630 of $3.25) and substituted source-reading or a partial live check (only 04-04's Library and empty-folder paths, and 04-03's Screen-4-distinctness/layout, were genuinely observed live).

### Gaps Summary

No code-level gaps were found: all automated gates (typecheck, build, 214/214 unit tests, all 6 structural boundary invariants, the dedicated OUTPUT-03 sort proof, the Library no-duplicates proof) pass cleanly against the current codebase, and the phase's own six-pass code review independently found and fixed 20 real defects, with the one remaining item (a Warning-severity, client-clock-reset limitation) deliberately deferred and documented rather than silently dropped.

The reason this verification does not return `passed` is that the phase's central deliverable — a non-technical user completing the real create → review → approve → generate → status → output journey — has never been observed happening, with real generated assets, at any point across all four plans that built it. Every relevant `blocking-human` checkpoint in this phase hit the same wall: a $0.1630-of-$3.25 dev-sandbox spend ceiling too small to generate a full image set (~$0.40) or a full video batch (~$1.00-$2.80), so three of the six roadmap success criteria (SC3, SC4, SC6) were verified only at the code/unit-test level, never behaviorally. This is not evidence of broken functionality — the orchestration logic, gating, and structural invariants are unusually well-proven for a 24-hour-scoped project — but it is a real, observable gap between "the code is present and internally consistent" and "the actual target user has been shown to succeed at the actual task," which is precisely the phase's own goal statement. This should be resolved with a real (budget-permitting) live run before this phase is considered fully closed, ideally by raising `DEV_CEILING_USD` or running the check against the real $15/month production budget rather than the dev sandbox ceiling.

---

_Verified: 2026-09-15T18:39:04Z_
_Verifier: Claude (gsd-verifier)_
