---
phase: "05"
slug: "budget-retry-safeguards"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-09-19"
---

# Phase 05 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| concurrent requests → budget check | Two in-flight Server Actions racing the same cumulative spend total | Nothing crosses a process boundary; the race is entirely in-process |
| server → paid providers | Story Director, uniqueness-comparison, scene-image, scene-video — the four real spend points | Provider request/response; money |
| server → browser | `create-story.ts`'s refusal sentence, `get-story-status.ts`'s `budgetExceeded` boolean, `getBudgetStatusAction`'s `BudgetStatus` shape | Plain-language text, a boolean, and numeric spend figures only — never a path, prompt, model id, or story id |
| tracked ledger file → SQLite | A one-time bridge moving $2.9370 of real-money history into the table that now gates spending | 26 historical `GenerationRecord` rows |
| operator → one-time migration script | `import-historical-spend.ts` writes money records directly, bypassing the best-effort repository layer on purpose | Real dollar figures, written transactionally |
| developer scripts → authoritative ledger | Probe scripts (`persistence-probe.ts`, `story-probe.ts`, `budget-probe.ts`) share the database that now decides how much real money may be spent | Synthetic or real spend figures |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-05-01 | Tampering | `monthlyBudgetUsd`/`checkBudget` | high | mitigate | Malformed/zero/negative `MONTHLY_BUDGET_USD` degrades to `DEFAULT_MONTHLY_BUDGET_USD`; non-finite/non-positive resolved allocation throws `BudgetExceededError` | closed |
| T-05-02 (05-01) | Elevation of Privilege | `get-story-status.ts` → browser | high | mitigate | Refusal computed server-side; only `budgetExceeded: boolean` reaches the browser | closed |
| T-05-05 | Tampering | `BudgetPeriod` crediting | high | mitigate | `month String @unique` + single upsert — DB rejects the duplicate, not app-timed | closed |
| T-05-08 | Denial of correct accounting | `checkBudget` estimate argument | high | mitigate | Non-finite/negative estimates rejected before any DB access | closed |
| T-05-04 (05-01) | Repudiation | `recordGeneration` best-effort write contract | medium | accept | See Accepted Risks Log AR-01 | closed |
| T-05-06 | Tampering | `selectUnrecordedEntries`/`import-historical-spend.ts` | high | mitigate | Claim-each-row-once reconciling pass; refuses to run twice; post-write assertion on exact totals | closed |
| T-05-09 | Denial of correct accounting | `import-historical-spend.ts` write path | high | mitigate | Explicit `$transaction`, direct write (not the best-effort `recordGeneration`), errors propagate | closed |
| T-05-10 | Spoofing (misclassification) | `generationTypeForCall` | medium | mitigate | Unrecognised call prefix throws rather than defaulting; all 9 prefixes enumerated and tested | closed |
| T-05-11 | Tampering | nullable `GenerationRecord.storyId` | medium | mitigate | Identifiability holds (carried-forward rows discriminated by `CARRIED_FORWARD_MESSAGE`, not by null id); schema comment updated this audit to state the real invariant after 05-03 superseded the original "only the import script writes null" claim — see Audit Trail note below | closed — below block threshold |
| T-05-03 (05-03) | Tampering (TOCTOU) | `runStoryDirector`, `compareViaLlm` | high | mitigate | Check + paid call + record inside one `serializeDispatch` unit | closed |
| T-05-12 | Denial of correct accounting | `create-story.ts` early-return paths | high | mitigate | Records written at dispatch boundary with null story id, linked after save, not flushed-after-save | closed |
| T-05-02 (05-03) | Elevation of Privilege | `create-story.ts` → browser | high | mitigate | Fixed plain-language refusal sentence only, no figure/model id/error detail | closed |
| T-05-13 | Denial of Service | `serializeDispatch` | medium | mitigate | Rejecting call doesn't wedge the queue for later calls; non-reentrancy documented | closed |
| T-05-04 (05-03) | Repudiation | `recordGenerationAtDispatch` best-effort contract | medium | accept | See Accepted Risks Log AR-01 | closed |
| T-05-14 | Elevation of Privilege | retry/regenerate Server Actions | high | mitigate | Both delegate to the single gated dispatch function, no second path to a provider | closed |
| T-05-03 (05-04) | Tampering (TOCTOU) | `generateSceneImagesAction`, `dispatchSceneVideo` | high | mitigate | Both run check+call+write inside the shared `serializeDispatch` queue | closed |
| T-05-15 | Tampering | developer probe scripts vs. authoritative ledger | high | mitigate | `persistence-probe.ts` asserts cumulative spend identical before/after every run, exits non-zero otherwise | closed |
| T-05-16 | Spoofing | future call site importing the budget module | high | mitigate | Invariant 7 enumerates every file permitted to import the gate | closed |
| T-05-02 (05-04) | Elevation of Privilege | client bundle | high | mitigate | Invariant 1 extended to forbid any client file importing the budget module (static, dynamic, and re-export import forms) | closed |
| T-05-17 | Denial of correct accounting | double-recording a dispatched call | high | mitigate | Dev-ledger write deleted; exactly one spend record per dispatched call | closed |
| T-05-02 (05-05) | Elevation of Privilege | `BudgetIndicator.tsx` | high | mitigate | Component takes numbers as props, fetches nothing; refusal always server-side in `checkBudget` | closed |
| T-05-18 | Information Disclosure | `BudgetStatus` result shape | medium | mitigate | No field capable of holding a path, prompt, model id, or story id | closed |
| T-05-19 | Spoofing (misleading display) | zeroed figures on a failed query | medium | mitigate | Failed status query hides the indicator (or leaves prior figures) rather than rendering a misleading zero | closed |
| T-05-20 | Tampering | displayed spend diverging from enforced spend | medium | mitigate | Breakdown/headline reuse `checkBudget`'s own aggregates, no billed filter, no rounding | closed |
| T-05-SC (05-01) | Tampering | package-manager installs | low | accept | See Accepted Risks Log AR-02 | closed |
| T-05-SC (05-02) | Tampering | package-manager installs | low | accept | See Accepted Risks Log AR-02 | closed |
| T-05-SC (05-03) | Tampering | package-manager installs | low | accept | See Accepted Risks Log AR-02 | closed |
| T-05-SC (05-04) | Tampering | package-manager installs | low | accept | See Accepted Risks Log AR-02 | closed |
| T-05-SC (05-05) | Tampering | package-manager installs | low | accept | See Accepted Risks Log AR-02 | closed |

*Status: open · closed · closed — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

**threats_open: 0** — 28 of 29 threats fully closed; T-05-11 closed at medium severity (below the `high` block threshold), with its mitigation claim corrected this audit rather than left inaccurate.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01 | T-05-04 (05-01), T-05-04 (05-03) | `recordGeneration`/`recordGenerationAtDispatch` are best-effort by contract (never throw, only log). A swallowed write under-counts future spend by exactly the amount the retired file ledger's own lock-timeout risk already carried — a database hiccup must never discard an already-paid-for asset. The loud `console.error` at each call site is the operator's only drift signal. Documented in `src/core/budget/ledger.ts:17-26` and `src/core/persistence/generation-repository.ts:125-129/157-162`. | Project owner (via GSD phase planning + this audit) | 2026-09-19 |
| AR-02 | T-05-SC ×5 (one per plan, 05-01 through 05-05) | No task across all 5 plans runs `npm install`; verified this audit via `git diff 9589d0a~1 HEAD -- package.json` showing a single changed line (the `test:lib` script gaining five budget test files). Zero new dependencies introduced. | Project owner (via GSD phase planning + this audit) | 2026-09-19 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-19 | 29 | 29 | 0 | gsd-security-auditor (opus), register authored at plan time across all 5 plans, verified against live implementation + 8/8 live boundary invariants + 263/263 live test suite |

**Note on T-05-11:** The auditor found the threat's own mitigation claim had drifted — `prisma/schema.prisma`'s comment asserted "every live write path still supplies a real story id," which 05-03 deliberately superseded (`recordGenerationAtDispatch` now writes a null `storyId` on every real Story Director and uniqueness-comparison dispatch, linked to a story afterward via `attachGenerationRecordsToStory`). This is a documentation-drift finding, not a money-safety defect — the actual reconciliation logic (`selectUnrecordedEntries`) never relied on the null-id claim; it discriminates carried-forward rows by the `CARRIED_FORWARD_MESSAGE` marker. Fixed same-day: `prisma/schema.prisma`'s comment rewritten to state the real invariant (null `storyId` is reserved for carried-forward rows and pending-linkage dispatch-boundary rows; no other path should construct one).

**Unregistered-surface note (informational, not a threat-register gap):** The auditor flagged three items with no SUMMARY.md `## Threat Flags` entry naming them: `src/scripts/budget-probe.ts` (new; writes only to `BudgetPeriod`, never `GenerationRecord`, cannot move spend), `src/scripts/story-probe.ts` (modified; now dispatches through the real gated functions with no dedicated before/after guard of its own, but is fully subject to `checkBudget` like any other caller — consumes headroom rather than bypassing the cap, and the caveat is recorded in 05-04-SUMMARY.md), and `src/app/page.tsx`'s hand-maintained `EMPTY_BUDGET_STATUS` (display-only duplication, already flagged and cross-referenced in both files per 05-REVIEW.md WR-05). None required a disposition change.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-19
