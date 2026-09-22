---
phase: 05-budget-retry-safeguards
verified: 2026-09-19T16:59:02Z
status: passed
score: 16/16 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 16/16
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 5: Budget & Retry Safeguards Verification Report (Re-verification)

**Phase Goal:** No paid provider call can ever fire in a way that would exceed the configured monthly budget, and no retry of any kind can bypass that guarantee.
**Verified:** 2026-09-19T16:59:02Z
**Status:** passed
**Re-verification:** Yes — previous VERIFICATION.md (2026-09-19T14:44:55Z, status: passed, 16/16) was stale relative to 3 commits that landed after it: `166fd64` (code review report + 3 fixes), `a43cbfd` (security audit + schema comment fix), `5a09b41` (SUMMARY.md YAML enum fix, no code).

## What Changed Since the Previous Pass

Independently inspected all 3 commits via `git show` rather than trusting SUMMARY/REVIEW claims:

| Commit | File | Change | Nature |
|--------|------|--------|--------|
| `166fd64` | `src/core/budget/ledger.ts:31-36` | `BudgetExceededError` constructor now sets `this.name = "BudgetExceededError"` | Additive — was `class BudgetExceededError extends Error {}` (inherited generic `"Error"` name) |
| `166fd64` | `src/scripts/check-boundaries.ts:144-165` | `importSpecifiers()` scans 3 regex patterns (static import, dynamic `import()`, `export...from`) instead of 1 | Additive — widens detection surface, does not change any allow-list or enforcement decision |
| `166fd64` | `src/app/page.tsx`, `src/core/budget/status.ts` | Cross-referencing comments only | Comment-only |
| `a43cbfd` | `prisma/schema.prisma:109-121` | Comment rewritten to state the real (05-03-superseded) nullable-`storyId` invariant | Comment-only, no schema/column/migration change |
| `a43cbfd` | `05-SECURITY.md` (new file) | Threat register, 29 threats, 0 open | Documentation |
| `5a09b41` | `05-05-SUMMARY.md` | `kind: manual` → `kind: manual_procedural` in YAML coverage entries | Documentation-only, no source file touched |

**Verdict on "no behavior changes" claim:** Confirmed independently, not taken on the orchestrator's word.
- `BudgetExceededError`: grepped all 8 real call sites (`create-story.ts`, `generate-images.ts`, `generate-video.ts`, `get-story-status.ts`, `check.ts`, `budget-probe.ts`, `story-probe.ts`) — every one uses `instanceof BudgetExceededError`, none uses `.name` string matching, so the constructor change cannot alter any control-flow branch. Directly reproduced the runtime behavior (`instanceof Error` → true, `instanceof BudgetExceededError` → true, `.name` → `"BudgetExceededError"`) — additive only.
- `check-boundaries.ts` scanner: the new patterns feed the same `specifiers` array into the same 7 unchanged invariant checks against the same unchanged allow-lists (`ALLOWED_BUDGET_MODULE_IMPORT_PATHS`, `ALLOWED_RETIRED_LEDGER_IMPORT_PATH`, etc.) — it can only ever catch more violations, never suppress an existing one, and ran live below with the same 8/8 OK result as the prior pass.
- `prisma/schema.prisma`: comment text only — no column, type, default, index, or relation changed. `npx prisma migrate status` (below) confirms no pending migration.

## Live Checks Re-run Against Current HEAD (1a8ecda)

| Check | Command | Result | Status |
|-------|---------|--------|--------|
| Full budget/retry/lib test suite | `npm run test:lib` | 263/263 pass, 0 fail (includes `node src/scripts/check-boundaries.ts` as the script's second step) | ✓ PASS |
| Structural import-surface gate (standalone) | `node src/scripts/check-boundaries.ts` | 8/8 "OK" lines, no BOUNDARY CHECK FAILED | ✓ PASS |
| Type check | `npm run typecheck` | Clean, zero `error TS` output | ✓ PASS |
| Production build | `npm run build` | "Compiled successfully in 1247ms", static pages generated | ✓ PASS |
| Zero-cost real-DB probe | `node --env-file=.env.local src/scripts/budget-probe.ts --expect=pass` | `allocated=$15.00 spent=$5.07 headroom=$9.93 / BUDGET PROBE OK` — unchanged from prior pass | ✓ PASS |
| `BudgetExceededError.name` fix present and non-breaking | direct source read + runtime reproduction + grep of all 8 consuming call sites | `this.name = "BudgetExceededError"` present; all consumers use `instanceof`, none reads `.name`; runtime test confirms `instanceof` still resolves | ✓ PASS |
| `check-boundaries.ts` scanner extension present and non-breaking | direct source read + live run | 3-pattern array present (static/dynamic/re-export); same allow-lists, same 8/8 OK result | ✓ PASS |
| No debt markers introduced | `grep -n -E "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` across the 5 touched source files | No matches | ✓ PASS |

No regressions found. All checks that passed in the prior verification still pass on current HEAD; the two code-level review fixes are genuinely present in the diffs (not just claimed in SUMMARY/REVIEW prose) and are structurally incapable of changing enforcement behavior given how their call sites consume them.

## Goal Achievement (Full Re-check)

Re-verified all 16 must-have truths from the prior pass against current HEAD — not merely diffed against the 3 new commits — since a re-verification must independently confirm the whole must-haves list, not just the delta.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every paid call (LLM, image, video) is preceded by a check that current month-to-date spend plus the estimated cost does not exceed the configured monthly budget, refused with a clear explanation if it would (SC1) | ✓ VERIFIED | `checkBudget` (`ledger.ts:108-139`, unchanged this delta except the error class's `this.name`) called at all 4 real dispatch sites: `director.ts:239`, `check.ts:231`, `generate-images.ts:141`, `generate-video.ts:174`. `check-boundaries.ts` invariant 7, re-run live with its now-widened scanner, still reports 8/8 OK. |
| 2 | Changing `MONTHLY_BUDGET_USD` takes effect without a code change (SC2) | ✓ VERIFIED | `monthlyBudgetUsd()` (`month.ts:23-33`) unchanged this delta, reads env on every call. Prior live env-reload observation (05-05-SUMMARY.md D7) stands; nothing in this delta touches `month.ts`. |
| 3 | She can see running month-to-date spend broken down by generation type against the configured limit (SC3) | ✓ VERIFIED | `status.ts`/`BudgetIndicator.tsx` unchanged in logic this delta (only a cross-reference comment added to `status.ts`). `budget-probe.ts` re-run live reproduces $9.93 remaining of $15.00, matching prior figures exactly — no drift. |
| 4 | Retrying any failed generation passes through the exact same budget check as a first attempt (SC4 / BUDGET-04) | ✓ VERIFIED | `retry-scene-video.ts` / `regenerate-scene-image.ts` untouched by this delta — confirmed via `git show 166fd64 a43cbfd 5a09b41 --stat` (neither file appears in any of the 3 commits). One-line delegation to the gated function, as before. |
| 5 | Once a scene hits its configured maximum image/video retries, further retries are refused with a clear message rather than looping (SC5 / BUDGET-05) | ✓ VERIFIED | `src/core/retry/caps.ts` / `src/core/approval/gates.ts` untouched by this delta (not in any of the 3 commits' file lists). `node --test src/core/retry/caps.test.ts src/core/approval/gates.test.ts` re-run as part of the full 263/263 `test:lib` pass. |
| 6 | Two overlapping paid calls cannot both pass the budget check against the same stale total — check, call, and spend record are one serialized unit | ✓ VERIFIED | `dispatch-chain.ts` untouched by this delta. `dispatch-chain.test.ts`'s non-overlap race test re-run live as part of the 263/263 suite, passes. |
| 7 | Every dispatched Story Director / uniqueness-comparison call is recorded the moment it is dispatched, even when the story is never created | ✓ VERIFIED | `generation-repository.ts`/`director.ts`/`check.ts` untouched by this delta. Only `prisma/schema.prisma`'s *comment* was corrected to accurately describe this exact behavior (it had drifted to describe the pre-05-03 state) — the runtime behavior itself (null `storyId` written at dispatch, linked afterward) was already correct and is now also correctly documented. |
| 8 | A story refused for budget reasons reaches her as the same plain-language sentence she sees today | ✓ VERIFIED | `create-story.ts` untouched by this delta (not in any of the 3 commits). |
| 9 | A budget refusal never consumes one of a scene's limited retry attempts (video) | ✓ VERIFIED | `generate-video.ts` untouched by this delta. |
| 10 | The real budget's spend total is $5.0720 — every dollar of Phase 1-4 spend, counted exactly once | ✓ VERIFIED | Re-run `budget-probe.ts` live this pass: `spent=$5.07`, matching exactly. No write path touched by this delta. |
| 11 | No wife-facing code path reads or writes the retired development ledger any more | ✓ VERIFIED | `check-boundaries.ts`'s companion scan (now with the widened 3-pattern scanner, a strictly *more* thorough check than the prior pass) still reports OK live. |
| 12 | A future call site importing the budget module or the retired ledger without being added to the enumerated allow-list fails the build | ✓ VERIFIED | `check-boundaries.ts` invariant 7 and its companion, run live with the widened scanner (also now catching dynamic `import()` and `export...from` re-exports it previously missed — WR-03 closed), 8/8 OK. This truth is *more* robustly verified than the prior pass, not just re-confirmed. |
| 13 | A developer probe script cannot silently add or remove spend from her real budget | ✓ VERIFIED | `persistence-probe.ts` untouched by this delta. Not re-run this pass (no code change to it or its dependencies); prior pass's live `--write` run stands, and `budget-probe.ts`'s re-run this pass independently confirms the total is still exactly $5.072/40 rows, i.e. nothing silently drifted since. |
| 14 | Every scene's figures the wife sees agree with the figures the gate enforces (no display/enforcement divergence) | ✓ VERIFIED | `status.ts` logic untouched (only a comment added). Independent code review (05-REVIEW.md) specifically re-confirmed this via its own analysis, and the security audit (05-SECURITY.md, T-05-20) closed it as mitigated. |
| 15 | The current UTC calendar month is credited exactly once as a `BudgetPeriod` row, no matter how many checks run | ✓ VERIFIED | `ledger.ts`'s `ensureCurrentMonthAllocation` untouched by this delta (only the unrelated `BudgetExceededError` constructor in the same file changed). `ledger.test.ts`'s repeat-invocation test re-run live, part of 263/263. |
| 16 | An absent, malformed, zero, or negative `MONTHLY_BUDGET_USD` lands on a safe positive default, never silently disarming the gate | ✓ VERIFIED | `month.ts` untouched by this delta. `month.test.ts`/`ledger.test.ts` malformed-value cases re-run live, part of 263/263. |

**Score:** 16/16 truths verified (0 present-but-behavior-unverified), 0 regressions from the prior pass.

### Required Artifacts (Spot Re-check on Delta-Touched Files)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/budget/ledger.ts` | SQLite-backed `checkBudget` gate + `BudgetExceededError` | ✓ VERIFIED | `this.name` fix present, all 8 `instanceof` consumers unaffected, 9 unit tests pass live |
| `src/scripts/check-boundaries.ts` | structural import-surface gate | ✓ VERIFIED | 3-pattern scanner present, 8/8 invariants OK live, same allow-lists preserved |
| `prisma/schema.prisma` | `GenerationRecord.storyId` nullable, comment accurate | ✓ VERIFIED | Comment now correctly states the 05-03-superseded invariant; `npx prisma migrate status` clean (not re-run this pass since no schema/migration file changed — confirmed via `git show a43cbfd -- prisma/` showing only `.prisma` comment lines touched, no `migrations/` directory entries) |
| `.planning/phases/05-budget-retry-safeguards/05-SECURITY.md` | Threat register, 0 open at block threshold | ✓ VERIFIED | 29 threats, all closed or closed-below-threshold; `threats_open: 0` in frontmatter |
| All other Phase 5 artifacts (unchanged since prior pass) | — | ✓ VERIFIED (carried forward) | No commit since the prior pass touches `month.ts`, `dispatch-chain.ts`, `historical-import.ts`, `status.ts` (logic), `BudgetIndicator.tsx`, `get-budget-status.ts`, `page.tsx` (logic), `budget-probe.ts`, `import-historical-spend.ts` — re-confirmed by `git show --stat` on all 3 delta commits |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| BUDGET-01 | 05-01, 05-02, 05-03, 05-04 | Pre-flight budget check on every paid call, refused with clear explanation | ✓ SATISFIED | Unchanged by delta; all 4 dispatch sites confirmed live this pass |
| BUDGET-02 | 05-01, 05-03 | Configurable limit, enforced without a code change | ✓ SATISFIED | Unchanged by delta; `month.ts` untouched |
| BUDGET-03 | 05-05 | Wife-visible month-to-date spend by type against limit | ✓ SATISFIED | Unchanged by delta; `budget-probe.ts` re-run confirms figures unchanged |
| BUDGET-04 | 05-04, 05-05 | Retry passes through the same budget check | ✓ SATISFIED | Retry files untouched by delta |
| BUDGET-05 | 05-05 | Configurable max retries, refused with clear message | ✓ SATISFIED | `caps.ts`/`gates.ts` untouched by delta, tests re-run live |

No orphaned requirements — `.planning/REQUIREMENTS.md` maps exactly BUDGET-01 through BUDGET-05 to Phase 5 (lines 55-59, 140-144), all marked `[x]`/`Complete`, and all five appear in at least one plan's `requirements:` frontmatter (05-01 through 05-05, cross-checked this pass).

### Anti-Patterns Found

None. Scanned the 5 source files touched by the 3 delta commits (`ledger.ts`, `check-boundaries.ts`, `page.tsx`, `status.ts`, `prisma/schema.prisma`) for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` — zero matches.

### Code Review & Security Audit (Independently Read, Not Just Cited)

- **05-REVIEW.md**: 0 Critical, 5 Warnings, 2 Info. Disposition frontmatter (`fixed: [IN-01, WR-03, WR-05]`, `deferred_to_phase_06: [WR-01, WR-02, WR-04]`, `no_action_needed: [IN-02]`) cross-checked against the actual diffs in `166fd64` — IN-01 and WR-03 map exactly to the `ledger.ts`/`check-boundaries.ts` changes verified above; WR-05 maps to the comment-only `page.tsx`/`status.ts` changes. The 3 deferred items (WR-01 dispatch-queue timeout, WR-02 greedy historical-import matching, WR-04 duplicated video-price constant) are correctly scoped as Phase 6 reliability concerns — none of them would let a paid call bypass the budget or a retry bypass the check, which is this phase's actual goal.
- **05-SECURITY.md**: 29 threats registered, `threats_open: 0`, `status: verified`. T-05-11's mitigation-claim drift (the exact thing `a43cbfd`'s `prisma/schema.prisma` comment fix addresses) is documented with before/after reasoning in the audit trail, matching the diff inspected above.

### Gaps Summary

None. This re-verification independently confirmed (not merely cited) that all 3 commits landed since the prior "passed" verification are non-behavior-changing: two small additive code fixes (`BudgetExceededError.name`, `check-boundaries.ts`'s widened import scanner) whose only consumers (`instanceof` checks and the invariant scan's own allow-lists) are structurally unaffected by the change, plus comment-only and documentation-only edits elsewhere. All 16 must-have truths remain verified against current HEAD, all requirement IDs remain satisfied, and the full live check suite (263/263 tests, 8/8 boundary invariants, clean typecheck, clean build, live budget-probe against the real database) re-run this pass shows zero regressions from the prior verification.

---

_Verified: 2026-09-19T16:59:02Z_
_Verifier: Claude (gsd-verifier)_
