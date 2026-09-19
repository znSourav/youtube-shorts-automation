// BUDGET-03: the server-computed figures the wife-facing spend indicator
// renders. Sits beside ledger.ts (the enforcement layer) as the read/display
// layer -- reuses ensureCurrentMonthAllocation/cumulativeAllocatedUsd/
// cumulativeSpentUsd rather than re-querying, so the number she reads is
// always derived from the exact same rows checkBudget itself gates against
// (T-05-20).
//
// display_decision (05-05-PLAN.md): the headline figure a caller renders is
// the rollover-inclusive one -- remainingUsd, i.e.
// cumulativeAllocatedUsd - cumulativeSpentUsd -- because that is precisely
// what checkBudget compares against. monthlyAllocationUsd/monthToDateSpentUsd
// exist for the expanded per-type detail only, and do NOT reflect rollover
// on their own.
//
// Rounds nothing here (05-RESEARCH.md Pitfall 3) -- two-decimal rendering is
// the display layer's (BudgetIndicator.tsx's) job; the real data already
// contains values like 0.30000000000000004 and rounding here would make the
// displayed figures disagree with the enforced ones.
//
// The result interface declares no field capable of holding a filesystem
// path, a model id, a prompt, or a story id (T-05-18) -- the same restraint
// SceneVideoStatusRow (get-story-status.ts) already exercises.
import type { PrismaClient } from "../../generated/prisma/client.ts";
import { prisma } from "../../lib/db.ts";
import { ensureCurrentMonthAllocation, cumulativeAllocatedUsd, cumulativeSpentUsd } from "./ledger.ts";
import { currentMonthKey, monthRange } from "./month.ts";

// She has no concept of "STORY" vs "UNIQUENESS_CHECK" -- both are Gemini
// text-model calls, folded into one "LLM" bucket here (05-RESEARCH.md
// "Generation-Type Breakdown Is Already Free"). BudgetIndicator.tsx is
// responsible for rendering "LLM" in her own language ("story writing"),
// this module only groups the data.
export type BudgetTypeBucket = "VIDEO" | "IMAGE" | "LLM";

export interface BudgetBreakdownEntry {
  type: BudgetTypeBucket;
  spentUsd: number;
}

export interface BudgetStatus {
  ok: boolean;
  monthKey: string;
  cumulativeAllocatedUsd: number;
  cumulativeSpentUsd: number;
  remainingUsd: number;
  monthlyAllocationUsd: number;
  monthToDateSpentUsd: number;
  // Exactly three entries, always, in this fixed order -- a bucket with no
  // rows this month still appears at zero, so the rendered list never
  // changes shape as she generates.
  breakdown: BudgetBreakdownEntry[];
}

const BREAKDOWN_TYPES: BudgetTypeBucket[] = ["VIDEO", "IMAGE", "LLM"];

/**
 * The zeroed, ok-false shape shared by the Server Action's failure path and
 * the browser's initial render, so the two can never drift into two
 * different definitions of "no data yet".
 */
export function emptyBudgetStatus(): BudgetStatus {
  return {
    ok: false,
    monthKey: "",
    cumulativeAllocatedUsd: 0,
    cumulativeSpentUsd: 0,
    remainingUsd: 0,
    monthlyAllocationUsd: 0,
    monthToDateSpentUsd: 0,
    breakdown: BREAKDOWN_TYPES.map((type) => ({ type, spentUsd: 0 })),
  };
}

function bucketForGenerationType(generationType: string): BudgetTypeBucket {
  if (generationType === "VIDEO") return "VIDEO";
  if (generationType === "IMAGE") return "IMAGE";
  // STORY and UNIQUENESS_CHECK both fold into LLM -- see BudgetTypeBucket's
  // doc comment above.
  return "LLM";
}

/**
 * Computes every figure BUDGET-03's indicator needs in one call: the
 * rollover-inclusive cumulative headroom (the enforcement-matching figure),
 * this month's own allocation, and this month's spend split by type. Credits
 * the current month first (ensureCurrentMonthAllocation), exactly as
 * checkBudget does, so a first-ever call this month is never read before it
 * is written.
 */
export async function getBudgetStatus(
  client: PrismaClient = prisma,
  env: Record<string, string | undefined> = process.env,
  now: Date = new Date(),
): Promise<BudgetStatus> {
  await ensureCurrentMonthAllocation(client, env, now);

  const monthKey = currentMonthKey(now);
  const { start, end } = monthRange(monthKey);

  const [allocated, spent, currentPeriod, groups] = await Promise.all([
    cumulativeAllocatedUsd(client),
    cumulativeSpentUsd(client),
    client.budgetPeriod.findUnique({ where: { month: monthKey } }),
    // No `billed` filter -- the displayed spend must agree with the
    // enforced spend, which counts every dispatched call regardless of
    // whether this process could locally observe success.
    client.generationRecord.groupBy({
      by: ["generationType"],
      where: { createdAt: { gte: start, lt: end } },
      _sum: { estimatedUsd: true },
    }),
  ]);

  const spentByType: Record<BudgetTypeBucket, number> = { VIDEO: 0, IMAGE: 0, LLM: 0 };
  for (const group of groups) {
    const bucket = bucketForGenerationType(group.generationType);
    spentByType[bucket] += group._sum.estimatedUsd ?? 0;
  }
  const monthToDateSpentUsd = spentByType.VIDEO + spentByType.IMAGE + spentByType.LLM;

  return {
    ok: true,
    monthKey,
    cumulativeAllocatedUsd: allocated,
    cumulativeSpentUsd: spent,
    remainingUsd: allocated - spent,
    monthlyAllocationUsd: currentPeriod?.allocatedUsd ?? 0,
    monthToDateSpentUsd,
    breakdown: BREAKDOWN_TYPES.map((type) => ({ type, spentUsd: spentByType[type] })),
  };
}
