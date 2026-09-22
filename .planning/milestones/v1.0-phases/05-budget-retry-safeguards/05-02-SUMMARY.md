---
phase: 05-budget-retry-safeguards
plan: 02
subsystem: budget
tags: [prisma, sqlite, budget, money, node-test, migration]

# Dependency graph
requires:
  - phase: 05-budget-retry-safeguards (plan 01)
    provides: src/core/budget/ledger.ts's checkBudget/ensureCurrentMonthAllocation/cumulativeAllocatedUsd/cumulativeSpentUsd, BudgetPeriod model, Decision B = B1 (import only the 26 unpaired entries, storyId relaxed to nullable)
  - phase: 03-persistence-uniqueness
    provides: GenerationRecord (estimatedUsd/billed/generationType/createdAt/message), Prisma/SQLite persistence, injectable-client test convention
provides:
  - src/core/budget/historical-import.ts (CARRIED_FORWARD_MESSAGE, generationTypeForCall, selectUnrecordedEntries, toPendingRecord)
  - src/scripts/import-historical-spend.ts (one-time carry-forward operator script, --dry-run supported)
  - GenerationRecord.storyId relaxed to nullable + migration 20260919034131_phase5_historical_spend
  - The real database now holding all of D-01's Phase 1-4 spend: 40 GenerationRecord rows, $5.0720 total, 26 with a null storyId ($2.9370)
  - Confirmed running-system figures for D-01: $15.00 allocated, $5.0720 spent, $9.9280 remaining
affects: [05-03-repoint-llm-sites, 05-04-repoint-image-video-sites, 05-05-spend-visibility]

# Actuals (#2632)
actuals:
  tokens: 7240
  tasks: 3
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reconciling importer pattern: a pure, database-free module (historical-import.ts) decides WHAT to import; a separate one-time script (import-historical-spend.ts) does the actual I/O and self-verifies its own totals before exiting -- keeps the money-critical matching logic fully unit-testable without a database"
    - "A one-time money-accounting migration script must NOT go through a best-effort-by-contract write function (recordGeneration) -- it writes through prisma.$transaction directly so a partial failure never silently under-counts real spend"
    - "Idempotency for a real-money migration is enforced by a count-based guard at the top of the script (count of CARRIED_FORWARD_MESSAGE rows > 0 => refuse), not by re-deriving state each run"

key-files:
  created:
    - src/core/budget/historical-import.ts
    - src/core/budget/historical-import.test.ts
    - src/scripts/import-historical-spend.ts
    - prisma/migrations/20260919034131_phase5_historical_spend/migration.sql
  modified:
    - prisma/schema.prisma
    - package.json

key-decisions:
  - "GenerationRecord.storyId relaxed from required to nullable (mirrors sceneId's existing nullable pattern) -- confined to the one-time historical-import script; every live write path still supplies a real story id, confirmed by an unchanged generation-repository.ts"
  - "selectUnrecordedEntries discards any existing row already carrying CARRIED_FORWARD_MESSAGE before matching, so a previously-imported row can never be mistaken for independent evidence some other entry was recorded elsewhere -- defense-in-depth behind the script's own top-level refuse-to-run-twice guard"
  - "toPendingRecord sets ok equal to the entry's own billed value, per this codebase's established conservative-accounting convention (a blocked call is exactly a call that produced no usable output and was recorded unbilled)"

patterns-established:
  - "One-time real-money migration scripts self-verify their own post-write totals and exit 1 loudly on any mismatch, rather than trusting the write succeeded"

requirements-completed: [BUDGET-01]

coverage:
  - id: D1
    description: "The reconciling importer resolves generation type from the call-field prefix (throwing on an unrecognised one) and selects exactly the 26 ledger entries with no matching GenerationRecord row, leaving the 14 already-recorded ones untouched"
    requirement: "BUDGET-01"
    verification:
      - kind: unit
        ref: "src/core/budget/historical-import.test.ts#generationTypeForCall maps every real call prefix to its GenerationType"
        status: pass
      - kind: unit
        ref: "src/core/budget/historical-import.test.ts#generationTypeForCall throws on an unrecognised prefix rather than guessing"
        status: pass
      - kind: unit
        ref: "src/core/budget/historical-import.test.ts#against the real ledger file, feeding all 40 real entries and the real 14-row existing population returns exactly 26 unrecorded entries totalling $2.9370"
        status: pass
    human_judgment: false
  - id: D2
    description: "The real one-time carry-forward run wrote exactly 26 new GenerationRecord rows (null storyId, original ledger timestamps preserved) through a single transaction, bringing prisma/dev.db to 40 rows totalling $5.0720"
    requirement: "BUDGET-01"
    verification:
      - kind: other
        ref: "node src/scripts/import-historical-spend.ts --dry-run (26 entries reported, matches ground-truth table exactly)"
        status: pass
      - kind: other
        ref: "node src/scripts/import-historical-spend.ts (real run) -- printed CARRY FORWARD OK -- 40 rows, $5.0720 total."
        status: pass
      - kind: other
        ref: "node -e RECONCILE check (05-02-PLAN.md Task 2 verify) -- 40 rows / $5.0720, 26 null-storyId rows / $2.9370 split 11 IMAGE/$0.7370, 5 VIDEO/$1.7000, 10 STORY/$0.5000"
        status: pass
    human_judgment: false
  - id: D3
    description: "A second invocation of the import script refuses to write again and leaves the database unchanged, and the dev ledger file on disk remains byte-identical throughout"
    verification:
      - kind: other
        ref: "second `node src/scripts/import-historical-spend.ts` run -- printed \"carry-forward has already happened\", row count/total unchanged"
        status: pass
      - kind: other
        ref: "sha256 checksum of storage/_smoketest/spend-ledger.json compared before and after the real run -- identical (ac5aa29b3dcd86221f745179077f3fb2f39444da2fcb476ec8cb78d43e4e368f)"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-01's promised headroom is real: the probe reports $15.00 allocated, $5.0720 spent, $9.9280 remaining, and a configured budget below the already-spent total produces a genuine refusal (not an assumption)"
    requirement: "BUDGET-01"
    verification:
      - kind: other
        ref: "node src/scripts/budget-probe.ts --expect=pass -- BUDGET PROBE: month=2026-09 allocated=$15.00 spent=$5.07 headroom=$9.93 / BUDGET PROBE OK"
        status: pass
      - kind: other
        ref: "MONTHLY_BUDGET_USD=1 node src/scripts/budget-probe.ts --expect=refuse -- real refusal observed and reported, allocation restored to $15.00/1 BudgetPeriod row afterward"
        status: pass
      - kind: other
        ref: "node -e HEADROOM check (05-02-PLAN.md Task 3 verify) -- HEADROOM 9.9280 OF 15.00"
        status: pass
      - kind: other
        ref: "npm run test:lib -- 245 tests pass, 0 fail; check-boundaries.ts reports all 6 invariants OK"
        status: pass
    human_judgment: false

# Metrics
duration: 35min
completed: 2026-09-19
status: complete
---

# Phase 05 Plan 02: Real Historical Spend Carry-Forward Summary

**D-01's $2.9370 of unrecorded Phase 1-2 dev spend imported into GenerationRecord via a reconciling importer, bringing the real database to exactly $5.0720 total and $9.9280 of real remaining headroom**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-19T03:41:00Z
- **Completed:** 2026-09-19T04:16:00Z
- **Tasks:** 3 (Task 1 reconciling importer, Task 2 real carry-forward run, Task 3 headroom confirmation)
- **Files modified:** 6 (5 created, 2 modified: `prisma/schema.prisma`, `package.json`)

## Accomplishments

- `src/core/budget/historical-import.ts`: pure, database-free reconciliation logic (`generationTypeForCall`, `selectUnrecordedEntries`, `toPendingRecord`, `CARRIED_FORWARD_MESSAGE`) that tells an already-counted ledger entry from a missing one by matching type + model + amount (within $0.0001) + timestamp (within 5s)
- `GenerationRecord.storyId` relaxed to nullable (migration `20260919034131_phase5_historical_spend`), confirmed additive — the 14 pre-existing rows survived the redefine-table migration with their $2.1350 total intact
- `src/scripts/import-historical-spend.ts` run for real against `prisma/dev.db`: wrote exactly 26 new rows through a single transaction, self-verified 40 rows / $5.0720 total, and confirmed a second invocation correctly refuses to write again
- `node src/scripts/budget-probe.ts --expect=pass` confirms the three figures D-01 promised are now real: **$15.00 allocated, $5.0720 spent, $9.9280 remaining**
- A real, non-assumed negative-direction proof: `MONTHLY_BUDGET_USD=1` produced a genuine refusal, and the current month's allocation was restored to $15.00 (1 `BudgetPeriod` row) afterward
- `storage/_smoketest/spend-ledger.json` confirmed byte-identical (sha256 match) before and after the real run — the dev ledger was never touched
- Full suite green: `npm run test:lib` — 245 tests pass, 0 fail, all 6 `check-boundaries.ts` invariants OK

## Task Commits

Each task was committed atomically:

1. **Task 1: A reconciling importer that can tell an already-counted call from a missing one** — `9c85dad` (test)
2. **Task 2: Run the carry-forward once, for real, against the real database** — `cd97700` (feat)
3. **Task 3: Confirm the headroom D-01 actually promised** — no code changes; verification and figure recording only, captured in this SUMMARY per the plan's own `<output>` instruction

**Plan metadata:** committed together with STATE.md/ROADMAP.md at plan close (see final commit below)

## Files Created/Modified

- `src/core/budget/historical-import.ts` - `CARRIED_FORWARD_MESSAGE`, `generationTypeForCall`, `selectUnrecordedEntries`, `toPendingRecord` — pure reconciliation logic, zero I/O
- `src/core/budget/historical-import.test.ts` - 9 tests: prefix mapping, unrecognised-prefix throw, matching/non-matching timestamp/amount/model cases, marker-message discard, empty-result case, and the real-ledger-file 26/$2.9370 proof
- `prisma/schema.prisma` - `GenerationRecord.storyId` and its `story` relation made optional
- `prisma/migrations/20260919034131_phase5_historical_spend/migration.sql` - SQLite table redefinition making `storyId` nullable, additive (verified: 14 existing rows survived intact)
- `src/scripts/import-historical-spend.ts` - one-time operator script: refuse-to-run-twice guard, `--dry-run` support, transaction-wrapped write, self-verifying post-write assertions
- `package.json` - `test:lib` now includes `historical-import.test.ts`

## Decisions Made

- **`GenerationRecord.storyId` relaxed to nullable, confined strictly to this one-time script** — mirrors the existing `sceneId String?` pattern; `generation-repository.ts` (every live write path) was left completely unchanged, confirmed by `npm run typecheck` passing clean and by a direct grep showing no other file constructs a `GenerationRecord` write.
- **`selectUnrecordedEntries` discards existing rows already carrying `CARRIED_FORWARD_MESSAGE` from its candidate pool before matching** — a defense-in-depth property (the function's output stays deterministic even if called again after a prior import wrote marker rows), backing but not replacing the script's own top-level "count of carried-forward rows > 0 => refuse" guard.
- **The import script writes through `prisma.$transaction` directly, never `recordGeneration`** — `recordGeneration` is best-effort by contract (catches and logs, never throws), which is correct for a durability dual-write beside an already-paid-for asset but wrong for a one-time money-accounting migration where a silently skipped row would understate real spend forever.

## Deviations from Plan

None — plan executed exactly as written. Every real command in the plan's `<verify>` blocks was run for real (not simulated) and produced the exact figures the plan's `<data_ground_truth>` table specified: 26 entries / $2.9370, split 11 IMAGE ($0.7370) / 5 VIDEO ($1.7000) / 10 STORY ($0.5000), last unpaired timestamp `2026-09-12T19:42:24.852Z`.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. This plan touched only the local SQLite database and a git-tracked source tree.

## Next Phase Readiness

- The real budget system's spend total is now genuinely $5.0720 — every dollar of Phase 1-4 development spend, counted exactly once, each retaining its own type/model/amount/date.
- Her real remaining headroom is confirmed as $9.9280 of $15.00 — plans 05-03 (LLM call sites) and 05-04 (image/video call sites) can re-point their dispatch sites at `checkBudget`/`ensureCurrentMonthAllocation` knowing the starting figure is correct, not under-counted.
- `src/core/budget/historical-import.ts`'s exported surface (`generationTypeForCall`, `selectUnrecordedEntries`, `toPendingRecord`) is available if any future phase needs to reconcile another external record source against `GenerationRecord`, though no further carry-forward work is expected.
- No blockers.

## Self-Check: PASSED

All 4 created files confirmed present on disk (`src/core/budget/historical-import.ts`, `src/core/budget/historical-import.test.ts`, `src/scripts/import-historical-spend.ts`, `prisma/migrations/20260919034131_phase5_historical_spend/migration.sql`); both task commits (`9c85dad`, `cd97700`) confirmed in `git log`.

---
*Phase: 05-budget-retry-safeguards*
*Completed: 2026-09-19*
