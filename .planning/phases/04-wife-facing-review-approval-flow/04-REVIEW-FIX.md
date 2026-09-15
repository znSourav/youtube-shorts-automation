---
phase: 04-wife-facing-review-approval-flow
fixed_at: 2026-09-15T00:00:00Z
review_path: .planning/phases/04-wife-facing-review-approval-flow/04-REVIEW.md
iteration: 2
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-09-15T00:00:00Z
**Source review:** .planning/phases/04-wife-facing-review-approval-flow/04-REVIEW.md
**Iteration:** 2

**Note on scope:** This is the second fix pass over `04-REVIEW.md`, which was overwritten by a
re-review after iteration 1. Iteration 1's four findings (CR-01, WR-01, WR-02, WR-03 — different
issues from this iteration's CR-01, both under the same ID because the re-review renumbered) were
separately fixed and verified in commits `781f291`, `06ead28`, `171ce0e`, `3a13538` (see iteration 1's
report, preserved in git history at commit `160ae22`). The re-review's own "Verification of
previously-fixed issues" section independently re-confirmed all four as correct and complete before
surfacing the seven findings fixed in this iteration.

`fix_scope: critical_warning` — only Critical (CR-*) and Warning (WR-*) findings were in scope.
IN-01 and IN-02 (Info-severity) were left untouched, per instruction, and remain open for a future
`--fix all` pass or manual follow-up.

**Environment note:** `workflow.use_worktrees` is `false` in `.planning/config.json`, so all fixes
were made and committed directly in the main checkout (`master`) — no isolated worktree was created,
per the documented opt-out. All verification (tsc, `node --test`) ran in the main checkout; these
results are reproducible directly from this tree.

**Summary:**
- Findings in scope: 7
- Fixed: 7
- Skipped: 0

## Fixed Issues

### CR-01: A failed image regeneration is silently swallowed by the browser

**Files modified:** `src/app/page.tsx`
**Commit:** `8358c4e`
**Applied fix:** Applied the fix exactly as written in REVIEW.md's CR-01 section.
`handleRegenerateImage` now updates `sceneStatuses` on every outcome of `regenerateSceneImageAction`
(`ok`, `imageDataUrl`, `message`), not only the cap-refusal and success cases — a genuine mid-flight
failure (`result.ok === false`, `result.capMessage === null`) is now reflected in the UI instead of
leaving the wife looking at a stale "ready" state while the database has already recorded
`imageStatus = FAILED`. Verified with `npx tsc --noEmit` (no errors in `page.tsx`).

### CR-02 (narrow fix only): `computeLibraryStatus` now surfaces a post-approval image failure

**Files modified:** `src/core/persistence/story-view.ts`, `src/core/persistence/story-view.test.ts`
**Commit:** `eb85dc7`
**Applied fix:** Per orchestrator instruction, applied ONLY the narrow fix — no new UI control or
navigation back to the review-images screen was added; that remains a documented, tracked
limitation, not resolved by this pass. Added a new branch to `computeLibraryStatus`, inserted
immediately before the existing `imagesApprovedAt !== null -> "Generating Videos"` branch: an
approved story (`imagesApprovedAt !== null`) with at least one scene whose `imageStatus !== "READY"`
now returns `"Needs Attention"` instead of the indistinguishable `"Generating Videos"`. This is safe
because `evaluateApproval` (`gates.ts`) already refuses approval unless every scene's `imageStatus`
is `READY`, so the new branch's `hasUnreadyImage` check can only be true after a post-approval image
regeneration (explicitly allowed by D-02) has since failed and degraded an already-approved story.
Updated the function's numbered doc-comment precedence list to insert this as the new case 4 (renumbering
the two branches below it). Added the required test — `imagesApprovedAt` set, one scene with
`imageStatus: "FAILED"` and `videoStatus: "WAITING"` (not `GENERATING`, not a capped video `FAILED`,
so it exercises this new branch specifically and not the pre-existing `hasCappedFailure`/
`hasGenerating` branch above it) — asserting `"Needs Attention"`. Verified with `npx tsc --noEmit`
(no errors) and `node --test src/core/persistence/story-view.test.ts` (all 16 tests pass, including
the 8 pre-existing `computeLibraryStatus` tests, confirming the new branch does not change any
existing precedence outcome).

### CR-03: Budget-ceiling race between the video batch and a single-scene retry

**Files modified:** `src/app/actions/generate-video.ts`
**Commit:** `ad93745`
**Applied fix:** Applied exactly the structural fix specified by the orchestrator (no new npm
dependency, no database-backed lock — an in-process promise-chain mutex, correct for this
single-Node-process app). Renamed the original `generateSceneVideoAction` function body to a new,
non-exported `dispatchSceneVideo` with an identical signature and body. Added a module-level
`videoDispatchChain: Promise<unknown>` mutex. Reintroduced `generateSceneVideoAction` as a thin
exported wrapper (same name/signature) that chains every call through `videoDispatchChain`,
guaranteeing at most one dispatch is ever mid-flight app-wide — not just within one
`runBatchVideoDispatch` call, as the previous implementation only achieved. This closes the race
where an independently-dispatched `retrySceneVideoAction` call had no coordination with an in-flight
"Generate All Videos" batch: both could pass `checkCeiling` before either had called `recordSpend`
(a Veo call takes minutes; `recordSpend` only runs after it resolves), risking combined spend past
`DEV_CEILING_USD`/`MONTHLY_BUDGET_USD` — exactly the "no bypass via retry" scenario CLAUDE.md's hard
budget constraint forbids. Zero caller-visible change: `generate-all-videos.ts`, `retry-scene-video.ts`,
and `story-probe.ts` all call the unchanged exported name/signature and required no edits. No
dedicated unit test file exists for `generate-video.ts` (thin Server Action wrapper, per WR-02's
iteration-1 fix report); verified with `npx tsc --noEmit` (no errors anywhere in the project) and by
reading the final file to confirm both functions are correctly wired — the export calls
`dispatchSceneVideo`, `dispatchSceneVideo` is not separately exported, and `check-boundaries.ts`'s
structural invariant ("the image and video providers each have a single paid dispatch point") still
passes.

### WR-04: Retry/regenerate re-entrancy guards can be defeated by a fast double click

**Files modified:** `src/components/scenes/SceneVideo.tsx`, `src/components/story/VideoStatusScreen.tsx`,
`src/app/page.tsx`
**Commit:** `eb0aa92`
**Applied fix:** `SceneVideo`'s existing `disabled` prop (already wired to the waiting-state
"Generate video" button) is now also passed to the "Try again" button in both the `failed` branch and
the `generating`+`stuck` branch. `VideoStatusScreenProps` gained a new `retryDisabled?: boolean` prop
(rather than overloading the existing `disabled` prop's name across a different component boundary),
threaded straight through to every scene row's `SceneVideo`. `page.tsx` wires
`retryDisabled={retryingScene !== null}` — the same state `handleRetryScene`'s existing re-entrancy
guard already reads — so a fast double click can no longer read a stale, not-yet-re-rendered guard
value and dispatch two `retrySceneVideoAction` calls for the same (or a different) scene while one
retry is already in flight. Combined with CR-03's app-wide mutex, this closes both the UI-level and
the process-level halves of this re-entrancy gap. Verified with `npx tsc --noEmit` (no errors); no
dedicated component test files exist for `SceneVideo.tsx` or `VideoStatusScreen.tsx`.

### WR-05: `getStoryStatusAction` trusts the raw DB video status without checking the file still exists

**Files modified:** `src/app/actions/get-story-status.ts`
**Commit:** `e0ad8bc`
**Applied fix:** Mirrored `load-story.ts`'s existing file-existence downgrade pattern, but used
`existsSync` (a cheap metadata stat) instead of `readFileSync`, per orchestrator instruction — this
action is polled every `POLL_INTERVAL_MS` (3s) and its own file header documents it as a cheap SELECT
with no file reads; reading full video bytes on every poll tick would have been a real performance
regression. A scene reporting `videoStatus === "READY"` whose recorded `videoPath` is missing or does
not exist on disk is now downgraded to `"FAILED"` before being returned, with a `console.error` log
line (matching this file's existing error-logging convention). `capReached` is computed independently
from `videoAttempts` vs. `maxAttempts` and is unaffected by this status change, so no separate
recomputation was needed. Verified with `npx tsc --noEmit` (no errors); no dedicated unit test file
exists for this Server Action.

### WR-06: Image-regeneration attempt counter is still consumed on a purely local, pre-dispatch failure

**Files modified:** `src/app/actions/regenerate-scene-image.ts`
**Commit:** `e5b606f`
**Applied fix:** Applied the same fix pattern WR-02 (iteration 1) already applied to
`generate-video.ts`. Moved `incrementImageAttempt` from before this file's local pre-dispatch work
(constructing `thatOneScene`, reading `characterBible`/`styleBible` off the story row) to immediately
before the actual call into `generateSceneImagesAction` — the real per-scene provider dispatch
boundary from this file's perspective, exactly mirroring `generate-video.ts`'s now-corrected
placement immediately before its `generateVideo(...)` call. Verified with `npx tsc --noEmit` (no
errors); no dedicated unit test file exists for this Server Action.

### WR-07: Silent, unlogged catch branch in the ceiling check

**Files modified:** `src/app/actions/generate-video.ts`
**Commit:** `c87fbbf`
**Applied fix:** Applied exactly the fix already written in REVIEW.md's WR-07 section, adapted to
land inside `dispatchSceneVideo` (the function CR-03 renamed the original `checkCeiling` catch block
into) rather than inside the new thin `generateSceneVideoAction` wrapper, per orchestrator
instruction — CR-03 only wraps the exported function; this file's internal `checkCeiling` catch logic
is otherwise untouched by CR-03's restructuring. Added a `console.error` call for any `checkCeiling`
failure that is not a `CeilingExceededError`, matching every other failure branch in this file. A
corrupted ledger file or other unexpected budget-check error is no longer invisible in the server
console. Committed as a separate atomic commit on top of CR-03's rename (isolated by temporarily
reverting this hunk, committing CR-03 alone, then reapplying and committing WR-07), so each finding's
diff is independently reviewable and revertible. Verified with `npx tsc --noEmit` (no errors).

## Skipped Issues

None — all seven in-scope findings were fixed.

## Verification Summary

- `npx tsc --noEmit -p tsconfig.json`: zero errors across the whole project, checked after every
  individual fix and again after the full set of changes. Ran in the main checkout (no worktree was
  created; `workflow.use_worktrees: false`), so these results are directly reproducible from this
  tree.
- `npm run test:lib` (full suite, 211 tests across every `*.test.ts` file plus
  `check-boundaries.ts`'s structural invariants): all 211 pass, including the new
  `story-view.test.ts` CR-02 test and every pre-existing `computeLibraryStatus`/`batch`/`gates` test
  — confirming none of this iteration's fixes changed any existing behavior unexpectedly.
  `check-boundaries.ts`'s "the image and video providers each have a single paid dispatch point"
  invariant still passes after CR-03's rename, confirming `dispatchSceneVideo` was not accidentally
  exported as a second dispatch point.
- Logic-classification note: CR-03 (the budget-ceiling mutex) is a concurrency fix, not a pure logic
  branch — its correctness rests on JavaScript's single-threaded event-loop promise-chaining
  semantics, which `tsc`/unit tests cannot directly exercise (no test harness in this codebase
  simulates two genuinely concurrent Server Action invocations). The fix was verified by structural
  code reading (confirming the wrapper always chains through `videoDispatchChain` before calling
  `dispatchSceneVideo`, and that `videoDispatchChain` is reassigned before `run` is returned) rather
  than a concurrency test. **This finding should be treated as `fixed: requires human verification`**
  rather than a fully test-verified fix — a manual check (e.g. dispatching a batch and a retry
  together against a low `DEV_CEILING_USD` and confirming only one call proceeds at a time) is
  recommended before relying on this for real spend protection.

---

_Fixed: 2026-09-15T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
