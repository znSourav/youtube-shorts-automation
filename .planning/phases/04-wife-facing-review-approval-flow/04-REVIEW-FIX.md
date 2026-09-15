---
phase: 04-wife-facing-review-approval-flow
fixed_at: 2026-09-15T18:01:00Z
review_path: .planning/phases/04-wife-facing-review-approval-flow/04-REVIEW.md
iteration: 3
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-09-15T18:01:00Z
**Source review:** .planning/phases/04-wife-facing-review-approval-flow/04-REVIEW.md
**Iteration:** 3

**Summary:**
- Findings in scope: 5 (CR-01, CR-02, WR-01, WR-02, IN-01)
- Fixed: 5
- Skipped: 0

Iterations 1 and 2's eleven findings were fixed and re-confirmed correct in separate, earlier commits
(see `git log` around `0d7e452` and before) -- this is a documentation-only overwrite of the fix
report for the third re-review pass. None of iteration 1/2's findings were touched again in this pass.

## Fixed Issues

### CR-01: video dispatch has no guard against an already-GENERATING scene

**Files modified:** `src/core/approval/gates.ts`, `src/core/approval/gates.test.ts`, `src/app/page.tsx`
**Commit:** f220a57
**Applied fix:** Per the orchestrator's narrower override of 04-REVIEW.md's own suggested fix (which
would have added a `videoStatus === "GENERATING"` refusal directly inside the shared
`evaluateVideoDispatch` gate -- rejected because `retrySceneVideoAction`'s legitimate stuck-recovery
path depends on that shared gate allowing a re-dispatch of a scene whose DB `videoStatus` is still
`GENERATING` after a dropped `after()` callback): added `s.videoStatus !== "GENERATING"` to
`evaluateBatchDispatch`'s eligibility filter in `gates.ts`, so a re-run "Generate All Videos" batch
never re-selects a scene already mid-flight. `evaluateVideoDispatch` itself and
`retry-scene-video.ts`/the stuck-retry UI path were left untouched, exactly as instructed. Added a
test in `gates.test.ts` asserting a `videoStatus: "GENERATING"` scene is excluded from
`evaluateBatchDispatch`'s returned `sceneNumbers` (mirroring the existing `"READY"`-exclusion test).
Corrected the now-inaccurate comment in `page.tsx`'s `applyLoadedStory` to also mention the
already-GENERATING skip and why it makes re-showing "Generate All Videos" safe even mid-batch.

### CR-02: false "reached its limit" dead-end shown for a scene still actively generating

**Files modified:** `src/app/page.tsx`
**Commit:** 7a749e5
**Applied fix:** Changed the polling effect's cap-priority check from
`if (row.capReached && videoState !== "ready")` to `if (row.capReached && videoState === "failed")`,
exactly as 04-REVIEW.md's own suggested fix specified. This restores the comment's already-stated
intent (cap takes priority over "failed" only) -- the broader `!== "ready"` condition was
accidentally also matching "generating", flipping an in-flight scene straight to the calm amber
"capped" dead-end message even though it was still actively generating and could still succeed. A
scene that later resolves to "failed" while at cap still correctly flips to "capped" on the next poll
tick.

### WR-01: SceneCard renders a dead, out-of-context video message on the Review Images screen

**Files modified:** `src/components/scenes/SceneCard.tsx`
**Commit:** 688377c
**Applied fix:** Confirmed via grep that `SceneCard` is called from exactly one place in the codebase
(`src/app/page.tsx`'s Review Images screen render), and that call site passes none of the video-slot
props. Removed the video slot entirely: deleted the `SceneVideo` import, removed
`videoState`/`videoSrc`/`videoMessage`/`onGenerateVideo`/`onRetryVideo`/`videoDisabled`/
`videoWaitingHint` from `SceneCardProps` and the function's destructured parameters/defaults, and
deleted the `<SceneVideo ... />` render block. The image slot, regenerate-image button, and
`imageCapMessage` were left untouched. `npx tsc --noEmit` confirmed no other file imports the removed
fields from `SceneCardProps`.

### WR-02: a budget-ceiling refusal renders identically to a transient failure

**Files modified:** `src/app/actions/get-story-status.ts`, `src/app/page.tsx`
**Commit:** 3004d22
**Applied fix:** Added an approximate, conservative headroom check to `get-story-status.ts`: for each
scene whose `videoStatus` is `"FAILED"` and not already `capReached`, calls `checkCeiling` (from
`../../lib/spend-ledger.ts`) with the worst-case per-scene cost (8 seconds at the "720p" price) inside
a try/catch, setting a new `budgetExceeded: boolean` field on that scene's row when it throws
`CeilingExceededError`. One deliberate adaptation from the orchestrator's literal instruction: rather
than importing `VIDEO_PRICE_PER_SECOND` from `../../providers/video/veo.ts` (which the review guidance
suggested), the 720p price was hardcoded locally as `8 * 0.05` with a comment cross-referencing
`veo.ts`'s price table -- importing the video provider directly from `get-story-status.ts` fails
`check-boundaries.ts`'s invariant 5 ("the video and image providers must each have a single paid
dispatch point"), which exists specifically to keep the approval gate and per-scene retry caps
unbypassable. Hardcoding preserves the intent (an approximate worst-case estimate, consistent with the
same figure used in `smoke-test.ts`) without opening a second import site into the video provider.
In `page.tsx`'s polling effect, when a scene's `budgetExceeded` is true and its computed `videoState`
is `"failed"`, the scene is switched to the existing `"capped"` rendering (message-only, no retry
button -- reusing the same mechanism the attempt-cap case already uses) with the message "The
generation budget has been reached for this project." instead of the generic failed message and
always-available "Try again". Verified with `npx tsc --noEmit` and the full test suite (boundary
check `invariant 5` passes).

### IN-01: get-story-status.ts logs a fresh console.error every poll tick for the same missing-file scene

**Files modified:** `src/app/actions/get-story-status.ts`
**Commit:** cd3e66d
**Applied fix:** Added a module-level `const loggedMissingVideo = new Set<string>();`, keyed by
`` `${storyId}:${sceneNumber}` ``. The existing `console.error` for a `READY` scene whose video file is
missing on disk now only fires the first time a given key is seen (check-then-add to the Set before
logging). Accepted as a long-lived-process, single-user local app where an ever-growing in-memory Set
cannot realistically accumulate enough distinct entries to matter.

## Skipped Issues

None -- every in-scope finding was fixed.

## Verification

All five fixes were verified individually and as a whole:
- `npx tsc --noEmit` -- clean, no errors, after each fix and at the end.
- `npm run test:lib` (211 pre-existing tests + 1 new test added for CR-01 = 212 tests, plus
  `check-boundaries.ts`'s six structural invariants) -- all 212 tests pass, all six invariants pass
  (including invariant 5, which the WR-02 fix was specifically adapted to keep passing).
- Verification ran in the main checkout directly (`workflow.use_worktrees` is `false` for this
  project, per `.planning/config.json` -- no isolated worktree was created for this run), so these
  results are reproducible from the tree as committed.

---

_Fixed: 2026-09-15T18:01:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 3_
