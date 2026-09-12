---
phase: 02-core-generation-pipeline
plan: 04
subsystem: video-generation-pipeline
tags: [veo, gemini, image-to-video, story-probe, spend-ledger, bangla, banglish]

requires:
  - phase: 02-core-generation-pipeline (plan 03)
    provides: "generateSceneImagesAction, SceneImageStatus, storage-paths.ts (sceneVideoPath), the three-screen UI with SceneCard's open video slot"
provides:
  - "src/app/actions/generate-video.ts -- generateSceneVideoAction(storyId, scene, imagePath): ceiling-gated, sole generateVideo call site, CR-03 second-layer motion-prompt guard, duration resolved to nearest 4/6/8s"
  - "src/components/scenes/SceneVideo.tsx -- four-state client component (waiting/generating/ready/failed), video delivered as a data: URL"
  - "src/scripts/story-probe.ts extended with --video/--story-id/--duration/--motion-prompt/--character flags and full premise/theme/emotional_arc/ending printing"
  - ".planning/phases/02-core-generation-pipeline/02-PROOF-RUN.md -- real evidence from the Bangla/Banglish comparison and the (blocked) full-scale attempt"
affects: [03-persistence-and-structural-uniqueness]

actuals:
  tokens: 10900
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Video transported to the browser as a base64 data: URL (matching 02-03's image pattern) -- no new file-serving route, filesystem path never rendered"
    - "Second-layer safety guard downstream of the prompt-level instruction: generateSceneVideoAction rewrites a pose-change motion_prompt to camera/environment-only phrasing before the paid call dispatches, mirroring CR-03's finding from Phase 1"
    - "story-probe.ts's video-only mode (--story-id + --video) drives the real Server Action path against an already-generated scene image without paying for a fresh story/image run, since story.json persistence doesn't exist yet (Phase 3) -- it constructs a minimal probe Scene rather than reading one back off disk"

key-files:
  created:
    - src/app/actions/generate-video.ts
    - src/components/scenes/SceneVideo.tsx
    - .planning/phases/02-core-generation-pipeline/02-PROOF-RUN.md
  modified:
    - src/components/scenes/SceneCard.tsx
    - src/app/page.tsx
    - src/scripts/story-probe.ts

key-decisions:
  - "Video-only probe mode (--story-id/--video) synthesizes a minimal Scene object rather than reading real scene data off disk, because story.json persistence is Phase 3's job -- --duration=/--motion-prompt= let the operator carry over real values a prior run printed when fidelity matters"
  - "generateSceneVideoAction reads the finished MP4 back off disk and returns it as a videoDataUrl, matching generate-images.ts's transport pattern exactly rather than introducing a new file-serving route for video"
  - "Only ONE control triggers video generation in the UI (the renamed bottom button) -- SceneCard's video slot for the non-target scenes shows a plain waiting message with no action, and the target scene's card shows state passively plus a Try Again control on failure, avoiding two competing triggers for one paid action"
  - "After three consecutive real, identical-input blocks on Run B's Bangla-script idea (all prompt-level PROHIBITED_CONTENT), execution stopped rather than trying a fourth variant or a different idea -- this exceeds even the established single-retry convention (RESEARCH.md Pitfall 3, smoke-test.ts's own childscene-probe pattern) and is reported as a real, reproducible finding rather than engineered around"

requirements-completed: [VIDEO-01, STORY-01, STORY-02, STARTUP-01]

coverage:
  - id: D1
    description: "One approved scene image becomes a real, playable, portrait 720p MP4 on disk, confirmed by a real paid Veo call before any full-episode commitment (VIDEO-01)"
    requirement: VIDEO-01
    verification:
      - kind: e2e
        ref: "node --env-file=.env.local src/scripts/story-probe.ts --story-id=story-1789237907876-npep3b --video=1 -> ok=true, path present, bytes=1559179, seconds=8"
        status: pass
      - kind: other
        ref: "MP4 container check: size=1559179, ftyp box present at byte offset 4"
        status: pass
    human_judgment: true
    rationale: "Playback quality (portrait framing, visible coherent motion, absence of the CR-03 head/torso artifact) and the UI's disabled-until-ready gate are visual/interactive judgments no test asserts -- per workflow.human_verify_mode=end-of-phase this is deferred to end-of-phase UAT, same resolution path 02-02/02-03 used. A boot smoke check (dev server serves the home page) was run as partial automated coverage."
  - id: D2
    description: "generateSceneVideoAction is the sole generateVideo call site in the app, ceiling-gated on every dispatch (T-02-04), and its CR-03 second-layer motion-prompt guard is present"
    verification:
      - kind: unit
        ref: "grep confirms generate-video.ts is the only src/ call site of generateVideo() besides Phase 1's standalone smoke-test.ts script (not part of the app runtime)"
        status: pass
      - kind: other
        ref: "checkCeiling precedes generateVideo, recordSpend follows unconditionally, in generate-video.ts's own source"
        status: pass
    human_judgment: false
  - id: D3
    description: "The Banglish idea produced a coherent story with title/beginning/middle/ending through the identical code path used for Bangla, with no manual translation step (STORY-02)"
    requirement: STORY-02
    verification:
      - kind: e2e
        ref: "Run A: story-probe.ts --scenes=3 --idea=<Banglish> -> ok=true after one retry, title kept in Banglish rendering, scenes 1..3, durations varied 6/4/8"
        status: pass
    human_judgment: true
    rationale: "Whether the Banglish output reads as equally coherent/complete as a Bangla-script counterpart is a qualitative judgment -- 02-PROOF-RUN.md records the real title/structure; the intended Bangla-script counterpart for this exact idea (Run B) was blocked three times and could not be generated this session, so a true side-by-side text comparison for THIS idea is incomplete (see Deviations/Known Stubs)."
  - id: D4
    description: "The pipeline has been run once at the real 5-6 scene target scale (D-04)"
    verification:
      - kind: e2e
        ref: "Run B: story-probe.ts --scenes=5 --images --idea=<Bangla script> -- blocked on all 3 attempts, prompt: PROHIBITED_CONTENT each time; no images or video were ever dispatched"
        status: fail
    human_judgment: true
    rationale: "This is a genuine, unmet must-have truth, not a test gap -- three real paid attempts on the same idea all failed at the safety-classifier level before any generation began. 02-PROOF-RUN.md §8 records this as carried forward; a human needs to decide whether to approve a fresh attempt with a different idea or accept this as a documented Phase 2 limitation."
  - id: D5
    description: "SceneVideo renders four distinct states with no provider vocabulary (no prompt text, model id, or filesystem path) in any of them"
    verification:
      - kind: other
        ref: "src/components/scenes/SceneVideo.tsx -- waiting/generating/ready/failed states; only a data: URL and a pre-composed plain-language message ever render"
        status: pass
    human_judgment: false
  - id: D6
    description: "node src/scripts/check-boundaries.ts, npm run typecheck, and npm run build all exit 0"
    verification:
      - kind: integration
        ref: "all three commands run after both tasks -- exit 0, both boundary invariants OK, build compiles with no TypeScript errors"
        status: pass
    human_judgment: false

duration: ~55min
completed: 2026-09-12
status: complete
---

# Phase 2 Plan 4: Single-Scene Video Generation + Bangla/Banglish Proof Run Summary

**One approved scene image is now a real, playable 9:16 720p MP4 (real Veo call, ftyp-verified), and the Bangla/Banglish comparison ran for real (Banglish succeeded after one retry) -- but the full-scale (5-scene) Bangla-script proof run was blocked three consecutive times by a real, reproducible content-safety classification, leaving D-04's full-scale validation genuinely unmet and carried forward rather than forced.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-09-12T18:51:00Z (approx.)
- **Completed:** 2026-09-12T19:12:39Z (approx.)
- **Tasks:** 2
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments

- `generateSceneVideoAction` is a real, ceiling-gated, sole call site for `generateVideo` in the app. A real Veo call animated scene 1 of an already-approved image (from plan 02-03's run) into a 1.56MB, ftyp-verified, playable MP4.
- `SceneVideo.tsx` fills the open video slot in `SceneCard`, rendering four states with zero provider vocabulary ever reaching the DOM; `page.tsx`'s "Generate Videos" control is relabeled to make VIDEO-01's single-scene scope explicit, still gated behind every scene having an image (D-02).
- `story-probe.ts` gained a real video-only probe mode (`--story-id`/`--video`) and `--character=`/`--duration=`/`--motion-prompt=` overrides, plus full premise/theme/emotional_arc/ending printing for honest proof-run capture going forward.
- Run A (Banglish, fresh D-05-compliant idea, 3-scene, story only) produced a real, coherent, correctly-scripted story after one retry -- the title itself stayed in Banglish rendering, direct evidence the "answer in the input's own script" instruction held.
- Run B (the identical idea, Bangla script, full 5-scene scale) was blocked three consecutive times by Gemini's own safety classifier at the prompt-feedback stage -- a real, reproducible, and genuinely useful finding (the *opposite* direction from RESEARCH.md's hypothesized risk that Banglish might read worse), documented in full in `02-PROOF-RUN.md` rather than engineered around.

## Task Commits

1. **Task 1: Animate one approved scene image into a playable 9:16 720p clip** - `7738012` (feat)
2. **Task 2: Run the pipeline for real -- Bangla vs Banglish, then once at full 5-scene scale** - `a5f4c15` (feat)

**Plan metadata:** committed separately after this SUMMARY (see final commit).

## Files Created/Modified

- `src/app/actions/generate-video.ts` -- `generateSceneVideoAction`, ceiling-gated single-scene Veo dispatch, CR-03 second-layer motion-prompt guard, duration resolved to the nearest 4/6/8s
- `src/components/scenes/SceneVideo.tsx` -- four-state client component, video delivered as a `data:` URL
- `src/components/scenes/SceneCard.tsx` -- video slot filled with `SceneVideo`
- `src/app/page.tsx` -- real `handleGenerateVideo` wired to the (relabeled) bottom control; per-scene video state computed for the one animatable scene
- `src/scripts/story-probe.ts` -- `--video=`/`--story-id=`/`--duration=`/`--motion-prompt=`/`--character=` flags; premise/theme/emotional_arc/ending/per-scene purpose printing
- `.planning/phases/02-core-generation-pipeline/02-PROOF-RUN.md` -- full real evidence: both idea texts, Run A/B results, the complete per-call ledger, every block reason verbatim, carried-forward items
- `storage/_smoketest/spend-ledger.json` -- 7 new real entries this plan: `scene-video:...:1` ($0.40), `story:3-scene` x2 (Run A, $0.05 each), `story:5-scene` x3 (Run B, all blocked, $0.05 each); ledger now **$2.2520 of $3.00**

## Real Call Evidence (empirical input for Phase 5's budget system, and Phase 3/4's prompt design)

- **Task 1 video call:** scene 1 of `storage/stories/story-1789237907876-npep3b/` animated for real. `ok=true`, `bytes=1559179`, `seconds=8`, ftyp container confirmed. Cost **$0.40**, not the ~$0.20 planned -- see Deviations.
- **Run A (Banglish, 3-scene, story only):** blocked once (`candidate: PROHIBITED_CONTENT`), succeeded on retry (`finishReason: STOP`, title "Chotto Meye Ar Purono Churi", scenes 1-3, durations 6/4/8, `gemini-3.1-pro-preview`, no fallback). Cost **$0.10** (two attempts).
- **Run B (identical idea, Bangla script, 5-scene full scale):** blocked on **all three** real attempts, every one at the `promptFeedback` stage (`PROHIBITED_CONTENT`) -- before any generation began. Cost **$0.15** for zero usable output. No images or video were ever dispatched for this run (there was never a validated story to build them from). Full detail, both idea texts, and the block table are in `02-PROOF-RUN.md`.
- **Ledger total after this plan: $2.2520 of $3.00.** Remaining headroom: **$0.7480**. Plan spend ($0.6500) landed *under* the ~$0.94 planned total for the whole plan, because Run B's images ($0.335) and video ($0.30) were never spent.

## Decisions Made

- Video-only probe mode synthesizes a minimal `Scene` rather than reading persisted scene data (story.json persistence doesn't exist until Phase 3) -- `--duration=`/`--motion-prompt=` let the caller carry over real values from a prior run's own printed output.
- `generateSceneVideoAction` returns the finished clip as a `videoDataUrl`, matching `generate-images.ts`'s existing base64-transport pattern rather than adding a new file-serving route.
- Only the bottom "Generate Video" control triggers a paid dispatch; per-scene cards reflect state passively (plus a `Try Again` control on failure) rather than exposing a second, competing trigger.
- After three consecutive, identical, real blocks on Run B, execution stopped rather than trying a fourth variant -- this already exceeds the project's established single-retry convention (01-03/02-03 precedent, RESEARCH.md Pitfall 3, `smoke-test.ts`'s own childscene-probe code) and is reported as a genuine finding, not engineered around by swapping to an easier idea (the plan explicitly forbids that).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `story-probe.ts`'s hardcoded `characterDescription` would have contradicted a differently-themed proof-run idea**
- **Found during:** Task 2, before dispatching Run A
- **Issue:** The probe always passed the same hardcoded "shy village boy" character description to `runStoryDirector`, regardless of `--idea`. This plan's fresh D-05 idea is about a girl and her grandmother -- dispatching with the mismatched character description would have produced a confounded, less meaningful proof run.
- **Fix:** Added a `--character=` override flag, defaulting to the existing hardcoded description when absent (no behavior change for existing callers).
- **Files modified:** `src/scripts/story-probe.ts`
- **Verification:** `npm run typecheck` clean; Run A/B both used the correct girl/grandmother character description
- **Committed in:** `a5f4c15` (Task 2 commit)

### Non-Fixable / Reported Issues

**2. [Deviation] Task 1's video call cost $0.40, not the ~$0.20 planned**
- **Found during:** Task 1's real Veo call
- **Issue:** The video-only probe mode (`--story-id`/`--video`, invoked against a scene from a *prior* plan's already-completed run) has no persisted scene duration to resolve from, since story.json persistence doesn't exist until Phase 3. `clampDuration` correctly fell back to its 8-second default rather than fabricating a duration, but the plan's own budget line item assumed a 4-second clip.
- **Fix:** Not retroactively fixable without paying for a second clip (which the plan's "run each paid step once" discipline forbids). Documented here and in `02-PROOF-RUN.md` §8 instead.
- **Impact:** $0.20 real overspend against this one line item; the plan's *total* spend still landed under its overall ~$0.94 estimate (see Real Call Evidence above), and the ledger remains comfortably under the $3.00 ceiling.

**3. [Deviation] D-04's full-scale (5-scene) proof run is unmet**
- **Found during:** Task 2, Run B
- **Issue:** Three real, identical attempts at the chosen idea's Bangla-script rendering were blocked by Gemini's safety classifier at the prompt-feedback stage, before any generation began. This is a `must_haves.truths` item this plan explicitly commits to and did not achieve.
- **Fix:** Not attempted further this session -- three attempts already exceeds this project's established single-retry convention, and the plan explicitly forbids swapping the idea to force a pass. Full detail in `02-PROOF-RUN.md` §2/§8.
- **Impact:** Genuine gap. Carried forward to whoever plans Phase 3/4 next -- see Next Phase Readiness.

---

**Total deviations:** 1 auto-fixed (missing critical), 2 reported/carried-forward (real cost overrun on Task 1, unmet D-04 full-scale validation).
**Impact on plan:** Task 1 fully met its own acceptance criteria; Task 2's Bangla/Banglish comparison produced real, honest, partially-complete evidence; the full-scale pipeline validation genuinely did not close this session and is the reason this plan is marked `halted` rather than `complete`.

## Known Stubs

None -- no placeholder/empty-value UI stubs were introduced. (The full-scale run gap is a data/evidence gap, not a UI stub -- it is documented above and in `02-PROOF-RUN.md`, not silently rendered as fake success.)

## Issues Encountered

- **Run B's Bangla-script idea was blocked 3/3 times, all at the prompt-feedback stage.** See Deviations #3 and `02-PROOF-RUN.md` §2/§7/§8 for full detail, every verbatim block reason, and the real finding that this specific idea's Bangla-script rendering triggered the classifier far more reliably than its Banglish rendering (the opposite of RESEARCH.md's hypothesized risk direction) -- worth real attention in Phase 3/4's prompt design, not just a footnote.
- **Run A's premise/theme/ending text was not captured** because the probe's fuller-detail print statements were added *after* Run A completed (see `02-PROOF-RUN.md` §2). Every subsequent run in this session captured full detail.
- Carried over from 02-03-SUMMARY.md, still unresolved: `npm run lint` cannot run in this environment (`typescript-eslint@8.70.0` rejects TypeScript `7.0.2`); the full interactive three-screen-plus-video browser walk-through is still owed as human/coordinator-driven UAT.

## User Setup Required

None -- no new external service configuration required.

## Next Phase Readiness

- `generateSceneVideoAction` and `SceneVideo` are stable, real, ceiling-gated, and ready for Phase 4's VIDEO-02 (every scene, not just one) to build on.
- **D-04's full-scale (5-6 scene) real proof run did NOT close this session.** A human needs to decide: approve a fresh real attempt with a different idea (new real paid call, small — roughly $0.05 for the story call alone, more if it succeeds and images/video follow), or accept this as a documented Phase 2 limitation to revisit once Phase 3/4's real production runs happen anyway.
- **A real, reproducible Bangla-script-vs-Banglish safety-block asymmetry was discovered** for this specific idea (3/3 native-script blocks vs 1/2 Banglish blocks) -- flag this for whoever designs Phase 3/4's content-safety handling; do not assume Bangla script is always the "safer" choice for the classifier.
- Ledger at **$2.2520 of $3.00** -- **$0.7480** headroom remains for Phase 3/4's own real calls plus any follow-up attempt at D-04's full-scale validation.
- Two items carried from 02-03, still open: `npm run lint` unrunnable on this TypeScript version; the full interactive UI walk-through (now including the video screen) is still owed as human/coordinator-driven UAT.

## Self-Check: PASSED

- `src/app/actions/generate-video.ts` — FOUND
- `src/components/scenes/SceneVideo.tsx` — FOUND
- `src/components/scenes/SceneCard.tsx` — FOUND (modified)
- `src/app/page.tsx` — FOUND (modified)
- `src/scripts/story-probe.ts` — FOUND (modified)
- `.planning/phases/02-core-generation-pipeline/02-PROOF-RUN.md` — FOUND
- `storage/stories/story-1789237907876-npep3b/scenes/01/video.mp4` — FOUND (1559179 bytes, ftyp-verified)
- Commit `7738012` — FOUND in `git log --oneline --all`
- Commit `a5f4c15` — FOUND in `git log --oneline --all`

---

## Addendum (Quick Task 260913-4rr)

D-04's full-scale (5-scene) proof-run gap identified above was closed in quick task
`260913-4rr-complete-phase-2-s-d-04-full-scale-proof`, executed 2026-09-12/13. Following the
user-approved, budget-capped retry plan (story-only-first, continue only on success), a fresh
D-05-compliant idea (an old fisherman, Korim, returning a lost paper boat) was run at full scale:

- The Bangla-script story call **succeeded on the first attempt** (no retry needed) — `finishReason: STOP`, title "কাগজের নৌকা", 5 scenes (numbered 1-5, no gaps/duplicates), durations 6/4/8/4/6 (varied, §14 confirmed at full scale).
- All 5 scene images generated successfully (`IMAGES DONE: 5/5`); visual review confirmed the same elderly fisherman character (white hair/beard, cream collarless shirt with breast pocket, blue-grey lungi, barefoot) across every image — a positive SCENE-02 finding at full 5-scene scale.
- The Director-chosen 6-second scene (scene 1) was animated into a real, playable, ftyp-verified MP4 (`ok=true`, 2,360,549 bytes, 6 seconds) at `storage/stories/story-1789242051064-qntwcm/scenes/01/video.mp4`.
- D-04's `must_haves.truths` item is now genuinely met: a real 5-scene story, 5 real scene images, and 1 real playable video were produced end to end on a real paid run, with no fabricated numbers.

Full evidence (idea text, usageMetadata, ledger rows, character-consistency judgment, MP4 container check) is recorded in `.planning/phases/02-core-generation-pipeline/02-PROOF-RUN.md` §3 ("Full-scale run details (D-04) — obtained on retry, see finding below") and the updated ledger table in §6.

This run also sharpens the Bangla-script-vs-Banglish hypothesis carried forward above: this THIRD idea's Bangla-script rendering did not block at all (unlike Run B's 3/3 blocks on the grandmother's-bangle idea), suggesting Run B's specific wording — rather than Bangla script itself or full-scale prompt length — was the more likely trigger. See `02-PROOF-RUN.md` §3's "Interpretation" for detail.

**Ledger after this quick task: $2.9370 of $3.00 `DEV_CEILING_USD`. Remaining headroom: $0.0630.** This is very tight — any further Phase 2-4 development against this same dev ledger should budget with extreme care, since it is now nearly exhausted.

---
*Phase: 02-core-generation-pipeline*
*Completed: 2026-09-12*
