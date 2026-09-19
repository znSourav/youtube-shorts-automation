# Phase 5: Budget & Retry Safeguards - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-19
**Phase:** 5-Budget & Retry Safeguards
**Areas discussed:** Budget baseline, Reset semantics, Spend visibility

---

## Budget baseline

| Option | Description | Selected |
|--------|-------------|----------|
| Start fresh at $0 | The real system tracks only spend from real story generation onward, in its own separate ledger file. Development/testing spend is a closed, historical bucket that never appears in her view. | |
| Carry the $5.072 forward | The real ledger starts pre-loaded with the $5.072 already spent, so her very first real story is generated against ~$9.93 of remaining headroom, not the full $15. | ✓ |

**User's choice:** Carry the $5.072 forward.
**Notes:** Matches PROJECT.md's own framing that the dev ceiling is "carved out of the real $15 total... not additional to it."

---

## Reset semantics

| Option | Description | Selected |
|--------|-------------|----------|
| One-time lifetime cap, never resets | Matches the literal "Month 1 experiment" framing; simpler; Month 2 recurring budget is a later decision. | |
| Real calendar-month rollover | Spend resets to $0 automatically on the 1st of each month. | |

**User's choice (free text):** "If possible it should read from Google Api how much is left, cause this will not be static for each month. Let's say for first month we are considering $15, for second month we may consider $10, for 3rd month if there is some leftover, we will add that to the next month, like this."

**Follow-up question:** Two separate asks were identified — (1) a requester-set, varying-per-month budget with rollover, and (2) polling Google's own API, which conflicts with an existing PROJECT.md Key Decision (rejected for lag + heavier GCP permissions).

| Option | Description | Selected |
|--------|-------------|----------|
| Just the varying/rollover budget | Skip Google's Billing API entirely; build a configurable per-month amount with rollover, tracked by the app's own internal ledger. | ✓ |
| Actually poll Google's Billing API too | Reverse the earlier decision and also check Google's real billing data, accepting the lag and extra GCP IAM setup. | |

**User's choice:** Just the varying/rollover budget.
**Notes:** The existing "no Billing API polling" decision stands unchanged. Final model: the requester sets each month's figure himself (e.g. $15, then $10), and unused amounts roll over and add to the next month's allocation — all tracked internally, zero-lag, same mechanism as today.

---

## Spend visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Small always-visible indicator | Compact "spend so far / limit" readout visible on the create screen and/or Library — no extra click. | ✓ |
| Fold into the Story Library screen | A dedicated section on the Library screen only. | |
| A new dedicated screen | A separate "Budget" screen/tab. | |

**User's choice:** Small always-visible indicator.

**Follow-up question:** Does the compact indicator show just the total, or all three type breakdowns simultaneously?

| Option | Description | Selected |
|--------|-------------|----------|
| Total at a glance, breakdown on tap | Keeps the indicator small and calm; tapping reveals the video/image/LLM split. | ✓ |
| Show the full breakdown always | All three types and sub-totals visible without interaction. | |

**User's choice:** Total at a glance, breakdown on tap.
**Notes:** Matches Phase 4's own "plain language first, detail on demand" pattern.

---

## Claude's Discretion

- BUDGET-05 (per-scene retry caps) is very likely already substantially satisfied by Phase 4's existing `src/core/retry/caps.ts`/`maxSceneRetryAttempts()` mechanism — research/planning should verify rather than rebuild.
- The exact mechanism for carrying the $5.072 forward (migrating individual historical ledger entries vs. a summarized opening-balance entry) is left to planning.
- The exact mechanism for how the requester sets each new month's figure (env var edited monthly vs. a small persisted record) is left to planning, informed by the established "requester edits `.env.local` by hand for real-money decisions" pattern.
- The fate of `DEV_CEILING_USD`/the dev-testing ledger after Phase 5 ships was not discussed this session (not selected as a topic; the requester declined to explore further gray areas). Flagged for research/planning to propose explicitly rather than silently deciding.
- Exact plain-language copy, exact indicator layout/placement are left to the (likely-triggered) UI-SPEC step.

## Deferred Ideas

None — discussion stayed within phase scope. No scope-creep topics came up.
