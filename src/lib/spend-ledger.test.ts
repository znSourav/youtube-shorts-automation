import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEV_CEILING_USD,
  LEDGER_PATH,
  loadLedger,
  totalSpentUsd,
  checkCeiling,
  recordSpend,
  CeilingExceededError,
  type Ledger,
  type LedgerEntry,
} from "./spend-ledger.ts";

// Every test below points the ledger at a throwaway path under node:os.tmpdir() —
// never at the real storage/_smoketest/spend-ledger.json, whose running total is
// real money already spent.
function tmpLedgerPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "spend-ledger-test-"));
  return join(dir, "spend-ledger.json");
}

function seedLedger(path: string, entries: LedgerEntry[]): void {
  const ledger: Ledger = { ceilingUsd: DEV_CEILING_USD, entries };
  writeFileSync(path, JSON.stringify(ledger));
}

function makeEntry(estimatedUsd: number): LedgerEntry {
  return {
    call: "generic-image",
    model: "gemini-3.1-flash-image",
    estimatedUsd,
    usageMetadata: null,
    billed: true,
    at: new Date().toISOString(),
  };
}

test("loadLedger returns { ceilingUsd: 3, entries: [] } when the file does not exist", () => {
  const path = tmpLedgerPath();
  const ledger = loadLedger(path);
  assert.deepEqual(ledger, { ceilingUsd: 3, entries: [] });
});

test("loadLedger throws on a present-but-unparseable file rather than reading it as $0 spent", () => {
  const path = tmpLedgerPath();
  writeFileSync(path, "{ this is not valid JSON ]");
  assert.throws(() => loadLedger(path));
});

test("totalSpentUsd sums entries correctly", () => {
  const entries = [makeEntry(0.067), makeEntry(0.2), makeEntry(0.4)];
  const total = totalSpentUsd({ ceilingUsd: DEV_CEILING_USD, entries });
  assert.ok(Math.abs(total - 0.667) < 1e-9, `expected ~0.667, got ${total}`);
});

test("checkCeiling returns normally when well under the ceiling", () => {
  const path = tmpLedgerPath();
  seedLedger(path, [makeEntry(2.0)]);
  assert.doesNotThrow(() => checkCeiling(0.4, path));
});

test("checkCeiling is inclusive at the exact boundary (2.60 + 0.40 = 3.00)", () => {
  const path = tmpLedgerPath();
  seedLedger(path, [makeEntry(2.6)]);
  assert.doesNotThrow(() => checkCeiling(0.4, path));
});

test("checkCeiling throws CeilingExceededError with all three figures when it would cross $3.00", () => {
  const path = tmpLedgerPath();
  seedLedger(path, [makeEntry(2.8)]);
  assert.throws(
    () => checkCeiling(0.4, path),
    (err: unknown) => {
      assert.ok(err instanceof CeilingExceededError);
      const message = (err as Error).message;
      assert.ok(message.includes("3"), `message should mention the ceiling 3.00: ${message}`);
      assert.ok(message.includes("2.8"), `message should mention 2.80 already spent: ${message}`);
      assert.ok(message.includes("0.4"), `message should mention the 0.40 refused: ${message}`);
      return true;
    },
  );
});

test("checkCeiling throws on NaN estimate", () => {
  const path = tmpLedgerPath();
  assert.throws(() => checkCeiling(NaN, path));
});

test("checkCeiling throws on negative estimate", () => {
  const path = tmpLedgerPath();
  assert.throws(() => checkCeiling(-1, path));
});

test("checkCeiling throws on Infinity estimate", () => {
  const path = tmpLedgerPath();
  assert.throws(() => checkCeiling(Infinity, path));
});

test("recordSpend followed by loadLedger round-trips the entry through disk", () => {
  const path = tmpLedgerPath();
  const entry = makeEntry(0.067);
  recordSpend(entry, path);
  const ledger = loadLedger(path);
  assert.deepEqual(ledger.entries[ledger.entries.length - 1], entry);
});

test("recordSpend creates the parent directory when it does not exist", () => {
  const dir = mkdtempSync(join(tmpdir(), "spend-ledger-test-"));
  const path = join(dir, "nested", "deeper", "spend-ledger.json");
  const entry = makeEntry(0.1);
  assert.doesNotThrow(() => recordSpend(entry, path));
  const raw = readFileSync(path, "utf8");
  const ledger = JSON.parse(raw) as Ledger;
  assert.deepEqual(ledger.entries[ledger.entries.length - 1], entry);
});
