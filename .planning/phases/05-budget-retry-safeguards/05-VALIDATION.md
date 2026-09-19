---
phase: "05"
slug: "budget-retry-safeguards"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-19"
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node's built-in `node:test` — no third-party test framework, matches every existing test file in the repo |
| **Config file** | none — invoked directly via the file list in `package.json`'s `test:lib` script |
| **Quick run command** | `node --test src/core/budget/ledger.test.ts` (once created) |
| **Full suite command** | `npm run test:lib` (runs every `node:test` file plus `node src/scripts/check-boundaries.ts`) |
| **Estimated runtime** | ~1-2 seconds (matches the existing 214-test suite's current ~1s runtime) |

---

## Sampling Rate

- **After every task commit:** Run `node --test src/core/budget/ledger.test.ts`
- **After every plan wave:** Run `npm run test:lib`
- **Before `/gsd-verify-work`:** Full suite must be green, plus `npm run typecheck` and `npm run build`
- **Max feedback latency:** ~5 seconds (full suite + typecheck)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | BUDGET-01, BUDGET-02 | T-05-01 | Fail-closed on malformed/absent `MONTHLY_BUDGET_USD` or corrupted allocation data | unit | `node --test src/core/budget/ledger.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | BUDGET-01 | T-05-02 | Re-pointed call sites refuse a call that would exceed cumulative allocation | unit | `node --test src/core/budget/ledger.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | BUDGET-03 | — | Month-to-date spend grouped by `generationType` computed correctly | unit | `node --test src/core/budget/ledger.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-04 | 01 | 1 | — (structural) | T-05-03 | All six real dispatch/probe touch sites re-pointed; no stale `spend-ledger` import remains | structural | `node src/scripts/check-boundaries.ts` | ✅ (extend) | ⬜ pending |
| 05-02-01 | 02 | 2 | BUDGET-04 | — | Retry paths call the identical gated function as a first attempt, now against the real budget check | unit (regression) | `node --test src/core/retry/caps.test.ts src/core/approval/gates.test.ts` | ✅ | ⬜ pending |
| 05-02-02 | 02 | 2 | BUDGET-05 | — | Retry-cap refusal messages unchanged | unit (regression) | `node --test src/core/retry/caps.test.ts src/core/approval/gates.test.ts` | ✅ | ⬜ pending |
| 05-03-01 | 03 | 3 | BUDGET-03 | T-05-04 | Spend indicator renders server-computed numbers only, never a raw path/model id | manual + unit | `node --test src/app/actions/get-budget-status.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/core/budget/ledger.test.ts` — covers BUDGET-01, BUDGET-02, BUDGET-03's aggregation logic, and Pitfall 5's idempotent-crediting race
- [ ] `src/app/actions/get-budget-status.test.ts` — covers the new Server Action's shape (no path-shaped field, per T-05-04)
- [ ] A migration/seed test verifying the $5.072 historical entries land correctly in `GenerationRecord` (D-01) without violating the non-nullable `storyId` FK constraint
- [ ] Consider adding `src/app/actions/generate-video.test.ts` / `generate-images.test.ts` if neither exists today — needed to assert BUDGET-04 stays true after the re-point (currently a structural property with no direct test)
- [ ] Prisma migration: `npx prisma migrate dev --name phase5_budget_ledger` (adds `BudgetPeriod`; no new `LedgerEntry`-equivalent table)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| The always-visible spend indicator renders correctly and the tap-to-expand breakdown works in a real browser | BUDGET-03, UI-01 | No component/DOM test framework exists in this repo (established convention since Phase 4) — visual/interaction confirmation needs a live render | With the dev server running, load the create screen, confirm the compact total renders, tap it, confirm the video/image/LLM breakdown appears |
| Editing `MONTHLY_BUDGET_USD` in `.env.local` and saving takes effect without a manual restart under `npm run dev` | BUDGET-02 | Next.js's `.env.local` file-watching behavior under `next dev` is asserted in research (Assumption A1) but not verified live this session | Change the value, save, trigger a budget check, confirm the new figure is used without restarting the dev server |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
