---
phase: 05-budget-retry-safeguards
plan: 01
subsystem: budget
tags: [prisma, sqlite, budget, money, node-test]

# Dependency graph
requires:
  - phase: 03-persistence-uniqueness
    provides: GenerationRecord (estimatedUsd/billed/generationType/createdAt), Prisma/SQLite persistence, injectable-client test convention
  - phase: 04-approval-retries
    provides: src/core/retry/caps.ts's env-var-with-safe-default pattern (maxSceneRetryAttempts), which monthlyBudgetUsd mirrors
provides:
  - src/core/budget/month.ts (monthlyBudgetUsd, currentMonthKey, monthRange)
  - src/core/budget/ledger.ts (BudgetExceededError, ensureCurrentMonthAllocation, cumulativeAllocatedUsd, cumulativeSpentUsd, checkBudget)
  - BudgetPeriod Prisma model + migration 20260919032726_phase5_budget_period
  - src/scripts/budget-probe.ts (zero-cost real-database CLI probe)
  - get-story-status.ts re-pointed to the real budget gate
  - Decision A=A1 and Decision B=B1 recorded (below) for plans 05-02/05-04
affects: [05-02-migrate-historical-spend, 05-03-repoint-llm-sites, 05-04-repoint-image-video-sites, 05-05-spend-visibility]

# Actuals (#2632)
actuals:
  tokens: 8163
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-month BudgetPeriod allocation rows, summed cumulatively against GenerationRecord's cumulative spend -- rollover falls out of SUM() rather than a stored running balance"
    - "ensureCurrentMonthAllocation's upsert OVERWRITES the current month's allocatedUsd on every call (not an empty update clause) so a lowered MONTHLY_BUDGET_USD takes effect immediately -- deliberate correction to 05-RESEARCH.md's worked snippet"
    - "checkBudget mirrors checkCeiling's exact fail-closed order: validate estimate -> credit month -> read cumulative figures -> validate allocation -> inclusive-boundary compare -> throw BudgetExceededError (never a boolean)"

key-files:
  created:
    - src/core/budget/month.ts
    - src/core/budget/month.test.ts
    - src/core/budget/ledger.ts
    - src/core/budget/ledger.test.ts
    - src/scripts/budget-probe.ts
    - prisma/migrations/20260919032726_phase5_budget_period/migration.sql
  modified:
    - prisma/schema.prisma
    - src/app/actions/get-story-status.ts
    - src/scripts/check-boundaries.ts
    - package.json

key-decisions:
  - "Decision A = A1: keep a small, separate, explicitly-labelled developer ceiling for the probe scripts (see Decisions Recorded below)"
  - "Decision B = B1: import only the 26 unpaired historical ledger entries, storyId relaxed to nullable (see Decisions Recorded below)"
  - "ensureCurrentMonthAllocation's upsert sets allocatedUsd on both create AND update, correcting 05-RESEARCH.md's empty-update snippet, so a mid-month budget change is not silently ignored"
  - "check-boundaries.ts invariant 1 extended to forbid a \"use client\" file from importing src/core/budget/, mirroring the existing core/persistence entry, so the threat model's T-05-02 claim is structurally enforced, not just documented"

patterns-established:
  - "src/core/budget/ is a second sanctioned database-touching core module alongside src/core/persistence/ -- Server Actions reach it directly (not through persistence), same shape check-boundaries.ts invariant 3 already expects"

requirements-completed: [BUDGET-01, BUDGET-02]

coverage:
  - id: D1
    description: "Real SQLite-backed pre-flight budget check refuses a call whose projected cumulative spend would exceed cumulative allocated budget, throwing BudgetExceededError rather than returning a boolean"
    requirement: "BUDGET-01"
    verification:
      - kind: unit
        ref: "src/core/budget/ledger.test.ts#checkBudget rejects with BudgetExceededError one cent past the boundary, message contains allocation/spent/estimate to two decimals"
        status: pass
      - kind: unit
        ref: "src/core/budget/ledger.test.ts#checkBudget resolves at the exact inclusive boundary (spend 14.60 + estimate 0.40 against an allocation of 15.00)"
        status: pass
    human_judgment: false
  - id: D2
    description: "MONTHLY_BUDGET_USD is read from the environment on every call, with a safe positive default on absent/malformed/zero/negative input -- no source-literal dollar figure other than the default"
    requirement: "BUDGET-02"
    verification:
      - kind: unit
        ref: "src/core/budget/month.test.ts#monthlyBudgetUsd malformed-value cases (abc, \"\", 0, -5, Infinity, NaN)"
        status: pass
      - kind: unit
        ref: "src/core/budget/ledger.test.ts#ensureCurrentMonthAllocation re-run with a different configured figure updates the current month's allocation (BUDGET-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Each UTC calendar month is credited exactly once as a BudgetPeriod row no matter how many checks run, via a unique-key upsert"
    verification:
      - kind: unit
        ref: "src/core/budget/ledger.test.ts#ensureCurrentMonthAllocation called three times in a row leaves exactly one BudgetPeriod row for that month"
        status: pass
    human_judgment: false
  - id: D4
    description: "The Video Status screen's budget-exhausted signal is computed from the real SQLite-backed budget (one probe per invocation, not per scene), not the throwaway dev ledger file"
    verification:
      - kind: unit
        ref: "node -e REPOINT check (see 05-01-PLAN.md Task 1 verify) -- get-story-status.ts imports core/budget/ledger, no lib/spend-ledger import remains"
        status: pass
      - kind: other
        ref: "npm run typecheck"
        status: pass
    human_judgment: false
  - id: D5
    description: "The real database, driven end-to-end by a zero-cost CLI probe, reports real figures ($15.00 allocated, $2.1350 spent) and correctly allows a $0.40 call, with zero dollars spent proving it"
    verification:
      - kind: other
        ref: "node src/scripts/budget-probe.ts --expect=pass"
        status: pass
      - kind: other
        ref: "real-ledger + dev-ledger-stability node -e checks (05-01-PLAN.md Task 2 verify)"
        status: pass
    human_judgment: false

# Metrics
duration: 20min
completed: 2026-09-19
status: complete
---

# Phase 05 Plan 01: Real Budget Gate Summary

**SQLite-backed per-month budget gate (`src/core/budget/`) with rollover-safe cumulative enforcement, wired live to the Video Status screen's headroom probe at zero real cost**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-19T03:19:29Z
- **Completed:** 2026-09-19T03:33:17Z
- **Tasks:** 3 (Task 1 tracer, Task 2 probe script, Task 3 decision recording)
- **Files modified:** 10 (6 created, 4 modified)

## Accomplishments

- `src/core/budget/month.ts` / `ledger.ts`: the real, SQLite-backed monthly budget gate — `monthlyBudgetUsd` (env-read, safe-default, never a source literal), `ensureCurrentMonthAllocation` (idempotent per-month crediting via a unique-key upsert), and `checkBudget` (fail-closed, inclusive-boundary, throws `BudgetExceededError`)
- New `BudgetPeriod` Prisma model + migration `20260919032726_phase5_budget_period`, applied and verified against `prisma/dev.db`
- `get-story-status.ts`'s Video Status headroom probe re-pointed from the throwaway dev ledger to the real gate, hoisted to run once per invocation instead of once per scene
- `src/scripts/budget-probe.ts`: a zero-cost CLI probe proving the real database reports real figures ($15.00 allocated, $2.1350 spent) and correctly allows a $0.40 call
- `check-boundaries.ts` invariant 1 extended so a "use client" file importing `src/core/budget/` is structurally caught, matching the existing `core/persistence` guarantee
- Decision A and Decision B (Task 3) recorded below, unblocking plans 05-02 and 05-04

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "the real budget gate refuses a call"** — `9589d0a` (feat)
2. **Task 2: Prove the gate is armed against the real database, with no paid call** — `e3cdc1f` (test)
3. **Task 3: Two real-money decisions** — no code changes; decisions recorded below and in this file (per the plan's own `<action>`, which requires only that the answers be written into this SUMMARY)

**Plan metadata:** committed together with STATE.md/ROADMAP.md at plan close (see final commit below)

## Files Created/Modified

- `src/core/budget/month.ts` - `monthlyBudgetUsd`/`currentMonthKey`/`monthRange`, env-var-with-safe-default, zero I/O
- `src/core/budget/month.test.ts` - 13 tests covering defaults, malformed inputs, month-key derivation, month ranges
- `src/core/budget/ledger.ts` - `BudgetExceededError`, `ensureCurrentMonthAllocation`, `cumulativeAllocatedUsd`, `cumulativeSpentUsd`, `checkBudget`
- `src/core/budget/ledger.test.ts` - 9 tests covering idempotent crediting, rollover, both boundaries, malformed-input fail-closed cases, conservative (unbilled) accounting
- `prisma/schema.prisma` - `model BudgetPeriod` added
- `prisma/migrations/20260919032726_phase5_budget_period/migration.sql` - `CREATE TABLE BudgetPeriod` + unique index on `month`
- `src/app/actions/get-story-status.ts` - re-pointed to `checkBudget`, probe hoisted out of the per-scene `.map()`
- `src/scripts/check-boundaries.ts` - invariant 1 extended to also forbid a client file importing `core/budget`
- `package.json` - `test:lib` now includes `month.test.ts`/`ledger.test.ts`
- `src/scripts/budget-probe.ts` - developer-only `--expect=pass|refuse` CLI probe, zero provider calls

## Decisions Made

- **`ensureCurrentMonthAllocation`'s upsert overwrites `allocatedUsd` on the `update` clause, not an empty `update: {}`** (05-RESEARCH.md's worked snippet used an empty update). Rationale: an empty update means a month first touched before the requester edits his figure keeps a stale allocation for the whole month once he does edit it — over-allocating real money and defeating BUDGET-02. Overwriting keeps past months frozen (never re-touched after the month rolls over) while the current month always reflects what's configured right now.
- **The "resolved cumulative allocation is not positive finite" test uses a corrupted PAST-month row (large negative `allocatedUsd`) rather than a literal `0` row**, because `ensureCurrentMonthAllocation`'s mandated always-overwrite behavior guarantees the current month's own credit is always a valid positive figure (minimum the $15 default) — a single `0` auxiliary row for any month can never drag the cumulative sum to non-positive on its own. A negative stale-month row (simulating a hand-corrupted database value, matching `checkCeiling`'s own CR-01 precedent of validating on-disk data) is the only way to reach that branch, and exercises the identical `!Number.isFinite(allocated) || allocated <= 0` fail-closed path.
- **`check-boundaries.ts` invariant 1 extended to check for a `"core/budget"` import specifier** (Rule 2 — auto-added missing critical functionality). The plan's own `ledger.ts` header comment and the threat model's T-05-02 mitigation both assert "invariant 1 ... forbids any use client file from importing it" as a structural guarantee; without this addition that guarantee would only have been true by accident (no client file happens to import it yet), not by construction. Mirrors the existing `"core/persistence"` entry's WR-03 rationale exactly.

## Decisions Recorded (Task 3 — pre-answered this session, not inferred)

Both decisions below were answered directly by the requester (not his wife) in this session, before this plan was dispatched, and are recorded here verbatim per the plan's Task 3 `<action>` so plans 05-02 and 05-04 can read them.

### Decision A — fate of the developer testing ceiling (`DEV_CEILING_USD`) and the CLI probe scripts

**Answer: A1** — keep a small, separate, explicitly-labelled developer ceiling for the probe scripts.

**Rationale (from the plan's own recommendation, confirmed by the requester):** a future failure-injection session (Phase 6) cannot silently eat the wife's real monthly allowance, and the cross-process race a single in-process mutex cannot close (a probe script running beside `npm run dev`) stays confined to money deliberately set aside for testing. Two of the four scripts (`story-probe.ts`, `uniqueness-probe.ts`) reach the model through shared core functions plans 05-03/05-04 put on the real budget regardless of this choice — A1's protection is narrower than "developer testing never touches her money", but it is still the correct choice for `smoke-test.ts`'s direct-provider calls and any future direct-provider testing. Plan 05-04 implements this and adds the guard requiring `persistence-probe.ts` to leave cumulative spend exactly as it found it.

### Decision B — how the $5.0720 of Phase 1-4 development spend (D-01) is carried forward

**Answer: B1** — import only the 26 unpaired ledger entries (the ones with no matching `GenerationRecord` row), with `GenerationRecord.storyId` relaxed to nullable.

**Rationale (from the plan's own recommendation, confirmed by the requester):** the dev ledger holds 40 entries totalling $5.0720; `prisma/dev.db` already holds 14 matching `GenerationRecord` rows ($2.1350) from Phase 3's dual-write. Importing all 40 would double-count and silently take $2.135 of real headroom away from her. Importing only the 26 unpaired entries ($2.9370 — $0.7370 image, $1.7000 video, $0.5000 story), selected by a reconciling pass matching on type/model/amount/timestamp, reaches exactly $5.0720 with full per-call detail preserved. `storyId` is relaxed to nullable (mirroring `sceneId String?`'s existing pattern) because these Phase 1-2 probe calls genuinely belong to no story; live code paths keep writing a real story id. Plan 05-02 implements this exactly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Extended `check-boundaries.ts` invariant 1 to check for `"core/budget"` import specifiers**
- **Found during:** Task 1
- **Issue:** `ledger.ts`'s own header comment and the threat model's T-05-02 mitigation both claim invariant 1 "still forbids any use client file from importing it" — but invariant 1's actual code only checked `"core/persistence"` as the one-hop-away persistence-module substring, not `"core/budget"`. Without the addition, a future client file importing `src/core/budget/ledger.ts` directly would ship real-budget-enforcement/database-access code into the browser bundle undetected — exactly the class of regression invariant 1 exists to catch.
- **Fix:** Added a `spec.includes("core/budget")` check to invariant 1's offender list, mirroring the existing `"core/persistence"` (WR-03) entry and its rationale.
- **Files modified:** `src/scripts/check-boundaries.ts`
- **Verification:** `node src/scripts/check-boundaries.ts` reports all six invariants OK (no offenders currently, since no client file imports it yet — the check is now structurally present for when one might).
- **Committed in:** `9589d0a` (Task 1 commit)

**2. [Rule 1 - Test correctness] The "resolved cumulative allocation is not a positive finite number" test seeds a corrupted PAST-month row with a large negative `allocatedUsd`, not a literal `0` row**
- **Found during:** Task 1 (writing `ledger.test.ts`)
- **Issue:** The plan's behavior spec describes seeding "a BudgetPeriod row whose allocatedUsd is 0" to trigger this rejection branch. Given the plan's own mandated `ensureCurrentMonthAllocation` design (always overwrites the CURRENT month's allocation to a valid positive figure, minimum the $15 default, on every call including the one inside `checkBudget` itself), a single `0` row for any month can never make the cumulative sum non-positive — the current month's own credit alone is always >= the default.
- **Fix:** Seeded a stale, already-past month with a large negative `allocatedUsd` (`-1000`) instead, which correctly drags the cumulative sum below zero despite the current month's guaranteed-positive credit, exercising the exact same `!Number.isFinite(allocated) || allocated <= 0` fail-closed branch the plan intends to prove.
- **Files modified:** `src/core/budget/ledger.test.ts`
- **Verification:** `node --test src/core/budget/ledger.test.ts` — the test passes and genuinely exercises the rejection branch (confirmed by temporarily reverting the branch's guard and observing the test fail, then restoring it).
- **Committed in:** `9589d0a` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical / security, 1 test-correctness fix to a mathematically unreachable literal spec)
**Impact on plan:** Both fixes necessary for the plan's own stated guarantees to actually hold under test. No scope creep — both stay entirely within Task 1's files.

## Issues Encountered

- `npx prisma migrate dev` applied the migration but did not regenerate the Prisma client's TypeScript types in this environment (`src/generated/prisma` lacked `BudgetPeriod` until `npx prisma generate` was run explicitly afterward) — resolved by running `npx prisma generate` before writing/running the tests; not a plan deviation, just an extra local step.

## User Setup Required

None - no external service configuration required. `MONTHLY_BUDGET_USD` is optional (defaults to $15) and, when the requester wants a different figure, is a plain `.env.local` edit — no dashboard, no new credential.

## Next Phase Readiness

- The real budget gate is live end-to-end on one path (Video Status screen) at zero real cost, proven against real data ($15.00 allocated, $2.1350 spent, a $0.40 call correctly allowed).
- Decision A (A1) and Decision B (B1) are recorded above — plan 05-02 (historical spend migration) and plan 05-04 (repoint image/video sites + probe-script fate) can proceed exactly as written, no further human input needed for those two decisions.
- `src/core/budget/ledger.ts`'s exported surface (`checkBudget`, `ensureCurrentMonthAllocation`, `cumulativeAllocatedUsd`, `cumulativeSpentUsd`, `BudgetExceededError`) is ready for plan 05-03 (LLM call sites) and 05-04 (image/video call sites) to import in place of `checkCeiling`/`recordSpend`.
- No blockers.

## Self-Check: PASSED

All 6 created files confirmed present on disk; both task commits (`9589d0a`, `e3cdc1f`) confirmed in `git log`.

---
*Phase: 05-budget-retry-safeguards*
*Completed: 2026-09-19*
