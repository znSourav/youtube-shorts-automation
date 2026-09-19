---
phase: 05-budget-retry-safeguards
plan: 04
subsystem: budget
tags: [prisma, sqlite, budget, money, node-test]

# Dependency graph
requires:
  - phase: 05-budget-retry-safeguards (plan 01)
    provides: src/core/budget/ledger.ts's checkBudget/BudgetExceededError, Decision A = A1 (05-01-SUMMARY.md)
  - phase: 05-budget-retry-safeguards (plan 02)
    provides: the real database seeded to $5.0720 total spend / $9.9280 headroom, so this plan's re-pointing changes dispatch zero paid calls against an already-correct baseline
  - phase: 05-budget-retry-safeguards (plan 03)
    provides: src/core/budget/dispatch-chain.ts's serializeDispatch, and the check+call+record-in-one-unit pattern this plan reuses for the image/video sites
provides:
  - generateSceneImagesAction/dispatchSceneVideo re-pointed onto checkBudget/serializeDispatch, the two highest-value spend points now guarded by the real monthly budget
  - src/scripts/check-boundaries.ts invariant 7 (the real budget module's enumerated import surface) plus its companion (the retired ledger barred outside src/scripts//src/lib/)
  - src/lib/spend-ledger.ts re-scoped to a developer-only ceiling (Decision A1), no longer on any wife-facing path
  - src/scripts/persistence-probe.ts's before/after cumulative-spend guard, and --simulate-assets now cleaning up its own synthetic records
  - src/scripts/story-probe.ts re-pointed onto the real budget's own figures
affects: [05-05-spend-visibility]

# Actuals (#2632)
actuals:
  tokens: 12231
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-scene serializeDispatch unit for the image loop (one callback per scene, not one for the whole loop) -- mirrors director.ts's/check.ts's pattern from plan 05-03, extended to a function that dispatches N paid calls in sequence rather than one"
    - "check-boundaries.ts's enumerated-allow-list pattern (invariants 5/6) extended to a module's own import surface (invariant 7), not just a provider's -- catches a touch site that imports the budget module without going through any provider"
    - "A probe script that writes synthetic money into the now-authoritative GenerationRecord table must clean up in the SAME invocation (try/finally), not merely on its next run -- otherwise a single isolated run permanently inflates real recorded spend"

key-files:
  created: []
  modified:
    - src/app/actions/generate-images.ts
    - src/app/actions/generate-video.ts
    - src/lib/spend-ledger.ts
    - src/scripts/check-boundaries.ts
    - src/scripts/persistence-probe.ts
    - src/scripts/story-probe.ts

key-decisions:
  - "Decision A = A1 confirmed and implemented exactly as recorded in 05-01-SUMMARY.md: spend-ledger.ts kept as a small, separate, explicitly-labelled developer ceiling for direct-provider probe scripts, re-labelled in its own header comment to say what it now is"
  - "check-boundaries.ts invariant 7's allow-list includes create-story.ts -- a real touch site (imports BudgetExceededError since plan 05-03) that the plan's own six-item enumerated list omitted; leaving it out would have made the new invariant fail against the real codebase on the commit that introduces it"
  - "persistence-probe.ts's --simulate-assets mode now deletes the synthetic GenerationRecord rows it writes before returning (wrapped in try/finally), not merely at the start of its NEXT invocation as before -- GenerationRecord is now the real budget's own authoritative ledger, so a single isolated run of this mode would otherwise permanently inflate her real recorded spend by the fixture amount until some later invocation happened to clear it"
  - "The before/after cumulative-spend guard in persistence-probe.ts's main() deliberately excludes --real: that mode dispatches a genuine, budget-gated LLM call through createStoryAction and is SUPPOSED to move the total -- the guard exists to catch SYNTHETIC fixture money leaking into her real spend, not to block a legitimate paid dispatch from completing"

patterns-established:
  - "Every real dispatch point in the application (story, uniqueness comparison, scene image, scene video) now shares one real budget gate and one serialized dispatch queue -- plan 05-05's budget-status action is the only remaining consumer named in check-boundaries.ts's invariant 7 allow-list that doesn't exist as a file yet"

requirements-completed: [BUDGET-01, BUDGET-04]

coverage:
  - id: D1
    description: "Every scene image call (first attempt or single-scene regeneration) is checked against the real monthly budget, refused with her exact unchanged sentence when it would exceed it, and recorded exactly once by the durable GenerationRecord write -- the retired dev-ledger dual-write is gone"
    requirement: "BUDGET-01"
    verification:
      - kind: other
        ref: "node -e REPOINT/MESSAGE check (05-04-PLAN.md Task 1 verify) -- generate-images.ts imports core/budget/ledger and serializeDispatch, no lib/spend-ledger import remains, her refusal sentence byte-identical"
        status: pass
      - kind: other
        ref: "node -e DELEGATION check -- regenerate-scene-image.ts still delegates to generateSceneImagesAction, so its budget check is the same call, not a copy"
        status: pass
      - kind: unit
        ref: "node --test src/core/approval/gates.test.ts src/core/retry/caps.test.ts -- 36 tests pass, confirming the retry-cap gate stays independent of the budget gate"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every scene video call (batch, first attempt, or single-scene retry) passes through the real monthly budget inside the SAME shared serializeDispatch queue every other paid-call site uses, with the budget check still preceding the attempt increment so a refusal costs no retry, and is recorded exactly once"
    requirement: "BUDGET-01"
    verification:
      - kind: other
        ref: "node -e REPOINT/MESSAGE check (05-04-PLAN.md Task 2 verify) -- generate-video.ts imports core/budget/ledger and serializeDispatch, no videoDispatchChain remains, her refusal sentence byte-identical"
        status: pass
      - kind: other
        ref: "node -e ORDER check -- checkBudget's line precedes incrementVideoAttempt's line in the file"
        status: pass
      - kind: other
        ref: "node -e DELEGATION check -- retry-scene-video.ts still delegates to generateSceneVideoAction(storyId, sceneNumber)"
        status: pass
      - kind: unit
        ref: "node --test src/core/video/batch.test.ts src/core/approval/gates.test.ts -- 34 tests pass"
        status: pass
    human_judgment: false
  - id: D3
    description: "No wife-facing code path reads or writes the retired development ledger any more; a future call site that imports the retired ledger or the budget module without being added to the enumerated allow-list fails the build"
    requirement: "BUDGET-04"
    verification:
      - kind: other
        ref: "node src/scripts/check-boundaries.ts -- 8 OK lines (6 pre-existing invariants plus invariant 7's two halves), no BOUNDARY CHECK FAILED lines"
        status: pass
      - kind: other
        ref: "node -e BUDGET INVARIANT PRESENT check -- check-boundaries.ts's own source references core/budget"
        status: pass
      - kind: unit
        ref: "npm run test:lib -- 255 tests pass, 0 fail, check-boundaries.ts's own run inside test:lib also reports all invariants OK"
        status: pass
    human_judgment: false
  - id: D4
    description: "A developer probe script cannot silently add or remove spend from her real budget -- persistence-probe.ts's --write/--read/--simulate-assets modes leave the real cumulative spend total exactly as they found it, failing loudly (non-zero exit) if it would not"
    verification:
      - kind: other
        ref: "node src/scripts/persistence-probe.ts --write -- exit 0, no spend-total-changed line"
        status: pass
      - kind: other
        ref: "node src/scripts/persistence-probe.ts --simulate-assets, run for real: writes 6 synthetic records, asserts 'assets ok', deletes them in a finally block -- GenerationRecord total confirmed unchanged before/after ($5.0720 both times)"
        status: pass
      - kind: other
        ref: "node -e SPEND CORRUPTED check (05-04-PLAN.md Task 3 verify) -- real GenerationRecord total is exactly $5.0720 after every task in this plan"
        status: pass
    human_judgment: false
  - id: D5
    description: "npm run build compiles clean and npm run typecheck is clean after every re-point in this plan"
    verification:
      - kind: other
        ref: "npm run typecheck -- clean, zero errors (checked after every task)"
        status: pass
      - kind: other
        ref: "npm run build -- Compiled successfully, static pages generated"
        status: pass
    human_judgment: false

# Metrics
duration: ~22min
completed: 2026-09-19
status: complete
---

# Phase 05 Plan 04: Image/Video Sites on the Real Budget Summary

**Scene-image and scene-video dispatch (the two highest-value spend points) re-pointed onto the real monthly budget inside the shared serializeDispatch queue; the retired dev ledger retired from every wife-facing path; check-boundaries.ts gained a seventh invariant enumerating the budget module's whole import surface**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-09-19T21:19:00Z (approx.)
- **Completed:** 2026-09-19T21:41:00Z
- **Tasks:** 3 (Task 1 scene images, Task 2 scene videos, Task 3 retire dev ledger + invariant 7)
- **Files modified:** 6

## Accomplishments

- `generate-images.ts`: the real budget check, the `generateImage` call, and the durable spend write for each scene now run inside one `serializeDispatch` callback -- the same shared queue plan 05-03 built for the story/uniqueness sites. The dev-ledger dual-write is gone; `recordGeneration` is now the sole record of a dispatched image call. Her exact "budget was reached" sentence, the retry-cap independence, and the write-failure-doesn't-stop-the-loop behavior are all unchanged (verified by 36 passing `gates.test.ts`/`caps.test.ts` tests).
- `generate-video.ts`: the video-only `videoDispatchChain` mutex is gone, replaced by the same shared `serializeDispatch` queue -- `generateSceneVideoAction` now hands the whole `dispatchSceneVideo` call (budget check, Veo dispatch, spend record) to the queue as one unit, exactly where the serialization boundary always was. The budget check still precedes `incrementVideoAttempt`, so a refusal costs no retry (mechanically verified by an ORDER check on the two lines' positions).
- `check-boundaries.ts` gained invariant 7: an enumerated allow-list of every file outside `src/scripts/`/`src/core/budget/` permitted to import the real budget module, plus a companion barring the retired ledger outside `src/scripts/`/`src/lib/`. Invariant 1's messages now name the budget module explicitly. The script reports 8 passing invariant lines (up from 6).
- `spend-ledger.ts` re-labelled (not deleted -- Decision A1) as a developer-only ceiling for direct-provider probe scripts, structurally kept off any wife-facing path by invariant 7's companion.
- `story-probe.ts` re-pointed its own reporting/refusal handling from the retired dev ledger onto the real budget's own `cumulativeAllocatedUsd`/`cumulativeSpentUsd`/`BudgetExceededError`, since the functions it drives (`runStoryDirector`, `generateSceneImagesAction`, `generateSceneVideoAction`) are all on the real budget as of plans 05-03/05-04.
- `persistence-probe.ts` gained a before/after cumulative-spend guard covering every mode except `--real` (which legitimately spends real money), and `--simulate-assets` now deletes its own synthetic `GenerationRecord` rows before returning instead of only clearing them at the start of a later invocation -- proven by a real run: 6 synthetic records written, asserted, deleted, real total confirmed unchanged at $5.0720 before and after.
- Full suite green: `npm run test:lib` -- 255 tests pass, 0 fail, `check-boundaries.ts`'s own run inside it reports all invariants OK. `npm run build` compiles clean. Real spend total confirmed unchanged at exactly $5.0720 after every task.

## Task Commits

Each task was committed atomically:

1. **Task 1: Scene images on the real budget** -- `260e362` (feat)
2. **Task 2: Scene videos on the real budget, on the shared queue** -- `c861b5e` (feat)
3. **Task 3: Retire the development ledger from her paths, and make the gate's import surface enumerable** -- `c27e5f1` (feat)

**Plan metadata:** committed together with STATE.md/ROADMAP.md at plan close (see final commit below)

## Files Created/Modified

- `src/app/actions/generate-images.ts` - re-pointed onto `checkBudget`/`serializeDispatch`; dev-ledger dual-write deleted; per-scene serialized dispatch unit returns a discriminated outcome (`blocked`/`write-failed`/`success`) the loop body reacts to
- `src/app/actions/generate-video.ts` - re-pointed onto `checkBudget`/`serializeDispatch`; `videoDispatchChain` deleted; `generateSceneVideoAction` now hands `dispatchSceneVideo` to the shared queue; dev-ledger dual-write and its try/catch deleted
- `src/lib/spend-ledger.ts` - header rewritten to describe its new developer-only-ceiling role (Decision A1); `DEV_CEILING_USD`/`LEDGER_PATH`/every exported function unchanged
- `src/scripts/check-boundaries.ts` - invariant 7 added (budget-module import allow-list + retired-ledger companion), invariant 1's messages extended to name the budget module, top-of-file doc block updated to describe invariant 7
- `src/scripts/persistence-probe.ts` - `--simulate-assets` wrapped in try/finally with a cleanup delete; `main()` captures/re-reads `cumulativeSpentUsd()` around every mode except `--real` and fails loudly on any difference
- `src/scripts/story-probe.ts` - `loadLedger`/`totalSpentUsd`/`CeilingExceededError` replaced with `cumulativeAllocatedUsd`/`cumulativeSpentUsd`/`BudgetExceededError` from `core/budget/ledger.ts`, in both the video-only probe path and the main story/image/video chain

## Decisions Made

- **Decision A = A1 confirmed and implemented exactly as recorded** (05-01-SUMMARY.md): `spend-ledger.ts` stays as a small, separate, explicitly-labelled developer ceiling, its header rewritten to say so. `smoke-test.ts` (the one script that calls the image/video providers directly) keeps using it completely unchanged.
- **`check-boundaries.ts` invariant 7's allow-list includes `create-story.ts`**, a real touch site the plan's own six-item enumerated list did not name. It already imports `BudgetExceededError` directly (since plan 05-03) to catch a refusal from the story director / uniqueness check it calls. Omitting it would have made this invariant fail against the real codebase on the very commit introducing it -- documented as a deviation below.
- **`persistence-probe.ts`'s `--simulate-assets` mode now deletes its synthetic `GenerationRecord` rows in a `finally` block before returning**, not merely at the start of its next invocation as the code did before this plan. `GenerationRecord` is now the real budget's own authoritative ledger; leaving the synthetic rows in place after a single isolated run would permanently inflate her real recorded spend by the fixture amount (~$1.07) until some later, unrelated invocation happened to clear them. Documented as a deviation below.
- **The before/after spend guard in `persistence-probe.ts`'s `main()` deliberately excludes `--real`** -- that mode dispatches a genuine, budget-gated LLM call through `createStoryAction` and is supposed to move the total. The guard exists to catch synthetic fixture money leaking into her real spend, never to block a legitimate, properly-accounted dispatch from completing cleanly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `create-story.ts` to invariant 7's budget-module allow-list**
- **Found during:** Task 3, while enumerating the real touch sites the plan's `<action>` names (director.ts, check.ts, generate-images.ts, generate-video.ts, get-story-status.ts, and 05-05's budget-status action)
- **Issue:** `src/app/actions/create-story.ts` already imports `BudgetExceededError` directly from `core/budget/ledger.ts` (added in plan 05-03, to catch a refusal from the `runUniqueStoryDirector` call it wraps) -- a real, currently-existing touch site the plan's own six-item enumerated list did not include. Without adding it, invariant 7 would have reported `create-story.ts` as an offender and failed the build on the very commit that introduces the invariant, against the real, correctly-functioning codebase.
- **Fix:** Added `src/app/actions/create-story.ts` to `ALLOWED_BUDGET_MODULE_IMPORT_PATHS`, documented inline as the seventh real touch site found while building this invariant.
- **Files modified:** `src/scripts/check-boundaries.ts`
- **Verification:** `node src/scripts/check-boundaries.ts` reports 8 OK lines, no offenders.
- **Committed in:** `c27e5f1` (Task 3 commit)

**2. [Rule 2 - Missing Critical] `persistence-probe.ts`'s `--simulate-assets` mode now cleans up its own synthetic spend records before exiting**
- **Found during:** Task 3, implementing the plan's "the before-and-after equality is the real guarantee" requirement
- **Issue:** As written, `--simulate-assets` only cleared its previously-written `GenerationRecord` rows at the START of its NEXT invocation (for re-runnability); it never deleted them at the end of the current run. Against a table that is now the real budget's authoritative ledger, a single isolated run of this mode would leave synthetic, zero-provider-cost amounts (~$1.07 for the 3-scene fixture) permanently counted against her real headroom until some later, unrelated invocation happened to clear them -- exactly the "inflate then leave inflated" failure the plan's own threat model (T-05-15) describes.
- **Fix:** Wrapped the mode's body in try/finally; the finally block deletes the probe story's `GenerationRecord` rows unconditionally (even on a mismatch or the defensive "story not found" early return), after the assertions above have already read them back.
- **Files modified:** `src/scripts/persistence-probe.ts`
- **Verification:** Ran `--simulate-assets` for real: wrote 6 synthetic records, printed "assets ok", then confirmed via a direct SQLite query that `GenerationRecord`'s total was exactly $5.0720 both immediately before and immediately after the run.
- **Committed in:** `c27e5f1` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 2 -- missing critical functionality needed for the plan's own stated invariants to actually hold against the real codebase)
**Impact on plan:** Both fixes necessary for invariant 7 and the spend-total guard to be true rather than merely documented. No scope creep -- both stay within Task 3's own files.

## Corrected Assumption (not a deviation -- a factual correction to an inherited claim)

05-01-SUMMARY.md's Decision A rationale states "Two of the four scripts (`story-probe.ts`, `uniqueness-probe.ts`) reach the model through shared core functions plans 05-03/05-04 put on the real budget regardless of this choice." Checking `uniqueness-probe.ts`'s actual code during this task: it makes **zero provider calls in any mode** -- its own header comment says so explicitly ("Makes NO provider call in any mode"), and every function in the file only calls `scoreFingerprints`/`preFilterVerdict`/`listAcceptedFingerprints` (a pure similarity check and a read-only database query), never `compareViaLlm` or `runUniqueStoryDirector`. It does not touch either budget path at all, under any Decision A option.

The accurate picture, as of this plan, across every script that CAN touch a budget:
- **`smoke-test.ts`** -- calls the image/video providers directly; stays on the developer-only dev ceiling (Decision A1's actual protection).
- **`story-probe.ts`** -- drives `runStoryDirector`/`generateSceneImagesAction`/`generateSceneVideoAction`; on the real budget, regardless of Decision A (as the inherited claim correctly said for this one script).
- **`persistence-probe.ts`**'s `--real` mode -- drives `createStoryAction`; also on the real budget, regardless of Decision A.
- **`uniqueness-probe.ts`** -- dispatches nothing, in any mode; not on either budget path.

This is recorded here rather than silently repeated, since the plan's own success criteria required the summary to state the mechanical caveat plainly rather than "read as broader than it is."

## Issues Encountered

None.

## User Setup Required

None -- no external service configuration required. This plan touched only application source and developer probe scripts; no `.env.local` changes, no dashboard steps.

## Next Phase Readiness

- Every real dispatch point in the application (story, uniqueness comparison, scene image, scene video) is now gated by the real monthly budget and runs inside the shared `serializeDispatch` queue -- BUDGET-01 is now true for every dollar that actually matters, not just the cheap language-model calls.
- The retired development ledger is off every wife-facing path, structurally enforced by `check-boundaries.ts` invariant 7 (BUDGET-04 demonstrable, not just asserted).
- `check-boundaries.ts` invariant 7's allow-list already includes `src/app/actions/get-budget-status.ts` (plan 05-05's not-yet-created action), so plan 05-05 needs no edit to this file when it adds that action.
- The real spend total is confirmed unchanged at exactly $5.0720 after every task in this plan; `budget-probe.ts --expect=pass` would still report the same $9.9280 remaining headroom.
- No blockers.

## Self-Check: PASSED

All 6 modified files confirmed present on disk with their expected changes; all three task commits (`260e362`, `c861b5e`, `c27e5f1`) confirmed in `git log`; real `GenerationRecord` total confirmed at exactly $5.0720 via direct SQLite query.

---
*Phase: 05-budget-retry-safeguards*
*Completed: 2026-09-19*
