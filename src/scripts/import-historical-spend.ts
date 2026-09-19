// One-time operator script (Task 2, plan 05-02): carries D-01's $5.0720 of
// Phase 1-4 development spend into the real budget ledger. Reads
// storage/_smoketest/spend-ledger.json's 40 real entries, reconciles them
// against prisma/dev.db's existing GenerationRecord rows via
// selectUnrecordedEntries (src/core/budget/historical-import.ts), and writes
// exactly the 26 unrecorded entries as new rows with a null storyId.
//
// In the same spirit as persistence-probe.ts/budget-probe.ts, but a
// write-once migration, not a repeatable probe -- deliberately excluded
// from test:lib (it touches the real database, not a temp fixture).
//
// Run with:
//   node src/scripts/import-historical-spend.ts --dry-run
//   node src/scripts/import-historical-spend.ts
import { prisma } from "../lib/db.ts";
import { loadLedger, LEDGER_PATH } from "../lib/spend-ledger.ts";
import {
  CARRIED_FORWARD_MESSAGE,
  selectUnrecordedEntries,
  toPendingRecord,
  type ExistingGenerationRow,
} from "../core/budget/historical-import.ts";

const EXPECTED_FINAL_ROW_COUNT = 40;
const EXPECTED_FINAL_TOTAL_USD = 5.072;
const EXPECTED_ALREADY_RECORDED_COUNT = 14;
const AMOUNT_ASSERTION_TOLERANCE_USD = 0.0001;

function isDryRun(): boolean {
  return process.argv.slice(2).includes("--dry-run");
}

async function loadExistingRows(): Promise<ExistingGenerationRow[]> {
  const rows = await prisma.generationRecord.findMany({
    select: { generationType: true, model: true, estimatedUsd: true, createdAt: true, message: true },
  });
  return rows;
}

async function main(): Promise<void> {
  const dryRun = isDryRun();

  // Refuse to run twice (before writing anything, and before the --dry-run
  // branch too, so a dry-run after a real run reports the same "already
  // happened" state rather than a stale would-import count).
  const alreadyCarriedForwardCount = await prisma.generationRecord.count({
    where: { message: CARRIED_FORWARD_MESSAGE },
  });
  if (alreadyCarriedForwardCount > 0) {
    const totals = await prisma.generationRecord.aggregate({ _sum: { estimatedUsd: true }, _count: true });
    console.log(
      `IMPORT HISTORICAL SPEND: carry-forward has already happened (${alreadyCarriedForwardCount} carried-forward ` +
        `rows present). Current total: ${totals._count} rows, $${(totals._sum.estimatedUsd ?? 0).toFixed(4)}.`,
    );
    return;
  }

  const ledger = loadLedger(LEDGER_PATH);
  const existingRows = await loadExistingRows();
  const { unrecorded, claimedCount } = selectUnrecordedEntries(ledger.entries, existingRows);

  console.log(
    `IMPORT HISTORICAL SPEND: ${ledger.entries.length} ledger entries, ${claimedCount} already recorded, ` +
      `${unrecorded.length} to import.`,
  );

  if (dryRun) {
    for (const entry of unrecorded) {
      const record = toPendingRecord(entry);
      console.log(
        `  would import: type=${record.generationType} model=${record.model} ` +
          `estimatedUsd=${record.estimatedUsd} billed=${record.billed} at=${entry.at}`,
      );
    }
    const dryRunTotal = unrecorded.reduce((sum, e) => sum + e.estimatedUsd, 0);
    console.log(
      `IMPORT HISTORICAL SPEND: dry run only -- would add $${dryRunTotal.toFixed(4)} across ${unrecorded.length} rows.`,
    );
    return;
  }

  if (claimedCount !== EXPECTED_ALREADY_RECORDED_COUNT) {
    console.error(
      `IMPORT HISTORICAL SPEND FAILED: expected ${EXPECTED_ALREADY_RECORDED_COUNT} already-recorded entries, ` +
        `found ${claimedCount} -- refusing to write against an unexpected starting state.`,
    );
    process.exitCode = 1;
    return;
  }

  // Deliberately NOT recordGeneration (best-effort by contract, swallows its
  // own failures -- correct for a durability dual-write beside an
  // already-paid-for asset, wrong for a one-time money-accounting migration
  // where a silently skipped row would understate spend forever). Writes go
  // through the Prisma client directly, inside one transaction so the 26
  // rows land all-or-nothing; any error propagates and fails the script loudly.
  await prisma.$transaction(async (tx) => {
    for (const entry of unrecorded) {
      const record = toPendingRecord(entry);
      await tx.generationRecord.create({
        data: {
          storyId: null,
          sceneId: null,
          generationType: record.generationType,
          model: record.model,
          estimatedUsd: record.estimatedUsd,
          actualUsd: record.actualUsd,
          billed: record.billed,
          ok: record.ok,
          message: record.message,
          createdAt: new Date(entry.at),
        },
      });
    }
  });

  // Self-verify before exiting: re-read the totals and assert they match
  // exactly what this migration is supposed to produce. Exit 1 loudly on
  // any mismatch rather than silently leaving the database in a
  // half-believed-correct state.
  const finalTotals = await prisma.generationRecord.aggregate({ _sum: { estimatedUsd: true }, _count: true });
  const finalCount = finalTotals._count;
  const finalTotal = finalTotals._sum.estimatedUsd ?? 0;

  if (finalCount !== EXPECTED_FINAL_ROW_COUNT) {
    console.error(`IMPORT HISTORICAL SPEND FAILED: expected ${EXPECTED_FINAL_ROW_COUNT} rows, found ${finalCount}.`);
    process.exitCode = 1;
    return;
  }
  if (Math.abs(finalTotal - EXPECTED_FINAL_TOTAL_USD) > AMOUNT_ASSERTION_TOLERANCE_USD) {
    console.error(
      `IMPORT HISTORICAL SPEND FAILED: expected $${EXPECTED_FINAL_TOTAL_USD.toFixed(4)} total, found $${finalTotal.toFixed(4)}.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`CARRY FORWARD OK -- ${finalCount} rows, $${finalTotal.toFixed(4)} total.`);
}

main();
