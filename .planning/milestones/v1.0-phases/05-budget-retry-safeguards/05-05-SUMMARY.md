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
affects: [06-reliability-secrets-output]

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
  - "Task 3's <human-check> block was completed live by the orchestrator in a follow-up step (not fabricated by the executor): the indicator, its breakdown, its plain-language labels, and the env-reload question were all confirmed directly against the running dev app. BUDGET-03 is marked complete below on the strength of that live evidence."

requirements-completed: [BUDGET-03, BUDGET-04, BUDGET-05]

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
      - kind: manual_procedural
        ref: "Live browser check against the running dev app (localhost:3000): indicator visible without scrolling, reads \"$9.93 left of $15.00\"; tapping reveals Video $3.30 / Images $1.07 / Story writing $0.70 plus This month's allocation $15.00 / Spent so far this month $5.07 -- exact match to the plan's <done> figures; no enum names, model ids, or \"LLM\" anywhere in the rendered text; tapping again collapses it; still visible after navigating to My Stories and back."
        status: pass
      - kind: manual_procedural
        ref: "Keyboard: reachability confirmed live -- the very first Tab press from a fresh page load focuses the indicator button (confirmed via document.activeElement). Operability via a live synthetic Enter/Space keypress could not be confirmed through the browser-automation tool used (the same tool's Tab and mouse-click actions work correctly on this element, and a direct element.click() correctly toggles it, but its synthetic keydown/keyup did not trigger the browser's native button-activation behavior in this environment). Source inspection confirms the button is a plain native <button type=\"button\"> with a single onClick handler and aria-expanded, no onKeyDown/onKeyUp/preventDefault/stopPropagation anywhere in the file -- the standard, spec-compliant pattern real browsers activate on Enter/Space without any app-level key handling required. Treated as a tooling limitation of this session's verification method, not an application defect; flagged here rather than silently claimed as a full live keyboard pass."
        status: pass
    human_judgment: true
    rationale: "Live-verified by the orchestrator in a follow-up step against the running dev app. Visibility, breakdown content, plain-language labels, keyboard reachability, and screen-change persistence were all directly observed. Keyboard operability rests on standards-compliant source code plus a working programmatic click, not a directly-observed synthetic keypress -- see the manual verification entry above for the exact reason."
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
    verification:
      - kind: manual_procedural
        ref: "The requester edited .env.local (MONTHLY_BUDGET_USD=1) while the already-running npm run dev process (started before the edit) stayed up. The dev server's own log immediately printed \"Reload env: .env.local\", and the next page load showed the indicator flip live to \"The generation budget is used up for now.\" with no restart of any kind. Confirmed by direct server-log inspection (preview_logs), not inferred."
        status: pass
      - kind: manual_procedural
        ref: "The figure was restored to MONTHLY_BUDGET_USD=15 the same way; the indicator and a fresh node --env-file=.env.local src/scripts/budget-probe.ts --expect=pass both returned to $9.93 left of $15.00, confirming the reload is bidirectional, not a one-way drop into a fallback."
        status: pass
    human_judgment: true
    rationale: "Answer: YES -- editing MONTHLY_BUDGET_USD in .env.local and saving takes effect live under npm run dev, with no restart required. This is a first-party observation (Next.js's own \"Reload env\" log line), not an inference from a fresh-process re-read. One methodology note for future reference: node src/scripts/budget-probe.ts alone (without --env-file=.env.local) does NOT read the project's env file -- it silently falls back to the script's own $15 default, which looked like a false negative on first attempt until re-run with the flag package.json's own smoke script already uses. That was a test-methodology miss, not a finding about the app."

# Metrics
duration: ~25min executor + live human-check completed in a follow-up orchestrator step
completed: 2026-09-19
status: complete
---

# Phase 05 Plan 05: The Spend Indicator, Plus the Phase's Closing Evidence Summary

**getBudgetStatus/getBudgetStatusAction compute her exact spend figures server-side ($15.00 allocated, $5.0720 spent, $9.9280 remaining, split $3.30 video/$1.07 image/$0.70 writing); BudgetIndicator.tsx renders them as a small always-visible, tap-to-expand line wired into every screen; BUDGET-04/BUDGET-05 re-confirmed with fresh automated evidence. Task 3's live-browser human-check (indicator visibility, breakdown content, keyboard operability, and the env-reload question) is now complete -- all 7 items confirmed against the running dev app. BUDGET-03 is marked complete.**

## Performance

- **Duration:** ~25 min executor work (Tasks 1-2 and Task 3's automated portion), plus a live browser verification pass completed by the orchestrator in a follow-up step
- **Tasks:** 3/3 fully complete, including Task 3's `<human-check>` block
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
3. **Task 3: Close the phase -- confirm what was already true is still true** -- no code changes; every automated `<verify>` command ran for real and passed (recorded above and in the `coverage:` block). The `<human-check>` block was completed live by the orchestrator in a follow-up step (see "Human Verification -- Completed" below).

**Plan metadata:** committed together with STATE.md/ROADMAP.md/REQUIREMENTS.md once the live human-check confirmed all 7 items.

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

None -- Tasks 1 and 2 executed exactly as written, and every one of Task 3's automated `<verify>` commands ran for real (not simulated) and passed on the first attempt; no fix was needed. The executor stopped before Task 3's `<human-check>` block per that run's explicit orchestrator instructions (recorded at the time via `status: halted`); the orchestrator then completed the human-check live in a follow-up step, and this file has been updated in place to reflect that (status now `complete`).

## Human Verification -- Completed

Task 3's `<human-check>` block (05-05-PLAN.md) was run live by the orchestrator against the running dev app (`npm run dev`, localhost:3000). All 7 items:

1. **Pass.** Indicator visible without scrolling on the create screen, read "$9.93 left of $15.00".
2. **Pass.** Tapping revealed Video $3.30 / Images $1.07 / Story writing $0.70, plus "This month's allocation" $15.00 and "Spent so far this month" $5.07.
3. **Pass.** All labels plain-language -- no enum names, model ids, or "LLM" anywhere.
4. **Pass (collapse + keyboard reachability); qualified pass (keyboard operability).** Tapping again collapsed it. Tab from a fresh page load focused the button first. A live synthetic Enter/Space keypress through the browser-automation tool used for this check did not trigger the toggle, but source inspection confirms a plain native `<button type="button">` with a single `onClick` and no key-event interception -- the standard pattern real browsers activate on Enter/Space without any app code needed -- and a direct `element.click()` on the same focused element did toggle it correctly. Treated as a limitation of the verification tool's synthetic key dispatch, not an application defect; not silently claimed as a directly-observed keyboard pass either. See D3 in `coverage:` above for the full detail.
5. **Pass.** Indicator still visible, unchanged figure, after navigating to My Stories and back.
6. **Pass -- Assumption A1 is YES.** With `MONTHLY_BUDGET_USD=1` saved into `.env.local` while `npm run dev` kept running (no restart), the dev server's own log printed `Reload env: .env.local` and the next page load showed the indicator flip to "The generation budget is used up for now." live.
7. **Pass.** Figure restored to `MONTHLY_BUDGET_USD=15`; indicator and a fresh `budget-probe.ts --expect=pass` both confirmed $9.93 left of $15.00 again.

No item genuinely failed, so nothing needed fixing. BUDGET-03 is marked complete in REQUIREMENTS.md. Plan execution for Phase 5 is now fully done (5/5 plans); the phase itself is not yet marked "Complete" in ROADMAP.md -- per this project's established pipeline (matching Phases 1-4), that happens only after code review, phase-goal verification, security audit, and UAT all pass.

## Issues Encountered

None.

## User Setup Required

None -- no external service configuration required. This plan touched only application source, and every real command run against the live database left it unchanged (confirmed before and after: 40 rows / $5.0720 / 1 allocation row / $15.00).

## Next Phase Readiness

- BUDGET-01 through BUDGET-05 are all complete with real evidence -- the last of the five, BUDGET-03, closed out via this file's live human-check update.
- Phase 5's own goal ("no paid provider call can ever fire in a way that would exceed the configured monthly budget, and no retry of any kind can bypass that guarantee") has full requirement-level coverage from all 5 plans.
- Remaining before the phase is marked "Complete" in ROADMAP.md, matching Phases 1-4's pipeline: code review, regression gate, phase-goal verification (gsd-verifier), security audit (gsd-secure-phase), and UAT.
- No blockers.

## Self-Check: PASSED

Both created-file sets confirmed present on disk (`src/core/budget/status.ts`, `src/core/budget/status.test.ts`, `src/app/actions/get-budget-status.ts`, `src/components/story/BudgetIndicator.tsx`); both task commits (`374d365`, `c370714`) confirmed in `git log`; real `GenerationRecord`/`BudgetPeriod` totals confirmed unchanged at $5.0720 / $15.00 via direct SQLite query after every task, and again after the live human-check ran.

---
*Phase: 05-budget-retry-safeguards*
*Completed: 2026-09-19*
