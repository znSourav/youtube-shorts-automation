// Standalone CLI probe for the real budget gate (src/core/budget/ledger.ts),
// in the same spirit as persistence-probe.ts/uniqueness-probe.ts. Makes ZERO
// provider calls -- it drives the real prisma/dev.db through
// ensureCurrentMonthAllocation/checkBudget only, the same functions
// get-story-status.ts's headroom probe now uses. Developer-only: not part
// of test:lib (it touches the real database, not a temp fixture), matching
// how story-probe.ts and persistence-probe.ts are already excluded.
//
// Run with:
//   node src/scripts/budget-probe.ts --expect=pass
//   node src/scripts/budget-probe.ts --expect=refuse
import {
  ensureCurrentMonthAllocation,
  cumulativeAllocatedUsd,
  cumulativeSpentUsd,
  checkBudget,
  BudgetExceededError,
} from "../core/budget/ledger.ts";
import { currentMonthKey } from "../core/budget/month.ts";

// The worst-case per-scene cost this app ever dispatches -- 8 seconds (the
// longest supported scene) at the "720p" price, the same conservative
// estimate get-story-status.ts's headroom probe uses (MAX_SCENE_VIDEO_COST_USD).
const PROBE_CALL_COST_USD = 8 * 0.05;

type Expectation = "pass" | "refuse";

function parseExpectation(): Expectation {
  const arg = process.argv.slice(2).find((a) => a.startsWith("--expect="));
  const value = arg ? arg.slice("--expect=".length) : "pass";
  if (value !== "pass" && value !== "refuse") {
    console.error(`Usage: budget-probe.ts --expect=pass | --expect=refuse (got "${value}")`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const expect = parseExpectation();

  // Side effect, matching production behaviour: this is the exact call
  // get-story-status.ts and every real dispatch site make before reading
  // the cumulative figures -- running this probe legitimately credits the
  // real current-month BudgetPeriod row, not a test artifact.
  await ensureCurrentMonthAllocation();

  const month = currentMonthKey();
  const allocated = await cumulativeAllocatedUsd();
  const spent = await cumulativeSpentUsd();
  const headroom = allocated - spent;

  console.log(
    `BUDGET PROBE: month=${month} allocated=$${allocated.toFixed(2)} spent=$${spent.toFixed(2)} ` +
      `headroom=$${headroom.toFixed(2)}`,
  );

  let outcome: Expectation;
  try {
    await checkBudget(PROBE_CALL_COST_USD);
    outcome = "pass";
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      outcome = "refuse";
      console.log(`BUDGET PROBE: checkBudget(${PROBE_CALL_COST_USD.toFixed(2)}) refused -- ${err.message}`);
    } else {
      throw err;
    }
  }

  if (outcome === expect) {
    console.log("BUDGET PROBE OK");
  } else {
    console.error(
      `BUDGET PROBE FAIL: expected ${expect} but observed ${outcome} for a $${PROBE_CALL_COST_USD.toFixed(2)} call ` +
        `against $${allocated.toFixed(2)} allocated / $${spent.toFixed(2)} spent`,
    );
    process.exitCode = 1;
  }
}

main();
