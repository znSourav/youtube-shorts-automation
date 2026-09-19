// The real, wife-facing MONTHLY_BUDGET_USD enforcement gate (BUDGET-01,
// BUDGET-02). This is the SQLite-backed replacement for
// src/lib/spend-ledger.ts's checkCeiling/recordSpend pair, reproducing
// checkCeiling's exact fail-closed validation order and inclusive boundary
// against real database-backed cumulative figures instead of a flat JSON
// file (05-RESEARCH.md "Recommended Schema").
//
// This module reaches SQLite directly through src/lib/db.ts, making
// src/core/budget/ a second sanctioned database-touching core module
// alongside src/core/persistence/. check-boundaries.ts invariant 3 is
// satisfied because Server Actions import this module rather than importing
// the database module themselves; invariant 1 forbids any "use client" file
// from importing it (extended in this plan to check for a "core/budget"
// import specifier, mirroring the existing "core/persistence" entry, so
// that guarantee is structurally enforced rather than merely asserted).
//
// Write-contract note (05-RESEARCH.md Pitfall 4): GenerationRecord is now
// the enforcement READ side (this module sums it), while recordGeneration
// (src/core/persistence/generation-repository.ts) remains BEST-EFFORT BY
// CONTRACT on the WRITE side -- it never throws, only logs. A swallowed
// write failure under-counts future spend by exactly the amount the retired
// file ledger's own lock-timeout risk already carried (spend-ledger.ts's
// withLedgerFileLock comment). That is a deliberate, accepted trade -- a
// database hiccup must never discard an already-paid-for asset -- not an
// oversight. The loud console.error at each recordGeneration call site is
// the only operator signal that real spend and the record may have drifted.
import type { PrismaClient } from "../../generated/prisma/client.ts";
import { prisma } from "../../lib/db.ts";
import { currentMonthKey, monthlyBudgetUsd } from "./month.ts";

export class BudgetExceededError extends Error {}

/**
 * Idempotently credits the current UTC calendar month with whatever
 * MONTHLY_BUDGET_USD is configured right now. A single upsert keyed on the
 * unique `month` column (05-RESEARCH.md Pitfall 5) -- calling this
 * repeatedly leaves exactly one BudgetPeriod row per month, never a
 * duplicate, because the database itself rejects the second insert rather
 * than the application timing a check-then-create.
 *
 * Deliberate deviation from 05-RESEARCH.md's worked snippet: that snippet's
 * `update` clause was empty (`update: {}`), meaning a month first touched
 * before the requester edits his figure for it would keep a stale
 * allocation for the whole month once he does edit it -- an over-allocation
 * of real money that defeats BUDGET-02. Setting `allocatedUsd` on the update
 * clause too keeps past months frozen (they are never the current key, so
 * they are never upserted again after the month rolls over) while the
 * current month always reflects what he has configured right now -- exactly
 * D-02's "he sets/changes it himself each month". Lowering the figure
 * mid-month is therefore fail-closed (less headroom immediately), not
 * fail-open.
 */
export async function ensureCurrentMonthAllocation(
  client: PrismaClient = prisma,
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): Promise<void> {
  const month = currentMonthKey(now);
  const allocatedUsd = monthlyBudgetUsd(env);
  await client.budgetPeriod.upsert({
    where: { month },
    update: { allocatedUsd },
    create: { month, allocatedUsd },
  });
}

/** SUM(BudgetPeriod.allocatedUsd) across every row -- the rollover-inclusive cumulative allocation. Coalesces a null sum (no rows yet) to 0. */
export async function cumulativeAllocatedUsd(client: PrismaClient = prisma): Promise<number> {
  const result = await client.budgetPeriod.aggregate({ _sum: { allocatedUsd: true } });
  return result._sum.allocatedUsd ?? 0;
}

/**
 * SUM(GenerationRecord.estimatedUsd) across every row, with no `billed`
 * filter -- conservative accounting, matching totalSpentUsd's existing
 * behaviour (spend-ledger.ts): a call recorded with billed:false still
 * counts toward spend, since the provider may have billed it regardless of
 * what this process could locally observe. Coalesces a null sum to 0.
 */
export async function cumulativeSpentUsd(client: PrismaClient = prisma): Promise<number> {
  const result = await client.generationRecord.aggregate({ _sum: { estimatedUsd: true } });
  return result._sum.estimatedUsd ?? 0;
}

/**
 * Throws BudgetExceededError if `estimatedUsd` would push the cumulative
 * projected spend past the cumulative allocated budget. Throws rather than
 * returning a boolean -- a boolean return can be ignored at a call site by
 * accident, a throw cannot (checkCeiling's own doc comment gives the same
 * reason, spend-ledger.ts:124-128).
 *
 * Reproduces checkCeiling's exact order and shape:
 *   1. Reject a non-finite or negative estimate FIRST, before any database
 *      access -- a broken cost calculation cannot reach the database.
 *   2. Ensure the current month's allocation is credited.
 *   3. Read both cumulative figures.
 *   4. Reject when the resolved cumulative allocation is not finite and
 *      positive -- refusing rather than silently allowing unlimited spend
 *      (fail-closed, mirrors checkCeiling's CR-01 fix).
 *   5. Compute projected = spent + estimatedUsd and reject only when
 *      projected > allocated -- the boundary stays inclusive.
 */
export async function checkBudget(
  estimatedUsd: number,
  client: PrismaClient = prisma,
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): Promise<void> {
  if (!Number.isFinite(estimatedUsd) || estimatedUsd < 0) {
    throw new BudgetExceededError(
      `Refusing call: estimated cost ${estimatedUsd} is not a valid non-negative finite number.`,
    );
  }

  await ensureCurrentMonthAllocation(client, env, now);

  const [allocated, spent] = await Promise.all([cumulativeAllocatedUsd(client), cumulativeSpentUsd(client)]);

  if (!Number.isFinite(allocated) || allocated <= 0) {
    throw new BudgetExceededError(
      `Refusing call: cumulative allocated budget ($${allocated}) is not a valid positive finite number -- ` +
        `refusing rather than silently allowing unlimited spend.`,
    );
  }

  const projected = spent + estimatedUsd;
  // Inclusive boundary: projected total exactly equal to the allocation is allowed.
  if (projected > allocated) {
    throw new BudgetExceededError(
      `Refusing call: budget is $${allocated.toFixed(2)}, already spent $${spent.toFixed(2)}, ` +
        `this call would add $${estimatedUsd.toFixed(2)} for a projected total of $${projected.toFixed(2)}.`,
    );
  }
}
