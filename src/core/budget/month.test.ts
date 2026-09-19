import { test } from "node:test";
import assert from "node:assert/strict";

import { monthlyBudgetUsd, DEFAULT_MONTHLY_BUDGET_USD, currentMonthKey, monthRange } from "./month.ts";

// Mirrors src/core/retry/caps.test.ts's style exactly. Every case passes a
// plain object as the `env` argument -- never mutates process.env.

test("monthlyBudgetUsd({}) returns DEFAULT_MONTHLY_BUDGET_USD (15)", () => {
  assert.equal(DEFAULT_MONTHLY_BUDGET_USD, 15);
  assert.equal(monthlyBudgetUsd({}), 15);
});

test('monthlyBudgetUsd({ MONTHLY_BUDGET_USD: "10" }) returns 10', () => {
  assert.equal(monthlyBudgetUsd({ MONTHLY_BUDGET_USD: "10" }), 10);
});

test('monthlyBudgetUsd({ MONTHLY_BUDGET_USD: "10.50" }) returns 10.5 -- a dollar amount, not an integer count', () => {
  assert.equal(monthlyBudgetUsd({ MONTHLY_BUDGET_USD: "10.50" }), 10.5);
});

for (const bad of ["abc", "", "0", "-5", "Infinity", "NaN"]) {
  test(`monthlyBudgetUsd({ MONTHLY_BUDGET_USD: ${JSON.stringify(bad)} }) returns the default`, () => {
    assert.equal(monthlyBudgetUsd({ MONTHLY_BUDGET_USD: bad }), DEFAULT_MONTHLY_BUDGET_USD);
  });
}

test('currentMonthKey(new Date("2026-09-19T23:30:00Z")) returns "2026-09"', () => {
  assert.equal(currentMonthKey(new Date("2026-09-19T23:30:00Z")), "2026-09");
});

test('currentMonthKey(new Date("2026-01-01T00:00:00Z")) returns "2026-01" (zero-padded)', () => {
  assert.equal(currentMonthKey(new Date("2026-01-01T00:00:00Z")), "2026-01");
});

test('monthRange("2026-09") returns start 2026-09-01 and end 2026-10-01 (both UTC midnight)', () => {
  const { start, end } = monthRange("2026-09");
  assert.equal(start.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(end.toISOString(), "2026-10-01T00:00:00.000Z");
});

test('monthRange("2026-12") rolls the year forward to 2027-01-01', () => {
  const { start, end } = monthRange("2026-12");
  assert.equal(start.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(end.toISOString(), "2027-01-01T00:00:00.000Z");
});
