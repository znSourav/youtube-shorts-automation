---
phase: 04-wife-facing-review-approval-flow
fixed_at: 2026-09-16T00:00:00Z
review_path: .planning/phases/04-wife-facing-review-approval-flow/04-REVIEW.md
iteration: 4
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-09-16T00:00:00Z
**Source review:** .planning/phases/04-wife-facing-review-approval-flow/04-REVIEW.md
**Iteration:** 4

**Summary:**
- Findings in scope: 1 (CR-01, the only finding this pass reported)
- Fixed: 1
- Skipped: 0

Iterations 1-3's sixteen findings were fixed and re-confirmed correct in separate, earlier commits
(see `git log` around `2653733` and before). This pass's fix was applied directly by the orchestrator
rather than a dispatched fixer agent, given the design nuance involved (avoiding a regression of the
already-fixed stuck-scene retry path, and recognizing a second, narrower race the review's own
"minimal fix" would have left open).

## Fixed Issue

### CR-01: Two overlapping "Generate All Videos" batches can double-dispatch (and double-spend) the same not-yet-reached scenes

**Files modified:** `src/core/approval/gates.ts`, `src/core/approval/gates.test.ts`, `src/app/actions/generate-all-videos.ts`
**Commit:** `d79aeb5`

**Applied fix:** Two changes, going beyond 04-REVIEW.md's own "minimal" suggested fix to its explicitly-offered "fully airtight" alternative, because the residual gap the minimal fix alone would leave (two overlapping batches both reaching a scene that is genuinely `WAITING` in both snapshots) is plausible in practice, not a rare instant-tie, given each Veo call can legitimately take several minutes:

1. **`evaluateVideoDispatch` (gates.ts) now refuses a scene whose `videoStatus` is already `"READY"`** — added exactly where 04-REVIEW.md's own suggested fix placed it (after the cap check, before the imageStatus check), with its message. This closes the "already-succeeded scene gets re-billed" case at the single shared gate every caller (batch and single-scene retry) passes through. Deliberately does **not** refuse `"GENERATING"` — the third pass's own CR-01 fix already established that the shared gate must keep allowing a `GENERATING` scene through, since `retrySceneVideoAction`'s legitimate stuck-scene recovery (a dropped `after()` callback per 04-RESEARCH.md Pitfall 2) depends on re-dispatching a scene whose DB status is still `GENERATING`. Two tests added to `gates.test.ts`: one confirming the new `READY` refusal, one confirming `GENERATING` is still granted (so a future change can't silently regress the stuck-retry path without a test noticing).

2. **`generateAllVideosAction` (generate-all-videos.ts) gains a story-scoped in-flight guard**, `storiesWithRunningBatch: Set<string>`, closing the review's own identified root cause directly rather than only mitigating its worst sub-case: a second call for a story whose background batch loop is still genuinely alive is now refused outright, before it ever computes a competing eligibility snapshot or schedules a competing `after()` loop. Key design points:
   - The guard is checked and reserved **synchronously, with no `await` in between** — the orchestrator caught, while implementing this, that placing the reservation *after* the `await findStoryWithScenes(...)` call (as first drafted) would have recreated a narrower version of the exact TOCTOU race CR-03 already closed for individual dispatches, just one level up: two near-simultaneous calls (e.g. a fast double-click) could both pass the `has()` check before either reserves. Reserving immediately, before any `await`, closes this too.
   - The guard is released on **every** path that does not end in a scheduled `after()` (an unapproved story, an empty eligible-scene list) — without this, a refused or empty batch attempt would permanently strand that story as "running" with nothing ever left to release it, silently locking out every future legitimate attempt until the process itself restarts.
   - The guard is cleared in a `finally` inside the `after()` callback on the success path, exactly mirroring the existing pattern.
   - This in-memory guard is wiped by a dev-server recompile, exactly like `videoDispatchChain` (CR-03) already is — this is intentional and consistent: the existing stranded-batch recovery path (04-RESEARCH.md Pitfall 2, the "stuck" UI affordance) already assumes and handles in-memory state loss on a recompile, so this new guard does not make that scenario any worse.

**Verification:**
- `npx tsc --noEmit`: clean.
- `npm run test:lib`: 214/214 pass (212 + 2 new `gates.test.ts` cases), all six `check-boundaries.ts` structural invariants pass.
- `npm run build`: compiles, static routes generate.
- The `gates.ts` `READY`/`GENERATING` behavior is covered by the two new unit tests above.
- The `generate-all-videos.ts` in-flight guard has no existing test file for this Server Action (consistent with every other Server-Action-layer fix across all four passes of this phase, none of which added a new test file for a thin action wrapper) — instead, its synchronous check-then-reserve pattern was independently proven with a standalone script that reproduced the exact pattern with fake concurrent calls (three "simultaneous" calls for the same story admit exactly one; an unrelated story is unaffected; a fourth call after the first batch's release succeeds). That script was deleted after use and is not part of this codebase.
- Dev spend ledger re-confirmed unchanged at exactly `$3.0870` of `$3.25` — nothing in this fix calls a paid provider.

## Skipped Issues

None — the one in-scope finding was fixed.

---
*Fixed: 2026-09-16*
*Fixer: Claude (orchestrator, direct implementation)*
*Iteration: 4*
