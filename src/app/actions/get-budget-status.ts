"use server";

// BUDGET-03's thin Server Action wrapper -- mirrors get-story-status.ts's
// shape: a declared result interface, a try/catch that logs one line naming
// the action and returns a safe default rather than throwing, and reaching
// the database only through src/core/budget/status.ts, never Prisma, the
// generated client, or the database module directly.
//
// Deliberate deviation from 05-VALIDATION.md's Wave 0 list (recorded in
// 05-05-SUMMARY.md): no dedicated test file for this action. It is a
// three-line wrapper whose only logic is the failure path, and importing a
// "use server" module under the plain node:test runner would construct the
// real Prisma singleton against the real database. Its two testable
// properties are covered instead by status.test.ts's emptyBudgetStatus()
// shape test and this task's own structural check (the try/catch returning
// that shape, and the absence of any path-shaped field).
import { getBudgetStatus, emptyBudgetStatus, type BudgetStatus } from "../../core/budget/status.ts";

export async function getBudgetStatusAction(): Promise<BudgetStatus> {
  try {
    return await getBudgetStatus();
  } catch (err) {
    console.error("getBudgetStatusAction: failed to compute budget status", err);
    return emptyBudgetStatus();
  }
}
