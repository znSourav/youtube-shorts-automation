// BUDGET-02: the requester-facing monthly figure, and the UTC calendar-month
// bookkeeping the real per-month allocation ledger needs. Deliberately
// separate from ledger.ts (05-RESEARCH.md's recommended structure) so
// ledger.ts stays focused on the database-touching enforcement logic while
// this file stays pure, zero-I/O month arithmetic -- mirrors gates.ts's own
// zero-I/O design philosophy where practical.
//
// monthlyBudgetUsd is modeled on src/core/retry/caps.ts's
// maxSceneRetryAttempts() EXACTLY: read env.MONTHLY_BUDGET_USD, default on
// absent/malformed/non-positive, injectable env parameter, never mutate
// process.env. The one deliberate difference: this is a dollar amount (can
// be fractional, e.g. "10.50"), not an integer attempt count, so there is no
// Number.isInteger() check here.
//
// Critical difference from src/lib/spend-ledger.ts's DEV_CEILING_USD
// (05-RESEARCH.md Pitfall 1): DEV_CEILING_USD is a hardcoded source literal,
// hand-raised by editing this file on every increase. MONTHLY_BUDGET_USD is
// read from process.env on every call, with DEFAULT_MONTHLY_BUDGET_USD as
// the only source-level dollar figure in this module -- that is what
// satisfies BUDGET-02's "enforced without a code change" requirement.
export const DEFAULT_MONTHLY_BUDGET_USD = 15;

export function monthlyBudgetUsd(env: Record<string, string | undefined> = process.env): number {
  const raw = env.MONTHLY_BUDGET_USD;
  if (raw === undefined) {
    return DEFAULT_MONTHLY_BUDGET_USD;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_MONTHLY_BUDGET_USD;
  }
  return parsed;
}

/**
 * "YYYY-MM" for the given date's UTC calendar month, zero-padded. Used as
 * BudgetPeriod's unique key -- UTC (not local time) so the key never depends
 * on the machine's timezone.
 */
export function currentMonthKey(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // getUTCMonth() is 0-indexed
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * The [start, end) UTC instant range a "YYYY-MM" month key covers. `end` is
 * exclusive -- the first instant of the FOLLOWING month -- so a
 * `createdAt >= start && createdAt < end` filter is correct with no
 * off-by-one at the month boundary. Rolls the year forward for December.
 */
export function monthRange(monthKey: string): { start: Date; end: Date } {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-indexed, matching currentMonthKey's output

  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endYear = month === 12 ? year + 1 : year;
  const endMonth = month === 12 ? 1 : month + 1;
  const end = new Date(Date.UTC(endYear, endMonth - 1, 1, 0, 0, 0, 0));

  return { start, end };
}
