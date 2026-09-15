---
phase: 04-wife-facing-review-approval-flow
fixed_at: 2026-09-15T00:00:00Z
review_path: .planning/phases/04-wife-facing-review-approval-flow/04-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-09-15T00:00:00Z
**Source review:** .planning/phases/04-wife-facing-review-approval-flow/04-REVIEW.md
**Iteration:** 1

**Note on scope:** `fix_scope: critical_warning` — only Critical (CR-*) and Warning (WR-*) findings
were in scope for this run. IN-01 and IN-02 (Info-severity) were left untouched and remain open for a
future `--fix all` pass or manual follow-up.

**Environment note:** `workflow.use_worktrees` is `false` in `.planning/config.json`, so all fixes
were made and committed directly in the main checkout (`master`) — no isolated worktree was created,
per the documented opt-out.

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### CR-01: Video-status polling stops forever once the batch settles, breaking single-scene retry (VIDEO-04)

**Files modified:** `src/app/page.tsx`
**Commit:** `781f291`
**Applied fix:** Changed the polling effect's stop condition from "every scene is currently terminal"
(`READY` or `FAILED`) to "nothing left she could ever retry" (every scene `READY`, or `FAILED` **and**
at its retry cap via `row.capReached`). A scene that is still `GENERATING`, or `FAILED`-but-not-capped
(the exact VIDEO-04 "Try again" case), now keeps the poll alive so a single-scene retry dispatched
after the rest of the batch has settled is never orphaned without an active poll to observe its
outcome. Per orchestrator guidance, only this minimal fix (approach 1 from REVIEW.md's Fix section)
was applied — the alternative of also restructuring `handleRetryScene` to force an immediate re-poll
was intentionally not applied, as it is unnecessary once the stop condition itself is correct.
Verified with `npx tsc --noEmit` (no errors in `page.tsx`).

### WR-01: `capMessage` is set for any refusal once the story exists, not only for a reached retry cap

**Files modified:** `src/core/approval/gates.ts`, `src/app/actions/regenerate-scene-image.ts`
**Commit:** `06ead28`
**Applied fix:** Gave `evaluateImageRegeneration`'s refusal branch an explicit
`reason: "not-found" | "cap"` discriminant (new `ImageRegenerationRefusal` type) instead of leaving
callers to infer the reason from `story`'s truthiness. `regenerateSceneImageAction` now sets
`capMessage` only when `decision.reason === "cap"`, so a scene-not-found refusal can no longer be
mislabeled as a cap-reached refusal. Verified with `npx tsc --noEmit` (no errors) and
`node --test src/core/approval/gates.test.ts` (all 25 existing tests pass unchanged, since none
asserted on the removed `story !== null` behavior).

### WR-02: A scene's retry-attempt counter is consumed even when no paid Veo call was ever dispatched

**Files modified:** `src/app/actions/generate-video.ts`
**Commit:** `171ce0e`
**Applied fix:** Moved `incrementVideoAttempt` from before the scene's source image is read from disk
to immediately before the `generateVideo(...)` call (the real money-consuming dispatch boundary). A
purely local failure (locked file, moved/renamed scenes folder, disk hiccup) that prevents the image
from ever being read no longer silently consumes one of the scene's limited `MAX_SCENE_RETRY_ATTEMPTS`
attempts. Verified with `npx tsc --noEmit` (no errors); no dedicated unit test file exists for this
Server Action (it is a thin orchestration wrapper around already-tested pure functions), so
verification relied on Tier 1 (re-read) + Tier 2 (type-check) only.

### WR-03: Unbounded overlapping poll() calls in the video-status effect can apply a stale status after a fresher one

**Files modified:** `src/app/page.tsx`
**Commit:** `3a13538`
**Applied fix:** Introduced a `pollInFlight` boolean scoped to the polling effect's closure (mirroring
the existing `cancelled` pattern already used in this same effect, rather than introducing a new
`useRef`), with `poll()` now a thin guard wrapper around the original body (renamed `pollOnce()`). A
new `poll()` cycle now no-ops if a previous cycle is still awaiting `getStoryStatusAction` or
`loadStoryAction`, preventing a slower, older cycle's status snapshot from overwriting a faster,
newer one's already-applied `videoState`/`videoMessage`. Verified with `npx tsc --noEmit` (no errors)
and a full re-read of the modified effect confirming the closing braces, `intervalId` cleanup, and
`useEffect` dependency array are all intact.

## Skipped Issues

None — all four in-scope findings were fixed.

---

_Fixed: 2026-09-15T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
