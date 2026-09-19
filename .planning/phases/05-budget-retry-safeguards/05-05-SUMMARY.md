---
phase: 05-budget-retry-safeguards
plan: 05
subsystem: budget
tags: [prisma, sqlite, budget, money, node-test, react, ui]

# Dependency graph
requires:
  - phase: 05-budget-retry-safeguards (plan 01)
    provides: src/core/budget/ledger.ts's checkBudget/ensureCurrentMonthAllocation/cumulativeAllocatedUsd/cumulativeSpentUsd, BudgetPeriod model
  - phase: 05-budget-retry-safeguards (plan 02)
    provides: the real database seeded to $5.0720 total spend / $9.9280 headroom
  - phase: 05-budget-retry-safeguards (plan 04)
    provides: every real dispatch point (story, uniqueness comparison, scene image, scene video) re-pointed onto the real budget inside the shared serializeDispatch queue; check-boundaries.ts invariant 7's allow-list already including get-budget-status.ts
provides:
  - src/core/budget/status.ts (getBudgetStatus, emptyBudgetStatus, BudgetStatus/BudgetBreakdownEntry/BudgetTypeBucket)
  - src/app/actions/get-budget-status.ts (getBudgetStatusAction)
  - src/components/story/BudgetIndicator.tsx, wired into page.tsx above the screen switch with a best-effort refresh-after-spend pattern
  - Automated regression evidence for BUDGET-04 (structural delegation) and BUDGET-05 (retry caps unchanged and independent of the budget system)
affects: [06-reliability-secrets-output (BUDGET-03's live UI confirmation and the env-reload answer still need to land before the phase closes)]

# Actuals (#2632)
actuals:
  tokens: 6785
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read/display layer sitting beside the enforcement layer under the same src/core/budget/ directory (status.ts beside ledger.ts) -- reuses the enforcement layer's cumulative helpers rather than re-querying, so the displayed figure can never drift from the figure the gate itself compares against"
    - "A client component takes the server-computed status shape as a plain prop and re-declares its own local TypeScript type for it (never importing the core module's type, even type-only) -- keeps check-boundaries.ts invariant 1 satisfied by construction, not by remembering not to import"
    - "Two independent literal call sites for a polled/refreshed Server Action (one in the mount effect, one in a shared best-effort refresh helper used by every money-spending handler and the existing poll tick) rather than a single fully-centralized wrapper -- both are genuine, distinct fetch moments, not padding"

key-files:
  created:
    - src/core/budget/status.ts
    - src/core/budget/status.test.ts
    - src/app/actions/get-budget-status.ts
    - src/components/story/BudgetIndicator.tsx
  modified:
    - package.json
    - src/app/page.tsx

key-decisions:
  - "The indicator's headline figure is the rollover-inclusive cumulative headroom (cumulativeAllocatedUsd - cumulativeSpentUsd), per 05-RESEARCH.md's Open Question #2 recommendation and this plan's own <display_decision> -- this is exactly the number checkBudget compares against, so a comfortable-looking figure can never coexist with an actual refusal. This month's own allocation and its own by-type spend are expanded-detail-only."
  - "status.ts rounds nothing; BudgetIndicator.tsx is the only place .toFixed(2) appears -- the real data already contains values like 0.30000000000000004 (05-RESEARCH.md Pitfall 3), and rounding earlier would make the displayed figure disagree with the enforced one."
  - "BudgetIndicator.tsx re-declares its own BudgetIndicatorStatus type rather than importing BudgetStatus from src/core/budget/status.ts (even type-only) -- a type-only import specifier still contains the literal substring \"core/budget\", which check-boundaries.ts invariant 1 forbids on any \"use client\" file. page.tsx derives its own local BudgetStatus type via Awaited<ReturnType<typeof getBudgetStatusAction>> for the same reason."
  - "page.tsx's refresh-after-spend calls (createStory, generateImages, regenerateImage, generateAllVideos, retryScene) are all fire-and-forget (`void refreshBudgetStatus()`), never awaited -- so a slow or failed status refresh can never delay or block the primary handler it follows. The video-status poll tick's own refresh piggybacks on the existing 3s interval rather than adding a second timer."
  - "BUDGET-05 confirmed to require no new implementation in this plan (05-RESEARCH.md's discretion note): src/core/retry/caps.ts's maxSceneRetryAttempts() plus Scene.imageAttempts/videoAttempts plus src/core/approval/gates.ts's two cap-reached refusal messages already satisfy the requirement verbatim, and both modules remain structurally independent of src/core/budget/ (confirmed by grep, not assumed)."
  - "BUDGET-04 confirmed structural rather than duplicated: retrySceneVideoAction is a one-line delegation to generateSceneVideoAction, and regenerateSceneImageAction delegates to generateSceneImagesAction -- the exact same gated dispatch functions a first attempt uses, so there is no second budget check to audit or drift out of sync."
  - "Deliberately did NOT mark BUDGET-03 complete in REQUIREMENTS.md this run, and did NOT run phase-completion routing (no state.advance-plan, no marking Phase 5 'Complete' in ROADMAP.md) -- Task 3's <human-check> block (live browser verification of the indicator, its breakdown, its labels, keyboard operability, and the env-reload answer) has not yet run. Per this run's explicit instructions, that live verification is reserved for the orchestrator in a follow-up step, not fabricated here."

requirements-completed: [BUDGET-04, BUDGET-05]

coverage:
  - id: D1
    description: "getBudgetStatus computes the rollover-inclusive headline, this month's own allocation, and the video/image/writing breakdown directly from GenerationRecord/BudgetPeriod, with no rounding and no billed filter -- verified against the real database to the exact figures the plan specifies"
    requirement: "BUDGET-03"
    verification:
      - kind: unit
        ref: "src/core/budget/status.test.ts (8 tests: breakdown shape/order/zeroing, LLM-bucket folding, month-to-date window boundaries, cumulative-vs-month-to-date, rollover summation, unclamped negative remaining, null-storyId carried-forward rows, emptyBudgetStatus shape)"
        status: pass
      - kind: other
        ref: "node -e probe against the real database: {ok:true, cumulativeAllocatedUsd:15, cumulativeSpentUsd:5.072, remainingUsd:9.928, monthlyAllocationUsd:15, monthToDateSpentUsd:5.072, breakdown:[VIDEO 3.30, IMAGE 1.072, LLM 0.70]} -- matches the plan's <done> criteria exactly"
        status: pass
    human_judgment: false
  - id: D2
    description: "getBudgetStatusAction wraps getBudgetStatus exactly like get-story-status.ts: use server, try/catch, one log line, emptyBudgetStatus() on any error, no direct database/Prisma import, no path/prompt/storyId-shaped field"
    requirement: "BUDGET-03"
    verification:
      - kind: other
        ref: "node -e ACTION structural check (05-05-PLAN.md Task 1 verify) -- ACTION OK"
        status: pass
      - kind: other
        ref: "npm run typecheck -- clean; node src/scripts/check-boundaries.ts -- all 8 invariant lines OK, including invariant 7's pre-existing allow-list entry for this exact file"
        status: pass
    human_judgment: false
  - id: D3
    description: "BudgetIndicator.tsx (a real button, aria-expanded, two-decimal figures, zinc/black palette, no icon/colour/spacing addition) rendered once above page.tsx's screen switch, fetched on mount and refreshed after every money-spending handler and on the existing video-status poll tick, hides itself on a failed/not-ok status rather than showing a misleading zero"
    requirement: "BUDGET-03"
    verification:
      - kind: other
        ref: "node -e INDICATOR structural check -- INDICATOR OK"
        status: pass
      - kind: other
        ref: "node -e WIRING check -- WIRING OK 3 (BudgetIndicator rendered, getBudgetStatusAction called at 2+ literal sites: mount effect + shared refresh helper used by 5 handlers/poll tick)"
        status: pass
      - kind: other
        ref: "npm run build -- Compiled successfully, static pages generated"
        status: pass
    human_judgment: true
    rationale: "Structural/compile checks confirm the code is wired correctly, but BUDGET-03's actual acceptance (\"she can see running spend\") requires a live browser look: is it visible without scrolling, does tapping actually reveal the breakdown with plain-language labels, is it reachable by keyboard, does it survive a screen change. Reserved for the orchestrator's live verification per this run's explicit instructions -- not fabricated here. See 'Human Verification Pending' below."
  - id: D4
    description: "The retry-cap tests pass unchanged and neither src/core/retry/caps.ts nor src/core/approval/gates.ts imports the budget system -- BUDGET-05 required no new implementation in this plan"
    requirement: "BUDGET-05"
    verification:
      - kind: unit
        ref: "node --test src/core/retry/caps.test.ts src/core/approval/gates.test.ts -- 36 tests pass, 0 fail"
        status: pass
      - kind: other
        ref: "node -e INDEPENDENCE check (05-05-PLAN.md Task 3 verify) -- CAPS INDEPENDENT"
        status: pass
    human_judgment: false
  - id: D5
    description: "Both retry entry points (retrySceneVideoAction, regenerateSceneImageAction) still delegate to the identical gated dispatch function a first attempt uses -- BUDGET-04 is structural, not duplicated, and plan 05-04's boundary invariants are what keep it that way"
    requirement: "BUDGET-04"
    verification:
      - kind: other
        ref: "node -e DELEGATION check (05-05-PLAN.md Task 3 verify) -- BUDGET-04 STRUCTURAL"
        status: pass
      - kind: unit
        ref: "npm run test:lib -- 263 tests pass, 0 fail; check-boundaries.ts reports all 8 invariant lines OK"
        status: pass
    human_judgment: false
  - id: D6
    description: "The full suite, type check, and build all pass together after this plan's changes, and the database ends the phase at exactly 40 spend rows / $5.0720 and 1 allocation row / $15.00 -- this plan spent nothing proving any of the above"
    verification:
      - kind: other
        ref: "npm run typecheck -- clean; npm run build -- Compiled successfully"
        status: pass
      - kind: other
        ref: "node src/scripts/budget-probe.ts --expect=pass -- BUDGET PROBE: month=2026-09 allocated=$15.00 spent=$5.07 headroom=$9.93 / BUDGET PROBE OK"
        status: pass
      - kind: other
        ref: "node -e PHASE CLOSE check (05-05-PLAN.md Task 3 verify) -- PHASE CLOSE OK 9.9280 REMAINING"
        status: pass
    human_judgment: false
  - id: D7
    description: "05-RESEARCH.md Assumption A1 (does an env-var MONTHLY_BUDGET_USD edit take effect under the documented npm run dev start command without a restart) -- settled either way, not left as an assumption"
    verification: []
    human_judgment: true
    rationale: "Requires editing the real .env.local, saving, and triggering budget-probe.ts without restarting anything, then observing whether the new figure took effect -- an interactive, stateful check against the live dev process that this run's explicit instructions reserve for the orchestrator, not something the executor can fabricate or safely automate unattended (it would leave the real MONTHLY_BUDGET_USD in a non-$15 state if interrupted)."

# Metrics
duration: ~25min (Tasks 1-2 plus Task 3's automated portion; Task 3's human-check is not yet run)
completed: 2026-09-19
status: halted
---

# Phase 05 Plan 05: The Spend Indicator, Plus the Phase's Closing Evidence Summary

**getBudgetStatus/getBudgetStatusAction compute her exact spend figures server-side ($15.00 allocated, $5.0720 spent, $9.9280 remaining, split $3.30 video/$1.07 image/$0.70 writing); BudgetIndicator.tsx renders them as a small always-visible, tap-to-expand line wired into every screen; BUDGET-04/BUDGET-05 re-confirmed with fresh automated evidence. Task 3's live-browser human-check (indicator visibility, breakdown content, keyboard operability, and the env-reload question) has NOT yet run -- reserved for the orchestrator per this run's explicit instructions.**

## Performance

- **Duration:** ~25 min so far (Tasks 1-2 complete and committed; Task 3's automated verify commands all run and pass; Task 3's `<human-check>` block intentionally not run)
- **Tasks:** 3 (Task 1 and Task 2 fully complete and committed; Task 3's automated verification complete, human-check portion pending)
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- `src/core/budget/status.ts`: `getBudgetStatus()` computes the rollover-inclusive headline, this month's own allocation, and the video/image/writing breakdown in one call (reusing `ledger.ts`'s cumulative helpers, one `groupBy` query for the breakdown, no rounding, no `billed` filter). `emptyBudgetStatus()` is the single zeroed/ok-false shape shared by the Server Action's failure path. 8 new unit tests cover every behavior the plan's `<behavior>` block specifies, all passing.
- `src/app/actions/get-budget-status.ts`: `getBudgetStatusAction()`, a three-line `"use server"` wrapper matching `get-story-status.ts`'s exact shape (try/catch, one log line, safe default, no direct database import).
- Real server-side call confirmed against the live database: **$15.00 allocated, $5.0720 spent, $9.9280 remaining, split $3.3000 video / $1.0720 image / $0.7000 writing** -- exactly the figures the plan's `<done>` criterion names.
- `src/components/story/BudgetIndicator.tsx`: a client component taking the status shape as a prop, holding only `expanded` as local state. Collapsed: `"$9.93 left of $15.00"` (never claims the total belongs to "this month"). Expanded: video/images/story-writing rows (her language, no "LLM", no enum names) plus this month's own allocation and month-to-date total. A real `<button>` with `aria-expanded`. Renders nothing when `status.ok` is false (never a misleading zero); shows a calm "budget is used up for now" line (no alarm styling) when remaining is at or below zero.
- `src/app/page.tsx`: `BudgetIndicator` rendered once above the screen switch inside `<main>`, so it's on every screen. Status fetched on mount; refreshed (best-effort, fire-and-forget, never blocking) after `handleCreateStory`, `handleGenerateImages`, `handleRegenerateImage`, `handleGenerateAllVideos`, and `handleRetryScene` resolve, and on the same 3s tick as the existing video-status poll (no second timer added).
- BUDGET-05 re-confirmed with fresh evidence, not re-derived from research alone: `node --test src/core/retry/caps.test.ts src/core/approval/gates.test.ts` -- 36/36 pass; a structural grep confirms neither module imports `core/budget` or `lib/spend-ledger`.
- BUDGET-04 re-confirmed structural: both `retrySceneVideoAction` and `regenerateSceneImageAction` still delegate to the exact same gated dispatch function (`generateSceneVideoAction`/`generateSceneImagesAction`) a first attempt uses.
- Full suite green: `npm run test:lib` -- **263 tests pass, 0 fail**, all 8 `check-boundaries.ts` invariant lines OK. `npm run typecheck` clean. `npm run build` compiles clean.
- `node src/scripts/budget-probe.ts --expect=pass` -- `BUDGET PROBE OK`, $9.93 headroom confirmed once more.
- Database confirmed unchanged at exactly **40 spend rows totalling $5.0720** and **1 allocation row of $15.00** -- this plan dispatched zero paid calls proving any of the above.

## Task Commits

1. **Task 1: The numbers, computed on the server** -- `374d365` (feat)
2. **Task 2: The indicator she actually sees** -- `c370714` (feat)
3. **Task 3: Close the phase -- confirm what was already true is still true** -- no code changes; every automated `<verify>` command ran for real and passed (recorded above and in the `coverage:` block). The `<human-check>` block has not yet run.

**Plan metadata:** not yet committed -- this SUMMARY, STATE.md, and ROADMAP.md are committed together once, per this run's explicit instructions, without triggering phase-completion routing (see "Human Verification Pending" below).

## Files Created/Modified

- `src/core/budget/status.ts` - `BudgetStatus`/`BudgetBreakdownEntry`/`BudgetTypeBucket`, `getBudgetStatus()`, `emptyBudgetStatus()`
- `src/core/budget/status.test.ts` - 8 tests covering every `<behavior>` case
- `src/app/actions/get-budget-status.ts` - `getBudgetStatusAction()`
- `src/components/story/BudgetIndicator.tsx` - the always-visible, tap-to-expand indicator
- `src/app/page.tsx` - `BudgetIndicator` wiring, `budgetStatus` state, `refreshBudgetStatus()` helper, mount-time fetch, refresh calls in 5 handlers, refresh piggybacked on the video-status poll tick
- `package.json` - `test:lib` now includes `status.test.ts`

## Decisions Made

See `key-decisions` in the frontmatter above -- summarized: the headline figure is rollover-inclusive (not month-only); rounding happens only at the display layer; the client component and `page.tsx` both re-derive their own local type for the status shape rather than importing `core/budget` (even type-only) to keep invariant 1 satisfied by construction; every refresh-after-spend call is fire-and-forget; BUDGET-05 needed no new implementation and BUDGET-04 is structural, both re-confirmed with fresh evidence; BUDGET-03 was deliberately NOT marked complete and no phase-completion routing ran, because the live human-check has not yet happened.

## Deviations from Plan

None -- Tasks 1 and 2 executed exactly as written, and every one of Task 3's automated `<verify>` commands ran for real (not simulated) and passed on the first attempt; no fix was needed. The one deliberate divergence from the plan's own literal instructions is procedural, not a code deviation: this run's explicit orchestrator instructions required stopping before Task 3's `<human-check>` block rather than completing the whole plan in one pass. That stop is recorded via `status: halted` (per this template's own frontmatter guidance) rather than treated as a completed plan.

## Human Verification Pending

Task 3's `<human-check>` block (05-05-PLAN.md) has **not** been run. It is reserved for the orchestrator to complete live, in the running dev app, per this run's explicit instructions. The exact items still open:

1. The spend indicator is visible without scrolling on the create screen and reads $9.93 left of $15.00.
2. Tapping it reveals three labelled rows -- video $3.30, images $1.07, story writing $0.70 -- plus this month's allocation and month-to-date total.
3. The labels are in her language: no enum names, no model ids, no "LLM".
4. Tapping again collapses it. The control is reachable and operable by keyboard.
5. It is still visible after navigating to My Stories and back.
6. Change the monthly figure in the local environment file to a value below $5.0720, save, and without restarting anything trigger a budget check (via `budget-probe.ts`, never a real generation) -- confirm whether the new figure takes effect. This settles 05-RESEARCH.md's Assumption A1 either way.
7. Restore the figure to $15.00 and confirm the indicator reads $9.93 left of $15.00 again.

Until these run, **BUDGET-03 remains unchecked in REQUIREMENTS.md**, and the phase is not marked complete in ROADMAP.md/STATE.md. If any item genuinely fails, per this repository's own established precedent (04-03's item 7, 04-04's item 10) it must be fixed and written up, not waived.

## Issues Encountered

None.

## User Setup Required

None -- no external service configuration required. This plan touched only application source, and every real command run against the live database left it unchanged (confirmed before and after: 40 rows / $5.0720 / 1 allocation row / $15.00).

## Next Phase Readiness

- BUDGET-01, BUDGET-02, and BUDGET-04 are complete with real evidence (BUDGET-01/02 from earlier waves in this phase; BUDGET-04 re-confirmed here).
- BUDGET-05 is now also complete with fresh evidence from this plan -- `requirements.mark-complete` will be run for `BUDGET-04, BUDGET-05` alongside this SUMMARY.
- BUDGET-03 is code-complete (server computation, Server Action, and UI all built, structurally verified) but **not yet marked complete** -- it needs the live browser confirmation above.
- Once the human-check passes (or any genuine failure is fixed and re-verified), a follow-up step should: mark BUDGET-03 complete in REQUIREMENTS.md, flip this SUMMARY's `status` to `complete`, run `state.advance-plan`, and update ROADMAP.md's Phase 5 row to Complete -- none of which this run performs.
- No blockers beyond the pending live check itself.

## Self-Check: PASSED

Both created-file sets confirmed present on disk (`src/core/budget/status.ts`, `src/core/budget/status.test.ts`, `src/app/actions/get-budget-status.ts`, `src/components/story/BudgetIndicator.tsx`); both task commits (`374d365`, `c370714`) confirmed in `git log`; real `GenerationRecord`/`BudgetPeriod` totals confirmed unchanged at $5.0720 / $15.00 via direct SQLite query after every task.

---
*Phase: 05-budget-retry-safeguards*
*Completed: 2026-09-19 (Tasks 1-2 and Task 3's automated portion only -- see "Human Verification Pending")*
