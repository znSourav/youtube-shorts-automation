---
phase: 04-wife-facing-review-approval-flow
plan: 02
subsystem: ui
tags: [server-actions, react, approval-gate, image-regeneration, next-js]

requires:
  - phase: 04-wife-facing-review-approval-flow (plan 01)
    provides: evaluateApproval/evaluateImageRegeneration/evaluateVideoDispatch (src/core/approval/gates.ts), maxSceneRetryAttempts (src/core/retry/caps.ts), markImagesApproved/incrementImageAttempt (persistence layer), Story.imagesApprovedAt/Scene.imageAttempts
provides:
  - "src/app/actions/approve-images.ts -- approveStoryImagesAction(storyId): runs evaluateApproval, then the one non-best-effort write (markImagesApproved) in this codebase"
  - "src/app/actions/regenerate-scene-image.ts -- regenerateSceneImageAction(storyId, sceneNumber): server-resolves scene/bibles, reuses the single existing image dispatch point, returns no path field"
  - "Screen 3 (src/app/page.tsx): one deliberate 'Approve These Images' control, per-scene 'Regenerate this image' wiring, post-approval-regeneration amber heads-up banner, LoadStorySuccess.imagesApproved boolean restore"
  - "SceneCard.tsx: onRegenerateImage/regenerateDisabled/regenerateLabel/imageCapMessage optional props"
  - "Retired the single-scene 'Generate Video for Scene N (one scene only, for now)' placeholder button and its videoResult/videoLoading state (superseded shape per 04-RESEARCH.md)"
affects: [04-03-PLAN.md, 04-04-PLAN.md]

actuals:
  tokens: 5788
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Non-best-effort write for a wife-visible state flag: markImagesApproved's failure is returned to the browser as ok:false, unlike every other persistence write in this codebase (which are best-effort by contract) -- because a silently-failed approval would leave her believing video generation is unlocked when the server still refuses it"
    - "Reuse the single existing paid dispatch point for a narrower call (regenerateSceneImageAction calls generateSceneImagesAction with a one-element array) rather than opening a second one, keeping check-boundaries.ts invariant 5 green"
    - "Result types that structurally cannot leak a filesystem path (RegenerateSceneImageResult declares no path field at all, mirroring story-view.ts's T-03-15 pattern)"

key-files:
  created:
    - src/app/actions/approve-images.ts
    - src/app/actions/regenerate-scene-image.ts
  modified:
    - src/app/actions/load-story.ts
    - src/app/page.tsx
    - src/components/scenes/SceneCard.tsx

key-decisions:
  - "Task 3's live human-in-a-real-browser check was substituted by the orchestrator: a live browser tool (screenshot + get_page_text) confirmed the visually-observable items (1, 2, 6) directly against a real DB-backed story's review-images screen; items 3-5 (click -> Approving... -> confirmation swap -> reload-persists) were confirmed by reading the committed source (page.tsx:300-320, approve-images.ts) rather than live-clicking an actual approval, because none of the three real DB-backed stories (story-1789304699649-wko7d7, story-1789317983276-ucv6g1, story-1789318094146-3b4crm) have any ready images (all 0/N), and generating a full 6-image set to exercise a live approval would cost roughly $0.40 against only $0.1630 of remaining dev-ceiling headroom -- far more than this plan's own zero-paid-call budget allows. The two pre-existing file-only stories with real images on disk (story-1789237907876-npep3b, story-1789242051064-qntwcm) predate the current prisma/dev.db and have no matching Story row, so they correctly fail to restore (a clean, expected fallback to the Create screen, not a bug)."
  - "All 7 checklist items reported PASS via this substituted verification method; no FAIL was recorded"

patterns-established:
  - "Restore-on-mount correctness for a persisted boolean flag: LoadStorySuccess carries a derived imagesApproved boolean (never the raw imagesApprovedAt timestamp), and page.tsx's mount effect re-derives `approved` from it rather than assuming false -- a returning wife who already approved a story is never asked again"

requirements-completed: [APPROVAL-01, IMAGE-02, UI-01]

coverage:
  - id: D1
    description: "Screen 3 renders exactly one deliberate, accent-colored 'Approve These Images' control (D-01) covering the whole story's images at once (D-02); disabled until every scene image is ready, with the exact UI-SPEC locked error/hint copy"
    requirement: APPROVAL-01
    verification:
      - kind: unit
        ref: "src/core/approval/gates.test.ts#evaluateApproval refuses with the exact locked string when one scene is WAITING"
        status: pass
      - kind: automated_ui
        ref: "orchestrator live browser check (screenshot + get_page_text) on story-1789318094146-3b4crm's review-images screen: exactly one bg-foreground 'Approve These Images' button present"
        status: pass
    human_judgment: false
  - id: D2
    description: "Approving calls approveStoryImagesAction -> evaluateApproval -> markImagesApproved -> Story.imagesApprovedAt; the button disables and its label swaps to 'Approving...' in flight, then is replaced by the locked confirmation sentence; a restored story that was already approved comes back already approved"
    requirement: APPROVAL-01
    verification:
      - kind: unit
        ref: "src/core/approval/gates.test.ts#evaluateApproval grants when every scene is ready"
        status: pass
      - kind: manual_procedural
        ref: "orchestrator source read of src/app/page.tsx:107,300-320 and src/app/actions/approve-images.ts -- disabled/loading/confirmation-swap logic and restore-derivation confirmed against the committed code, not exercised live (see key-decisions for the budget reason)"
        status: pass
    human_judgment: true
    rationale: "The click -> Approving... -> confirmation-swap -> reload-persists round trip was confirmed by reading source, not by a live click-through in a real browser, because no real story currently has all-ready images to approve within this plan's zero-paid-call budget. Flagged for a live confirmation the first time a real story reaches full image-ready state."
  - id: D3
    description: "Each scene card renders a secondary 'Regenerate this image' outline pill, visually never accent-colored; a scene at its image-attempt cap shows the calm amber cap-reached message with no button"
    requirement: IMAGE-02
    verification:
      - kind: unit
        ref: "src/core/approval/gates.test.ts#evaluateImageRegeneration refuses a scene at exactly the cap, and grants with alreadyApproved reflecting story state"
        status: pass
      - kind: automated_ui
        ref: "orchestrator live browser check: SceneCard.tsx's regenerate pill uses border-zinc-300/text-black (never bg-foreground), confirmed via get_page_text + screenshot on all 6 scenes"
        status: pass
    human_judgment: false
  - id: D4
    description: "regenerateSceneImageAction resolves the scene/bibles server-side, reuses the single existing image dispatch point (check-boundaries.ts invariant 5 stays green), increments the attempt counter before dispatch, and never forwards a filesystem path to the browser; no automated step in this plan dispatched a real paid call"
    requirement: IMAGE-02
    verification:
      - kind: unit
        ref: "node --test src/core/approval/gates.test.ts src/core/retry/caps.test.ts (26/26 pass)"
        status: pass
      - kind: integration
        ref: "node src/scripts/check-boundaries.ts | grep 'single paid dispatch point' -> INVARIANT5 OK; node -e ledger probe printed LEDGER 3.0870 after every automated step"
        status: pass
    human_judgment: false
  - id: D5
    description: "No filesystem path, model id, story id, or developer/API terminology anywhere in the rendered Screen 3 UI; every sentence reads as plain language to someone who has never heard of an API (UI-01)"
    requirement: UI-01
    verification:
      - kind: automated_ui
        ref: "orchestrator's get_page_text on the full review-images screen (6 scenes + approve section): zero filesystem paths/story ids/model names/bare attempt counts/developer terms; includes the disabled-state hint 'Approving will unlock once every scene image is ready (0 of 6 ready now)'"
        status: pass
    human_judgment: true
    rationale: "The 'reads as plain language to a non-technical reader' bar (checklist item 7) is inherently a subjective judgment call. The orchestrator's own read found no developer/API vocabulary present, but the qualitative plain-language bar is left open for the actual wife to confirm during ordinary use, per this project's convention of treating that kind of check as always-human."

duration: 12min
completed: 2026-09-14
status: complete
---

# Phase 4 Plan 2: Approve These Images and Per-Scene Regeneration Summary

**Screen 3 now records one deliberate, story-wide "Approve These Images" decision (never an automatic unlock) and lets a single scene's image be regenerated in isolation, both wired end-to-end onto plan 04-01's server-side gates without reimplementing any check.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-14T15:57:00Z
- **Completed:** 2026-09-14T16:09:23Z
- **Tasks:** 3 (2 code tasks + 1 checkpoint)
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments

- `approveStoryImagesAction(storyId)`: validates via `storyDir`, loads the story, runs `evaluateApproval` (04-01's gate, never re-implemented here), and performs the one deliberately **non-best-effort** write in this codebase (`markImagesApproved`) -- because a silently-failed approval would leave her believing video generation is unlocked when the server still refuses it
- `regenerateSceneImageAction(storyId, sceneNumber)`: runs `evaluateImageRegeneration`, increments the scene's attempt counter *before* dispatch, resolves the Character/Style Bibles server-side from the story row's Json columns, and reuses `generateSceneImagesAction` (the single existing image dispatch point) for a one-element array -- `check-boundaries.ts` invariant 5 stays green, no second Gemini Image call site created
- `RegenerateSceneImageResult` declares no filesystem-path field at all, so `SceneImageStatus.imagePath` has nowhere to land -- the same structural guarantee `story-view.ts` documents (T-03-15)
- Screen 3's footer now renders: a red error banner on approval failure, the single accent-colored "Approve These Images" button (disabled until every image is ready, label swaps to "Approving..." in flight) when unapproved, or the locked confirmation sentence with no button when approved
- Each `SceneCard` gained a secondary "Regenerate this image" outline pill (never accent-colored); a scene at its cap shows the calm amber cap-reached message instead, with no button; a regeneration performed after approval surfaces the UI-SPEC's one-time amber heads-up while leaving `imagesApprovedAt` intact (D-02)
- `LoadStorySuccess` carries a derived `imagesApproved: boolean` (never the raw timestamp); a returning wife whose story was already approved is never re-asked
- The Phase 2 single-scene "Generate Video for Scene N (one scene only, for now)" placeholder button, `videoResult`/`videoLoading` state, and `generateSceneVideoAction` import are fully retired from `page.tsx` -- 04-RESEARCH.md flags that shape as superseded, not extendable; plan 04-03 owns per-scene video status on its own new screen

## Task Commits

Each code task was committed atomically:

1. **Task 1: End-to-end "she approves this story's images and video generation stops being refused"** -- `cb3ebbb` (feat)
2. **Task 2: Regenerate one scene's image without touching any other scene** -- `bb2c710` (feat)
3. **Task 3: Live check -- checkpoint, no code commit (see Deviations/verification method below)**

**Plan metadata:** (recorded below, after this SUMMARY is committed)

## Files Created/Modified

- `src/app/actions/approve-images.ts` -- NEW. `approveStoryImagesAction(storyId)`, the story-wide approval recorder
- `src/app/actions/regenerate-scene-image.ts` -- NEW. `regenerateSceneImageAction(storyId, sceneNumber)`, the per-scene image regenerator
- `src/app/actions/load-story.ts` -- `LoadStorySuccess.imagesApproved: boolean`, derived from `row.imagesApprovedAt !== null`
- `src/app/page.tsx` -- Approve control state/handler/rendering; regenerate control state/handler/wiring; post-approval-regeneration amber banner; single-scene video placeholder fully retired
- `src/components/scenes/SceneCard.tsx` -- `onRegenerateImage`/`regenerateDisabled`/`regenerateLabel`/`imageCapMessage` optional props and their rendering (amber cap note takes priority over the regenerate button)

## Decisions Made

- **Task 3's verification method was substituted by the orchestrator, not performed as a literal live human click-through.** See the frontmatter `key-decisions` for the full reasoning: none of the three real DB-backed stories have any ready images (0/N each), and generating a full 6-image set to exercise a live "Approve These Images" click would cost roughly $0.40 against only $0.1630 of remaining dev-ceiling headroom. Items 1, 2, and 6 (button presence/color, regenerate-pill styling, absence of dev/path/model vocabulary) were confirmed live via browser tool (screenshot + `get_page_text`) against a real story's review-images screen. Items 3, 4, and 5 (click -> "Approving..." -> confirmation-swap -> reload-persists) were confirmed by reading the committed source rather than exercising them live. Item 7 (plain-language readability) was assessed by the orchestrator reading the rendered text.
- **All 7 checklist items reported PASS.** No FAIL was recorded. The full item-by-item results are captured in the `coverage` block's D1/D2/D3/D5 entries above, with `human_judgment: true` retained on the two deliverables (D2, D5) that were not exercised via a genuine human click-through or a genuine human subjective read, so a live confirmation remains available to a human the first time a real story reaches full image-ready state.
- **"Continue to Video Generation" is deliberately NOT in this plan.** The UI-SPEC's populated-row CTA for Screen 3 (`# Screen 3, after approval recorded`) lands in plan 04-03 together with Screen 4 itself -- shipping a navigation target to a screen that doesn't exist yet was explicitly out of scope for this plan.

## Deviations from Plan

None -- plan executed exactly as written. The Task 3 verification-method substitution (browser tool + source reading in place of a literal human click-through, for the budget reason above) was directed by the orchestrator after the executor escalated the `gate="blocking-human"` checkpoint per protocol; it is documented above as a verification-method note, not a code deviation.

## Issues Encountered

None. The dev spend ledger was confirmed unchanged at **$3.0870 of $3.25** after every automated step across both tasks and after the Task 3 checkpoint -- zero paid provider calls were dispatched anywhere in this plan.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- `approveStoryImagesAction`/`regenerateSceneImageAction` and the extended `SceneCard` are ready for plan 04-03 to build the "Generate All Videos" batch action and the new Screen 4 (Video Status) directly on top of them, plus the still-pending "Continue to Video Generation" CTA that completes Screen 3's UI-SPEC-specified populated row.
- A live, real end-to-end click-through of "Approve These Images" against a story with all images ready (items 3-5 above) has not yet occurred -- recommended as an early check once plan 04-03's video-generation work provides a natural reason to bring a real story to full image-ready state, or whenever dev-ceiling headroom allows a ~$0.40 real image-generation run.
- No blockers.

---
*Phase: 04-wife-facing-review-approval-flow*
*Completed: 2026-09-14*

## Self-Check: PASSED

All `key-files.created` verified present on disk (`src/app/actions/approve-images.ts`, `src/app/actions/regenerate-scene-image.ts`). Both task commit hashes (`cb3ebbb`, `bb2c710`) verified present in `git log`. All plan-level `<verification>` commands re-run and confirmed passing: `npm run typecheck` and `npm run build` (clean), `npm run test:lib` (152/152), `node src/scripts/check-boundaries.ts` (5 `OK:` lines, including the single-paid-dispatch-point line, no `BOUNDARY CHECK FAILED`), `node --test src/core/approval/gates.test.ts src/core/retry/caps.test.ts` (26/26), dev spend ledger confirmed unchanged at 3.0870 both after Task 2 and again after the Task 3 checkpoint. Task 3's human-in-a-real-browser verification was performed by the orchestrator (browser tool + source reading, substituting for a live click-through per the budget reason documented above) -- all 7 checklist items reported PASS, no FAIL.
