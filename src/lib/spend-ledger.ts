import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// D-05: dev/testing ceiling for Phases 1-4 combined, carved out of the real
// $15 total the requester set (not additional to it), tracked in one file
// across all four phases rather than reset per phase.
export const DEV_CEILING_USD = 3.0;

// D-06: segregated throwaway path, deliberately distinct from the
// storage/stories/<id>/ structure real episodes use from Phase 2 onward.
export const LEDGER_PATH = "storage/_smoketest/spend-ledger.json";

export type LedgerEntry = {
  call: string;
  model: string;
  estimatedUsd: number;
  usageMetadata: unknown | null;
  billed: boolean;
  at: string;
};

export type Ledger = {
  ceilingUsd: number;
  entries: LedgerEntry[];
};

export class CeilingExceededError extends Error {}

/**
 * Loads the ledger from disk. A missing file is a legitimate first run and
 * yields zero spent. A present-but-unparseable file THROWS rather than
 * falling back to an empty ledger — reading a corrupted file as "$0 spent
 * so far" would silently disarm the ceiling (T-01-04).
 */
export function loadLedger(path: string = LEDGER_PATH): Ledger {
  if (!existsSync(path)) {
    return { ceilingUsd: DEV_CEILING_USD, entries: [] };
  }
  const raw = readFileSync(path, "utf8");
  // Intentionally not try/caught: a parse failure here must propagate as a
  // thrown error, not be swallowed into a zero-spend ledger.
  return JSON.parse(raw) as Ledger;
}

/**
 * Sums every entry's `estimatedUsd`. Throws rather than silently treating a
 * malformed entry (e.g. a hand-edited or corrupted `estimatedUsd` that is no
 * longer a valid non-negative finite number) as $0 spent — an unvalidated
 * entry could otherwise understate the running total and disarm the ceiling
 * gate in `checkCeiling` (fail-closed, per CR-01).
 */
export function totalSpentUsd(ledger: Ledger): number {
  return ledger.entries.reduce((sum, entry) => {
    if (!Number.isFinite(entry.estimatedUsd) || entry.estimatedUsd < 0) {
      throw new Error(`Ledger entry has invalid estimatedUsd: ${JSON.stringify(entry)}`);
    }
    return sum + entry.estimatedUsd;
  }, 0);
}

/**
 * Throws CeilingExceededError if `estimatedUsd` would push the running total
 * past the ceiling. Throws rather than returning a boolean — a boolean
 * return can be ignored at a call site by accident, a throw cannot.
 * Non-finite and negative estimates throw rather than pass, so a broken
 * cost calculation cannot disarm the gate (T-01-02).
 *
 * The *loaded* ledger's shape is validated too (CR-01): `ceilingUsd` must be
 * a valid positive finite number, and `totalSpentUsd` validates each entry's
 * `estimatedUsd`. A missing/malformed ceiling or entry on disk (bad manual
 * edit, bad merge resolution, future writer bug) MUST refuse the call rather
 * than silently pass every future check — `someNumber > undefined` and any
 * comparison against `NaN` evaluate to `false` in JS, so an unvalidated
 * ceiling would otherwise disarm the gate entirely. Fail closed, no
 * exceptions.
 */
export function checkCeiling(estimatedUsd: number, path: string = LEDGER_PATH): void {
  if (!Number.isFinite(estimatedUsd) || estimatedUsd < 0) {
    throw new CeilingExceededError(
      `Refusing call: estimated cost ${estimatedUsd} is not a valid non-negative finite number.`,
    );
  }
  const ledger = loadLedger(path);
  const ceiling = ledger.ceilingUsd;
  if (!Number.isFinite(ceiling) || ceiling <= 0) {
    throw new CeilingExceededError(
      `Refusing call: ledger ceilingUsd (${ceiling}) is not a valid positive finite number — ` +
        `refusing rather than silently allowing unlimited spend.`,
    );
  }
  const spent = totalSpentUsd(ledger);
  const projected = spent + estimatedUsd;
  // Inclusive boundary: projected total exactly equal to the ceiling is allowed.
  if (projected > ceiling) {
    throw new CeilingExceededError(
      `Refusing call: ceiling is $${ceiling.toFixed(2)}, already spent $${spent.toFixed(2)}, ` +
        `this call would add $${estimatedUsd.toFixed(2)} for a projected total of $${projected.toFixed(2)}.`,
    );
  }
}

/**
 * Records a call that was actually dispatched, including one whose output
 * was blocked, with `billed` reflecting whether usable output returned.
 * Conservative accounting is the point: whether a blocked call bills is
 * one of the things this phase is meant to establish empirically.
 */
export function recordSpend(entry: LedgerEntry, path: string = LEDGER_PATH): void {
  const ledger = existsSync(path) ? loadLedger(path) : { ceilingUsd: DEV_CEILING_USD, entries: [] };
  ledger.entries.push(entry);
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(ledger, null, 2));
}
