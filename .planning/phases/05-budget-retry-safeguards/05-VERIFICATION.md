---
phase: 05-budget-retry-safeguards
verified: 2026-09-19T14:44:55Z
status: passed
score: 16/16 must-haves verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 5: Budget & Retry Safeguards Verification Report

**Phase Goal:** No paid provider call can ever fire in a way that would exceed the configured monthly budget, and no retry of any kind can bypass that guarantee.
**Verified:** 2026-09-19T14:44:55Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every paid call (LLM, image, video) is preceded by a check that current month-to-date spend plus the estimated cost does not exceed the configured monthly budget, refused with a clear explanation if it would (SC1) | ✓ VERIFIED | `checkBudget` (`src/core/budget/ledger.ts:108-139`) is called at all four real dispatch sites: `director.ts:239`, `check.ts:231`, `generate-images.ts:141`, `generate-video.ts:174`. Each throws `BudgetExceededError` with a two-decimal-formatted message. `check-boundaries.ts` invariant 7 structurally enumerates every legitimate importer of the budget module, run live (8/8 OK). |
| 2 | Changing `MONTHLY_BUDGET_USD` takes effect without a code change (SC2) | ✓ VERIFIED | `monthlyBudgetUsd()` (`month.ts:23-33`) reads `process.env.MONTHLY_BUDGET_USD` on every call, no source literal other than the default. Live-verified by the orchestrator (05-05-SUMMARY.md D7): editing `.env.local` while `npm run dev` stayed running produced a `Reload env: .env.local` server log and the indicator flipped live, with no restart — a first-party, directly-observed result, not an inference. |
| 3 | She can see running month-to-date spend broken down by generation type (video/image/LLM) against the configured limit (SC3) | ✓ VERIFIED | `getBudgetStatus()` (`status.ts`) computes a 3-bucket breakdown from the same rows `checkBudget` enforces against (no `billed` filter, no rounding); `BudgetIndicator.tsx` renders it, wired once above the screen switch in `page.tsx:744`. Live human-check (05-05-SUMMARY.md, "Human Verification — Completed") directly confirmed the indicator visible without scrolling, correct breakdown values ($3.30 video / $1.07 image / $0.70 writing), plain-language labels, and persistence across navigation. |
| 4 | Retrying any failed generation passes through the exact same budget check as a first attempt (SC4 / BUDGET-04) | ✓ VERIFIED | `retry-scene-video.ts:22` calls `generateSceneVideoAction(storyId, sceneNumber)` directly (no second check); `regenerate-scene-image.ts:110` calls `generateSceneImagesAction(...)` directly. Confirmed by direct source read — both are one-line delegations to the identical gated function a first attempt uses, so there is no second budget check to drift out of sync. |
| 5 | Once a scene hits its configured maximum image or video retries, further retries are refused with a clear message rather than looping (SC5 / BUDGET-05) | ✓ VERIFIED | `src/core/retry/caps.ts` / `src/core/approval/gates.ts` unchanged by this phase; confirmed structurally independent of the budget system (`grep` for `core/budget`/`spend-ledger` in both files returns nothing) and `node --test src/core/retry/caps.test.ts src/core/approval/gates.test.ts` passes 36/36 live. |
| 6 | Two overlapping paid calls cannot both pass the budget check against the same stale total — check, call, and spend record are one serialized unit | ✓ VERIFIED | `serializeDispatch` (`dispatch-chain.ts`) is the shared queue; `dispatch-chain.test.ts`'s non-overlap test (a genuine race-condition/ordering invariant) run live and passes: "the second enters only after the first exits." All four dispatch sites wrap check+call+record in exactly one `serializeDispatch` callback (confirmed by source read at each site), and none nests a second call (video's non-reentrancy comment + single call site at `generate-video.ts:394` confirmed). |
| 7 | Every dispatched Story Director / uniqueness-comparison call is recorded the moment it is dispatched, even when the story is never created | ✓ VERIFIED | `recordGenerationAtDispatch` writes with a null `storyId` immediately after the provider call returns (`director.ts`, `check.ts`); `attachGenerationRecordsToStory` links afterward. `create-story.ts` deliberately has no flush on any early-return path (blocked/parse/validation/persistence-failure), each documented in place — confirmed by direct source read. |
| 8 | A story refused for budget reasons reaches her as the same plain-language sentence she sees today | ✓ VERIFIED | `create-story.ts:152-156` — "The monthly generation budget has been reached, so no new story can be created right now." unchanged, confirmed byte-identical by source read. |
| 9 | A budget refusal never consumes one of a scene's limited retry attempts (video) | ✓ VERIFIED | `generate-video.ts:174` (`checkBudget`) is inside a `try` whose `catch` (line 175-195) returns early, before `incrementVideoAttempt` at line 234 is ever reached — deterministic sequential control flow (a thrown error cannot skip past an early `return`), confirmed by direct source read. |
| 10 | The real budget's spend total is $5.0720 — every dollar of Phase 1-4 spend, counted exactly once | ✓ VERIFIED | Live query against `prisma/dev.db`: 40 `GenerationRecord` rows summing to exactly $5.072, one `BudgetPeriod` row of $15.00 — reproduced independently during this verification (`node -e` direct SQLite query), matching the plan's ground truth table and `budget-probe.ts --expect=pass` output ("allocated=$15.00 spent=$5.07 headroom=$9.93 / BUDGET PROBE OK"). |
| 11 | No wife-facing code path reads or writes the retired development ledger any more | ✓ VERIFIED | `grep -rn "lib/spend-ledger" src/app src/core src/components` returns only `historical-import.ts`/`.test.ts` (type-only import for the one-time migration, on `check-boundaries.ts`'s companion allow-list) and comments. `check-boundaries.ts` invariant 7's companion (run live) reports OK. |
| 12 | A future call site importing the budget module or the retired ledger without being added to the enumerated allow-list fails the build | ✓ VERIFIED | `check-boundaries.ts` invariant 7 (and companion) run live: 8/8 invariants OK, confirming the enumerated allow-lists (`ALLOWED_BUDGET_MODULE_IMPORT_PATHS`, `ALLOWED_RETIRED_LEDGER_IMPORT_PATH`) match the real codebase's actual import surface today. |
| 13 | A developer probe script cannot silently add or remove spend from her real budget | ✓ VERIFIED | Ran `node src/scripts/persistence-probe.ts --write` live during this verification; direct SQLite query before/after confirms `GenerationRecord` total unchanged at exactly $5.072 (40 rows). |
| 14 | Every scene's figures the wife sees agree with the figures the gate enforces (no display/enforcement divergence) | ✓ VERIFIED | `status.ts` reuses `ledger.ts`'s own `cumulativeAllocatedUsd`/`cumulativeSpentUsd` functions rather than re-querying, with no `billed` filter and no rounding — confirmed by direct source read; also flagged and confirmed by the independent code review (05-REVIEW.md) as one of its four specifically-scrutinized items. |
| 15 | The current UTC calendar month is credited exactly once as a `BudgetPeriod` row, no matter how many checks run | ✓ VERIFIED | `ensureCurrentMonthAllocation` (`ledger.ts:58-70`) is a single Prisma `upsert` keyed on the unique `month` column; `ledger.test.ts`'s repeat-invocation test passes live (part of the 263/263 `test:lib` run), and the live database independently confirms exactly one `BudgetPeriod` row. |
| 16 | An absent, malformed, zero, or negative `MONTHLY_BUDGET_USD` lands on a safe positive default, never silently disarming the gate | ✓ VERIFIED | `month.test.ts` malformed-value cases (`"abc"`, `""`, `"0"`, `"-5"`, `"Infinity"`, `"NaN"`) and `ledger.test.ts`'s non-positive-allocation rejection case both run live and pass (part of the 263/263 suite). |

**Score:** 16/16 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/budget/month.ts` | env-read monthly figure, month-key/range helpers | ✓ VERIFIED | Present, substantive, unit-tested (13 tests), wired into `ledger.ts`/`status.ts` |
| `src/core/budget/ledger.ts` | SQLite-backed `checkBudget` gate | ✓ VERIFIED | Present, substantive, unit-tested (9 tests), wired into all 5 dispatch/status sites |
| `src/core/budget/dispatch-chain.ts` | shared `serializeDispatch` mutex | ✓ VERIFIED | Present, substantive, unit-tested (5 tests incl. non-overlap), wired into all 4 dispatch actions |
| `src/core/budget/historical-import.ts` | reconciling importer for D-01 carry-forward | ✓ VERIFIED | Present, substantive, unit-tested (incl. real-ledger-file case), one-time script run and self-verified |
| `src/core/budget/status.ts` | server-computed spend figures | ✓ VERIFIED | Present, substantive, unit-tested (8 tests), wired into `get-budget-status.ts` |
| `src/app/actions/get-budget-status.ts` | thin Server Action wrapper | ✓ VERIFIED | Present, `"use server"`, try/catch to safe default, no direct DB import (structural check passes) |
| `src/components/story/BudgetIndicator.tsx` | always-visible spend indicator | ✓ VERIFIED | Present, client component, real `<button>` with `aria-expanded`, rendered once in `page.tsx`, wiring confirmed live |
| `src/app/page.tsx` | indicator wiring + refresh-after-spend | ✓ VERIFIED | `BudgetIndicator` rendered above screen switch; `getBudgetStatusAction` called at mount + 5 spend handlers + poll tick |
| `src/scripts/check-boundaries.ts` | structural import-surface gate (invariant 7) | ✓ VERIFIED | Present, run live: 8/8 invariants OK |
| `src/scripts/budget-probe.ts` | zero-cost real-DB probe | ✓ VERIFIED | Present, run live: `BUDGET PROBE OK`, figures match ground truth |
| `src/scripts/import-historical-spend.ts` | one-time carry-forward script | ✓ VERIFIED | Present, already run for real (per 05-02-SUMMARY.md), idempotency re-confirmed structurally |
| `prisma/schema.prisma` (`BudgetPeriod` model, nullable `storyId`) | schema changes | ✓ VERIFIED | `npx prisma migrate status` reports schema up to date; live query confirms `BudgetPeriod` table and nullable `storyId` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `checkBudget` | 4 real dispatch sites | direct `await checkBudget(...)` call | ✓ WIRED | Confirmed at `director.ts:239`, `check.ts:231`, `generate-images.ts:141`, `generate-video.ts:174` |
| `serializeDispatch` | 4 real dispatch sites | wraps check+call+record | ✓ WIRED | Confirmed one call site per file, none nested |
| `recordGenerationAtDispatch`/`recordGeneration` | `GenerationRecord` table | Prisma writes | ✓ WIRED | Confirmed by source read + live DB query (40 rows, $5.072) |
| `regenerate-scene-image.ts` / `retry-scene-video.ts` | `generateSceneImagesAction` / `generateSceneVideoAction` | direct delegation | ✓ WIRED | Confirmed — identical function call, not a copy |
| `generate-all-videos.ts` (batch) | `generateSceneVideoAction` | `runBatchVideoDispatch`'s injected `dispatch` | ✓ WIRED | Confirmed — batch path also goes through the single gated function |
| `getBudgetStatus` | `getBudgetStatusAction` | direct call | ✓ WIRED | Confirmed, `"use server"`, no direct DB import |
| `getBudgetStatusAction` | `BudgetIndicator` | prop passed from `page.tsx` state | ✓ WIRED | Confirmed, fetched on mount + refreshed after every spend handler |
| `GenerationRecord.generationType` | video/image/writing breakdown | `groupBy` in `status.ts` | ✓ FLOWING | Confirmed via live query returning real per-type figures matching the plan's `<done>` criterion |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `BudgetIndicator` | `status.remainingUsd`, `status.breakdown` | `getBudgetStatusAction()` → `getBudgetStatus()` → live `GenerationRecord`/`BudgetPeriod` Prisma queries | Yes — reproduced live: $9.93 remaining of $15.00, $3.30/$1.07/$0.70 split | ✓ FLOWING |
| `get-story-status.ts`'s `budgetExceeded` flag | Video Status screen's refusal signal | `checkBudget(MAX_SCENE_VIDEO_COST_USD)` against the real budget | Yes — one probe per invocation, not per scene | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Structural import-surface gate | `node src/scripts/check-boundaries.ts` | 8/8 "OK" lines, no BOUNDARY CHECK FAILED | ✓ PASS |
| Full budget/retry test suite | `npm run test:lib` | 263/263 pass, 0 fail | ✓ PASS |
| Race-condition (non-overlap) invariant | `node --test src/core/budget/dispatch-chain.test.ts` | 5/5 pass, incl. "never overlap" test | ✓ PASS |
| Budget-status figures | `node --test src/core/budget/status.test.ts src/core/budget/month.test.ts src/core/budget/ledger.test.ts src/core/budget/historical-import.test.ts` | 39/39 pass | ✓ PASS |
| Uniqueness budget-refusal behavior | `node --test src/core/uniqueness/check.test.ts` | 23/23 pass, incl. live-observed "refused by the monthly budget — treating as a pass, not a collision" | ✓ PASS |
| Retry-cap independence | `node --test src/core/retry/caps.test.ts src/core/approval/gates.test.ts` | 36/36 pass | ✓ PASS |
| Zero-cost real-DB probe | `node --env-file=.env.local src/scripts/budget-probe.ts --expect=pass` | `BUDGET PROBE: month=2026-09 allocated=$15.00 spent=$5.07 headroom=$9.93 / BUDGET PROBE OK` | ✓ PASS |
| Real database totals | direct SQLite query | 40 rows / $5.072 GenerationRecord, 1 row / $15.00 BudgetPeriod | ✓ PASS |
| Type check | `npm run typecheck` | clean, zero `error TS` | ✓ PASS |
| Production build | `npm run build` | "Compiled successfully" | ✓ PASS |
| Migration state | `npx prisma migrate status` | "Database schema is up to date!" (4 migrations) | ✓ PASS |
| Probe-script spend-corruption guard | `node src/scripts/persistence-probe.ts --write` | Spend total unchanged before/after ($5.072/40 rows) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| BUDGET-01 | 05-01, 05-02, 05-03, 05-04 | Pre-flight budget check on every paid call, refused with clear explanation | ✓ SATISFIED | All 4 dispatch sites re-pointed and live-verified |
| BUDGET-02 | 05-01, 05-03 | Configurable limit, enforced without a code change | ✓ SATISFIED | `month.ts` env-read + live orchestrator env-reload confirmation |
| BUDGET-03 | 05-05 | Wife-visible month-to-date spend by type against limit | ✓ SATISFIED | `status.ts`/`BudgetIndicator.tsx`, live human-check confirmed |
| BUDGET-04 | 05-04, 05-05 | Retry passes through the same budget check | ✓ SATISFIED | Structural delegation confirmed at both retry entry points |
| BUDGET-05 | 05-05 | Configurable max retries, refused with clear message | ✓ SATISFIED | Pre-existing mechanism (`caps.ts`/`gates.ts`) confirmed independent and unchanged |

No orphaned requirements — `.planning/REQUIREMENTS.md`'s traceability table maps exactly BUDGET-01 through BUDGET-05 to Phase 5, and all five appear in at least one plan's `requirements:` frontmatter.

### Anti-Patterns Found

None. Scanned all phase-touched source files (`src/core/budget/*.ts`, the four re-pointed Server Actions, `director.ts`, `check.ts`, `generation-repository.ts`, `BudgetIndicator.tsx`, `check-boundaries.ts`, `budget-probe.ts`, `import-historical-spend.ts`) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/"not yet implemented"/empty-implementation patterns — zero matches.

### Code Review Findings (05-REVIEW.md, independently read)

0 Critical, 5 Warnings, 2 Info. 3 Warnings fixed immediately (`BudgetExceededError.name`, `check-boundaries.ts`'s dynamic-import/re-export scan gap, `page.tsx`'s hand-maintained empty-status cross-reference comment) and re-verified (263/263 tests, typecheck, build, 8/8 invariants all still pass after the fixes). 2 Warnings deliberately deferred to Phase 6 (Reliability, Secrets Hygiene & Output Correctness) with documented rationale: WR-01 (no internal timeout on the shared dispatch queue — a reliability/resilience concern, not a budget-correctness one) and WR-04 (a documented, intentional duplication of the worst-case video price constant across two files, guarded by invariant 5's single-dispatch-point design). Neither defers anything that would let a paid call bypass the budget or let a retry bypass the check — both are about robustness under failure modes Phase 6 owns, not about the phase 5 goal itself.

### Human Verification (Already Completed)

Per this task's required reading, `05-05-SUMMARY.md`'s "Human Verification — Completed" section records a live browser verification the orchestrator performed directly against the running dev app, covering all 7 items from `05-05-PLAN.md` Task 3's `<human-check>` block:

1. Indicator visible without scrolling, reads "$9.93 left of $15.00" — **Pass**
2. Expanded breakdown shows Video $3.30 / Images $1.07 / Story writing $0.70 plus month allocation/spend — **Pass**
3. Plain-language labels, no enum names/model ids/"LLM" — **Pass**
4. Collapse + keyboard reachability — **Pass**; keyboard *operability* — **qualified pass**, disclosed honestly: a live synthetic Enter/Space keypress could not be triggered through the browser-automation tool used, but the button is confirmed via source inspection to be a standards-compliant native `<button type="button">` with a single `onClick` and no key-event interception (the pattern real browsers activate on Enter/Space without any app code), and a direct `element.click()` on the same focused element did work. This is a disclosed tooling limitation, not an unresolved gap — treated here as genuine, already-investigated evidence per this task's instructions, not routed to a new human-verification item.
5. Indicator persists after navigating to My Stories and back — **Pass**
6. Env-reload (Assumption A1) settled as **YES** — live server log (`Reload env: .env.local`) plus indicator flipping without restart — **Pass**
7. Figure restored, indicator confirmed back to $9.93/$15.00 — **Pass**

No item genuinely failed. Nothing here requires a new human-verification item.

### Gaps Summary

None. All 5 ROADMAP success criteria, all 5 BUDGET requirements, and every plan-level must-have (truths, artifacts, key links) are verified either by direct code inspection backed by passing automated tests (263/263 in `npm run test:lib`, including the specific race-condition/ordering-invariant test for the serialized dispatch queue), by live commands re-run during this verification (`check-boundaries.ts` 8/8, `budget-probe.ts` OK, `typecheck`/`build` clean, direct SQLite queries confirming the real database's spend and allocation totals), or by the already-completed live human-check documented in `05-05-SUMMARY.md`. The independent code review found zero critical defects; its two deferred warnings are reliability-hardening items correctly scoped to Phase 6, not gaps in Phase 5's own goal.

---

_Verified: 2026-09-19T14:44:55Z_
_Verifier: Claude (gsd-verifier)_
