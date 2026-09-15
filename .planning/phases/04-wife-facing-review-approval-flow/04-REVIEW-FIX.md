---
phase: 04-wife-facing-review-approval-flow
fixed_at: 2026-09-16T00:00:00Z
review_path: .planning/phases/04-wife-facing-review-approval-flow/04-REVIEW.md
iteration: 5
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-09-16T00:00:00Z
**Source review:** .planning/phases/04-wife-facing-review-approval-flow/04-REVIEW.md
**Iteration:** 5 (final)

**Summary:**
- Findings in scope: 2 (CR-01, WR-01)
- Fixed: 2
- Skipped: 0

Iterations 1-4's seventeen findings were fixed and re-confirmed correct in separate, earlier commits.
This pass's fixes were applied directly by the orchestrator (not a dispatched fixer agent), matching
the fourth pass's approach given the design nuance involved.

## Fixed Issues

### CR-01: `recordSpend` in `dispatchSceneVideo` had no try/catch, unlike every other write in the function

**Files modified:** `src/app/actions/generate-video.ts`
**Commit:** `c076f81`

**Applied fix:** Wrapped the `recordSpend(...)` call in a try/catch. `spend-ledger.ts`'s own
`withLedgerFileLock` can genuinely throw (a lock-acquisition timeout, or a non-`EEXIST` filesystem
error) — its own comment documents both as real possibilities ("another process may be mid-write, or
a stale lock file was left behind by a crash"). Before this fix, an uncaught throw here would have
propagated out of `dispatchSceneVideo` entirely: the scene's status would never advance past
`GENERATING`, the just-completed (and already-billed) Veo call's cost would never be recorded, and —
because `evaluateVideoDispatch` deliberately allows re-dispatching a `GENERATING` scene (to preserve
the legitimate stuck-scene retry path established across the third and fourth passes) — her own "Try
again" affordance could dispatch a second real, billed Veo call for the same scene with the first
one's cost silently missing from the ledger entirely.

The fix deliberately does **not** treat a `recordSpend` failure as a generation failure: the Veo call
already succeeded and already cost real money by that point regardless of whether the bookkeeping
write lands, so the scene still advances to `READY` exactly as it would have — discarding an
already-generated, already-paid-for video over a ledger-file hiccup would be strictly worse. The
failure is instead logged loudly via `console.error` (never swallowed silently), giving an operator
the one signal that the ledger and real spend may have drifted apart.

**Known, tracked, out-of-scope sibling gap:** the identical unprotected-`recordSpend` pattern exists in
`src/app/actions/generate-images.ts` (line ~161) and likely `src/core/story/director.ts` — both Phase
1/2 files, outside this phase's own file scope (Phase 4's `files_modified` list never touched either).
Rather than silently leave this undiscussed or scope-creep into fixing unrelated phases' files, this is
recorded as a known limitation for Phase 6 (Reliability, Secrets Hygiene & Output Correctness, per
ROADMAP.md) to address, matching this project's established convention of explicitly documenting a
deferred gap rather than either silently fixing it out-of-scope or silently ignoring it.

### WR-01: The story-scoped in-flight guard (fourth pass) had no protection between reservation and scheduling

**Files modified:** `src/app/actions/generate-all-videos.ts`
**Commit:** `c076f81`

**Applied fix:** Wrapped the region between `storiesWithRunningBatch.add(storyId)` and the point where
`after()` is successfully scheduled (or an early refusal is returned) in a try/catch that releases the
guard and rethrows on any exception. Not currently exploitable — `evaluateBatchDispatch` and
`maxSceneRetryAttempts` cannot throw today — but this is defense-in-depth against a future change to
either making it throw, which would otherwise permanently strand that story's guard (blocking every
future legitimate "Generate All Videos" attempt for it) until the server process itself restarts.

## Skipped Issues

None — both in-scope findings were fixed.

## Verification

- `npx tsc --noEmit`: clean.
- `npm run test:lib`: 214/214 pass (unchanged from the fourth pass — neither fix altered any pure-function
  behavior a unit test would exercise; both are error-handling/defense-in-depth changes around existing
  I/O calls), all six `check-boundaries.ts` structural invariants pass.
- `npm run build`: compiles, static routes generate.
- Dev spend ledger re-confirmed unchanged at exactly `$3.0870` of `$3.25`.
- A fifth-and-final re-review pass was commissioned after these two fixes; see the phase's own closeout
  summary for its result.

---
*Fixed: 2026-09-16*
*Fixer: Claude (orchestrator, direct implementation)*
*Iteration: 5 (final)*
