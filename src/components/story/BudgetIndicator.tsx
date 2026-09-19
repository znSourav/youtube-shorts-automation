"use client";

import { useState } from "react";

// Deliberately imports nothing from the real budget module and calls no
// Server Action -- this component takes the status shape as a plain prop
// and holds exactly one piece of local state (expanded/collapsed). It owns
// no data fetching of its own; check-boundaries.ts invariant 1 (a "use
// client" file must never import the real budget module) is enforced on
// exactly this fact.
export type BudgetIndicatorBucketType = "VIDEO" | "IMAGE" | "LLM";

export interface BudgetIndicatorBreakdownEntry {
  type: BudgetIndicatorBucketType;
  spentUsd: number;
}

export interface BudgetIndicatorStatus {
  ok: boolean;
  remainingUsd: number;
  cumulativeAllocatedUsd: number;
  monthlyAllocationUsd: number;
  monthToDateSpentUsd: number;
  breakdown: BudgetIndicatorBreakdownEntry[];
}

export interface BudgetIndicatorProps {
  status: BudgetIndicatorStatus;
}

// She has no concept of "LLM" or a uniqueness check -- both the story
// writing and the originality check are, from her side, the app thinking
// about her story, so both land under one plain-language label here.
const BUCKET_LABELS: Record<BudgetIndicatorBucketType, string> = {
  VIDEO: "Video",
  IMAGE: "Images",
  LLM: "Story writing",
};

/**
 * D-03: a small, always-visible spend indicator -- the total at a glance,
 * the video/image/writing breakdown one tap away. Rendered once in
 * page.tsx, above the screen switch, so it is visible on every screen.
 * Mirrors VideoStatusScreen.tsx's/MyStoriesList.tsx's conventions: the
 * zinc/black palette, the existing spacing scale, plain-language copy, and
 * a props-in shape with no fetching of its own.
 *
 * This is a display, never a gate (T-05-02) -- the real refusal always
 * happens server-side inside checkBudget, regardless of what this
 * component currently shows.
 */
export default function BudgetIndicator({ status }: BudgetIndicatorProps) {
  const [expanded, setExpanded] = useState(false);

  // T-05-19: a failed status query hides the indicator entirely rather than
  // rendering a zeroed figure -- showing "$0.00 left" because a query
  // failed would mislead her in the most expensive possible direction.
  if (!status.ok) {
    return null;
  }

  const usedUp = status.remainingUsd <= 0;

  return (
    <div className="rounded border border-zinc-300 p-3 text-sm dark:border-zinc-700">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 text-left text-black dark:text-zinc-50"
      >
        <span>
          {usedUp
            ? "The generation budget is used up for now."
            : `$${status.remainingUsd.toFixed(2)} left of $${status.cumulativeAllocatedUsd.toFixed(2)}`}
        </span>
        <span className="text-zinc-600 dark:text-zinc-400">{expanded ? "Hide details" : "Details"}</span>
      </button>

      {expanded && (
        <div className="mt-3 flex flex-col gap-2 text-zinc-600 dark:text-zinc-400">
          {status.breakdown.map((entry) => (
            <div key={entry.type} className="flex items-center justify-between">
              <span>{BUCKET_LABELS[entry.type]}</span>
              <span>${entry.spentUsd.toFixed(2)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <span>This month&apos;s allocation</span>
            <span>${status.monthlyAllocationUsd.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Spent so far this month</span>
            <span>${status.monthToDateSpentUsd.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
