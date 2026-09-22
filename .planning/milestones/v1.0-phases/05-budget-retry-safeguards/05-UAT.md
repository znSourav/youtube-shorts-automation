---
status: complete
phase: 05-budget-retry-safeguards
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md, 05-04-SUMMARY.md, 05-05-SUMMARY.md]
started: 2026-09-19T00:00:00Z
updated: 2026-09-20T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. [05-01] Real SQLite-backed pre-flight budget check refuses a call whose projected cumulative spend would exceed cumulative allocated budget, throwing BudgetExceededError rather than returning a boolean
expected: Real SQLite-backed pre-flight budget check refuses a call whose projected cumulative spend would exceed cumulative allocated budget, throwing BudgetExceededError rather than returning a boolean
result: pass
source: automated
coverage_id: D1

### 2. [05-01] MONTHLY_BUDGET_USD is read from the environment on every call, with a safe positive default on absent/malformed/zero/negative input -- no source-literal dollar figure other than the default
expected: MONTHLY_BUDGET_USD is read from the environment on every call, with a safe positive default on absent/malformed/zero/negative input -- no source-literal dollar figure other than the default
result: pass
source: automated
coverage_id: D2

### 3. [05-01] Each UTC calendar month is credited exactly once as a BudgetPeriod row no matter how many checks run, via a unique-key upsert
expected: Each UTC calendar month is credited exactly once as a BudgetPeriod row no matter how many checks run, via a unique-key upsert
result: pass
source: automated
coverage_id: D3

### 4. [05-01] The Video Status screen's budget-exhausted signal is computed from the real SQLite-backed budget (one probe per invocation, not per scene), not the throwaway dev ledger file
expected: The Video Status screen's budget-exhausted signal is computed from the real SQLite-backed budget (one probe per invocation, not per scene), not the throwaway dev ledger file
result: pass
source: automated
coverage_id: D4

### 5. [05-01] The real database, driven end-to-end by a zero-cost CLI probe, reports real figures ($15.00 allocated, $2.1350 spent) and correctly allows a $0.40 call, with zero dollars spent proving it
expected: The real database, driven end-to-end by a zero-cost CLI probe, reports real figures ($15.00 allocated, $2.1350 spent) and correctly allows a $0.40 call, with zero dollars spent proving it
result: pass
source: automated
coverage_id: D5

### 6. [05-02] The reconciling importer resolves generation type from the call-field prefix (throwing on an unrecognised one) and selects exactly the 26 ledger entries with no matching GenerationRecord row, leaving the 14 already-recorded ones untouched
expected: The reconciling importer resolves generation type from the call-field prefix (throwing on an unrecognised one) and selects exactly the 26 ledger entries with no matching GenerationRecord row, leaving the 14 already-recorded ones untouched
result: pass
source: automated
coverage_id: D1

### 7. [05-02] The real one-time carry-forward run wrote exactly 26 new GenerationRecord rows (null storyId, original ledger timestamps preserved) through a single transaction, bringing prisma/dev.db to 40 rows totalling $5.0720
expected: The real one-time carry-forward run wrote exactly 26 new GenerationRecord rows (null storyId, original ledger timestamps preserved) through a single transaction, bringing prisma/dev.db to 40 rows totalling $5.0720
result: pass
source: automated
coverage_id: D2

### 8. [05-02] A second invocation of the import script refuses to write again and leaves the database unchanged, and the dev ledger file on disk remains byte-identical throughout
expected: A second invocation of the import script refuses to write again and leaves the database unchanged, and the dev ledger file on disk remains byte-identical throughout
result: pass
source: automated
coverage_id: D3

### 9. [05-02] D-01's promised headroom is real: the probe reports $15.00 allocated, $5.0720 spent, $9.9280 remaining, and a configured budget below the already-spent total produces a genuine refusal (not an assumption)
expected: D-01's promised headroom is real: the probe reports $15.00 allocated, $5.0720 spent, $9.9280 remaining, and a configured budget below the already-spent total produces a genuine refusal (not an assumption)
result: pass
source: automated
coverage_id: D4

### 10. [05-03] The Story Director call and the uniqueness-comparison call are both gated by the real monthly budget (checkBudget/BudgetExceededError), not the retired dev ceiling -- neither director.ts nor check.ts references the retired ledger in executable code
expected: The Story Director call and the uniqueness-comparison call are both gated by the real monthly budget (checkBudget/BudgetExceededError), not the retired dev ceiling -- neither director.ts nor check.ts references the retired ledger in executable code
result: pass
source: automated
coverage_id: D1

### 11. [05-03] Two overlapping paid calls cannot both pass the budget check against the same stale total -- the check, the call, and the spend record run as one serializeDispatch unit for both dispatch points
expected: Two overlapping paid calls cannot both pass the budget check against the same stale total -- the check, the call, and the spend record run as one serializeDispatch unit for both dispatch points
result: pass
source: automated
coverage_id: D2

### 12. [05-03] Every dispatched Story Director and uniqueness-comparison call is recorded the moment it is dispatched, even when the story it was for is never created -- recordGenerationAtDispatch writes with a null storyId, and create-story.ts deliberately never flushes on any early-return path
expected: Every dispatched Story Director and uniqueness-comparison call is recorded the moment it is dispatched, even when the story it was for is never created -- recordGenerationAtDispatch writes with a null storyId, and create-story.ts deliberately never flushes on any early-return path
result: pass
source: automated
coverage_id: D3

### 13. [05-03] A story refused for budget reasons still reaches her as the exact same plain-language sentence she sees today
expected: A story refused for budget reasons still reaches her as the exact same plain-language sentence she sees today
result: pass
source: automated
coverage_id: D4

### 14. [05-03] No paid call was dispatched by this plan -- the real spend total is still exactly $5.0720, and the budget probe still reports $9.9280 remaining
expected: No paid call was dispatched by this plan -- the real spend total is still exactly $5.0720, and the budget probe still reports $9.9280 remaining
result: pass
source: automated
coverage_id: D5

### 15. [05-04] Every scene image call (first attempt or single-scene regeneration) is checked against the real monthly budget, refused with her exact unchanged sentence when it would exceed it, and recorded exactly once by the durable GenerationRecord write -- the retired dev-ledger dual-write is gone
expected: Every scene image call (first attempt or single-scene regeneration) is checked against the real monthly budget, refused with her exact unchanged sentence when it would exceed it, and recorded exactly once by the durable GenerationRecord write -- the retired dev-ledger dual-write is gone
result: pass
source: automated
coverage_id: D1

### 16. [05-04] Every scene video call (batch, first attempt, or single-scene retry) passes through the real monthly budget inside the SAME shared serializeDispatch queue every other paid-call site uses, with the budget check still preceding the attempt increment so a refusal costs no retry, and is recorded exactly once
expected: Every scene video call (batch, first attempt, or single-scene retry) passes through the real monthly budget inside the SAME shared serializeDispatch queue every other paid-call site uses, with the budget check still preceding the attempt increment so a refusal costs no retry, and is recorded exactly once
result: pass
source: automated
coverage_id: D2

### 17. [05-04] No wife-facing code path reads or writes the retired development ledger any more; a future call site that imports the retired ledger or the budget module without being added to the enumerated allow-list fails the build
expected: No wife-facing code path reads or writes the retired development ledger any more; a future call site that imports the retired ledger or the budget module without being added to the enumerated allow-list fails the build
result: pass
source: automated
coverage_id: D3

### 18. [05-04] A developer probe script cannot silently add or remove spend from her real budget -- persistence-probe.ts's --write/--read/--simulate-assets modes leave the real cumulative spend total exactly as they found it, failing loudly (non-zero exit) if it would not
expected: A developer probe script cannot silently add or remove spend from her real budget -- persistence-probe.ts's --write/--read/--simulate-assets modes leave the real cumulative spend total exactly as they found it, failing loudly (non-zero exit) if it would not
result: pass
source: automated
coverage_id: D4

### 19. [05-04] npm run build compiles clean and npm run typecheck is clean after every re-point in this plan
expected: npm run build compiles clean and npm run typecheck is clean after every re-point in this plan
result: pass
source: automated
coverage_id: D5

### 20. [05-05] getBudgetStatus computes the rollover-inclusive headline, this month's own allocation, and the video/image/writing breakdown directly from GenerationRecord/BudgetPeriod, with no rounding and no billed filter -- verified against the real database to the exact figures the plan specifies
expected: getBudgetStatus computes the rollover-inclusive headline, this month's own allocation, and the video/image/writing breakdown directly from GenerationRecord/BudgetPeriod, with no rounding and no billed filter -- verified against the real database to the exact figures the plan specifies
result: pass
source: automated
coverage_id: D1

### 21. [05-05] getBudgetStatusAction wraps getBudgetStatus exactly like get-story-status.ts: use server, try/catch, one log line, emptyBudgetStatus() on any error, no direct database/Prisma import, no path/prompt/storyId-shaped field
expected: getBudgetStatusAction wraps getBudgetStatus exactly like get-story-status.ts: use server, try/catch, one log line, emptyBudgetStatus() on any error, no direct database/Prisma import, no path/prompt/storyId-shaped field
result: pass
source: automated
coverage_id: D2

### 22. [05-05] The retry-cap tests pass unchanged and neither src/core/retry/caps.ts nor src/core/approval/gates.ts imports the budget system -- BUDGET-05 required no new implementation in this plan
expected: The retry-cap tests pass unchanged and neither src/core/retry/caps.ts nor src/core/approval/gates.ts imports the budget system -- BUDGET-05 required no new implementation in this plan
result: pass
source: automated
coverage_id: D4

### 23. [05-05] Both retry entry points (retrySceneVideoAction, regenerateSceneImageAction) still delegate to the identical gated dispatch function a first attempt uses -- BUDGET-04 is structural, not duplicated, and plan 05-04's boundary invariants are what keep it that way
expected: Both retry entry points (retrySceneVideoAction, regenerateSceneImageAction) still delegate to the identical gated dispatch function a first attempt uses -- BUDGET-04 is structural, not duplicated, and plan 05-04's boundary invariants are what keep it that way
result: pass
source: automated
coverage_id: D5

### 24. [05-05] The full suite, type check, and build all pass together after this plan's changes, and the database ends the phase at exactly 40 spend rows / $5.0720 and 1 allocation row / $15.00 -- this plan spent nothing proving any of the above
expected: The full suite, type check, and build all pass together after this plan's changes, and the database ends the phase at exactly 40 spend rows / $5.0720 and 1 allocation row / $15.00 -- this plan spent nothing proving any of the above
result: pass
source: automated
coverage_id: D6

### 25. [05-05] BudgetIndicator.tsx (a real button, aria-expanded, two-decimal figures, zinc/black palette, no icon/colour/spacing addition) rendered once above page.tsx's screen switch, fetched on mount and refreshed after every money-spending handler and on the existing video-status poll tick, hides itself on a failed/not-ok status rather than showing a misleading zero
expected: BudgetIndicator.tsx (a real button, aria-expanded, two-decimal figures, zinc/black palette, no icon/colour/spacing addition) rendered once above page.tsx's screen switch, fetched on mount and refreshed after every money-spending handler and on the existing video-status poll tick, hides itself on a failed/not-ok status rather than showing a misleading zero
result: pass
source: manual
coverage_id: D3
note: "Confirmed live against localhost:3000 by the orchestrator with the requester's direct participation. One disclosed caveat: keyboard reachability was directly observed (Tab focuses it first from a fresh load); keyboard operability via a live synthetic Enter/Space keypress could not be triggered through the browser-automation tool used, though the component is a standards-compliant native <button> with a single onClick and no key-event interception, and a direct element.click() on the focused element worked. Requester reviewed this caveat and accepted the evidence as sufficient."

### 26. [05-05] 05-RESEARCH.md Assumption A1 (does an env-var MONTHLY_BUDGET_USD edit take effect under the documented npm run dev start command without a restart) -- settled either way, not left as an assumption
expected: 05-RESEARCH.md Assumption A1 (does an env-var MONTHLY_BUDGET_USD edit take effect under the documented npm run dev start command without a restart) -- settled either way, not left as an assumption
result: pass
source: manual
coverage_id: D7
note: "Answer: YES. Requester edited .env.local to MONTHLY_BUDGET_USD=1 while npm run dev kept running; the server logged \"Reload env: .env.local\" and the indicator flipped live to the used-up state with no restart. Requester then restored MONTHLY_BUDGET_USD=15 the same way and confirmed the indicator returned to normal."

## Summary

total: 26
passed: 26
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
