// Reconciles storage/_smoketest/spend-ledger.json's 40 historical
// dev-testing entries against prisma/dev.db's already-persisted
// GenerationRecord rows, so D-01's $5.0720 carry-forward
// (05-01-SUMMARY.md Decision B = B1) imports only the entries no
// GenerationRecord row already accounts for.
//
// Why this file exists (not "just import all 40 entries"): the naive
// reading of 05-RESEARCH.md's "migrate the real entries" recommendation --
// insert one GenerationRecord per ledger entry -- would double-count the
// $2.1350 Phase 3's dual-write (recordGeneration, called from every real
// dispatch site since Phase 3) already wrote into prisma/dev.db for the 14
// most recent ledger entries. Double-counting real money against her budget
// is the specific failure this reconciliation prevents: importing all 40
// would leave the real budget system believing $2.9370 more had been spent
// than actually was, silently confiscating that much of her real headroom.
//
// Pure, database-free logic -- no I/O here, fully unit-testable without a
// database. src/scripts/import-historical-spend.ts is the one-time script
// that actually reads the ledger file and writes to SQLite; this module
// only decides WHAT to write.
import { GenerationType, type PendingGenerationRecord } from "../persistence/generation-repository.ts";
import type { LedgerEntry } from "../../lib/spend-ledger.ts";

/**
 * Fixed marker message written to every carried-forward row's `message`
 * field. Doubles as the plain-language explanation an operator reads later
 * (Prisma Studio, a raw query) and as the identifying marker
 * selectUnrecordedEntries discards on any subsequent call, so a stray
 * carried-forward row can never itself be treated as a fresh match for
 * some other entry.
 */
export const CARRIED_FORWARD_MESSAGE =
  "Carried forward from Phases 1-2 development/testing spend " +
  "(storage/_smoketest/spend-ledger.json) per D-01: this dollar was " +
  "genuinely spent before the real per-month budget system existed, so it " +
  "counts against her real headroom from day one instead of starting the " +
  "real budget at zero.";

/**
 * Every real `call` field prefix (the leading segment before the first
 * colon) this project's dev ledger has ever written, mapped to the
 * GenerationRecord type it resolves to. Deliberately exact-match, not
 * substring matching on the model name -- 05-RESEARCH.md's anti-pattern
 * list is explicit that model-string matching is fragile, and every real
 * entry's prefix is unambiguous.
 */
const TYPE_BY_CALL_PREFIX: Record<string, GenerationType> = {
  story: GenerationType.STORY,
  "uniqueness-comparison": GenerationType.UNIQUENESS_CHECK,
  "generic-image": GenerationType.IMAGE,
  "childscene-image": GenerationType.IMAGE,
  "scene-image": GenerationType.IMAGE,
  "generic-video": GenerationType.VIDEO,
  "childscene-video": GenerationType.VIDEO,
  "childscene-conservative-video": GenerationType.VIDEO,
  "scene-video": GenerationType.VIDEO,
};

/**
 * Resolves a ledger entry's `call` field (e.g. "story:5-scene",
 * "scene-image:story-x:3", "generic-video") to its GenerationType, using
 * only the leading segment before the first colon. Throws on an
 * unrecognised prefix rather than guessing -- an unclassifiable historical
 * entry must stop the import, not land in the wrong bucket.
 */
export function generationTypeForCall(call: string): GenerationType {
  const prefix = call.split(":")[0];
  const type = TYPE_BY_CALL_PREFIX[prefix];
  if (type === undefined) {
    throw new Error(`generationTypeForCall: unrecognised call prefix "${prefix}" (from call "${call}")`);
  }
  return type;
}

/**
 * The subset of a real GenerationRecord row selectUnrecordedEntries needs
 * to decide whether a ledger entry was already dual-written by Phase 3's
 * live dispatch sites. `createdAt` accepts a Date (what Prisma returns) or
 * an ISO string (what a hand-built fixture might use).
 */
export interface ExistingGenerationRow {
  generationType: GenerationType;
  model: string;
  estimatedUsd: number;
  createdAt: Date | string;
  message: string;
}

export interface SelectUnrecordedResult {
  unrecorded: LedgerEntry[];
  claimedCount: number;
}

const AMOUNT_TOLERANCE_USD = 0.0001;
const TIMESTAMP_TOLERANCE_MS = 5000;

function toEpochMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * The reconciling pass: walks `entries` in ascending timestamp order and,
 * for each, looks for an unclaimed row in `existingRows` with the same
 * resolved generation type, the same model, an estimatedUsd within
 * $0.0001, and a createdAt within five seconds of the entry's `at`. A
 * matched row is claimed at most once; an entry with no match is returned
 * as unrecorded.
 *
 * Any existing row whose `message` equals CARRIED_FORWARD_MESSAGE is
 * discarded from the candidate pool before matching begins, so a row this
 * same import already wrote can never be mistaken for independent evidence
 * that some other entry was recorded elsewhere -- a defense-in-depth
 * property backing the script-level "refuse to run twice" guard, not a
 * replacement for it.
 */
export function selectUnrecordedEntries(
  entries: LedgerEntry[],
  existingRows: ExistingGenerationRow[],
): SelectUnrecordedResult {
  const candidates = existingRows
    .filter((row) => row.message !== CARRIED_FORWARD_MESSAGE)
    .map((row) => ({ row, claimed: false }));

  const sortedEntries = [...entries].sort((a, b) => toEpochMs(a.at) - toEpochMs(b.at));

  const unrecorded: LedgerEntry[] = [];
  let claimedCount = 0;

  for (const entry of sortedEntries) {
    const entryType = generationTypeForCall(entry.call);
    const entryAt = toEpochMs(entry.at);
    const match = candidates.find(
      (c) =>
        !c.claimed &&
        c.row.generationType === entryType &&
        c.row.model === entry.model &&
        Math.abs(c.row.estimatedUsd - entry.estimatedUsd) <= AMOUNT_TOLERANCE_USD &&
        Math.abs(toEpochMs(c.row.createdAt) - entryAt) <= TIMESTAMP_TOLERANCE_MS,
    );
    if (match) {
      match.claimed = true;
      claimedCount += 1;
    } else {
      unrecorded.push(entry);
    }
  }

  return { unrecorded, claimedCount };
}

/**
 * Maps one unrecorded ledger entry to the PendingGenerationRecord shape
 * import-historical-spend.ts writes. `ok` mirrors `billed` -- in this
 * codebase's convention a blocked call is exactly a call that produced no
 * usable output and was recorded unbilled (PROJECT.md's conservative
 * accounting convention). `message` is always the fixed marker so the row
 * is identifiable as carried-forward later.
 */
export function toPendingRecord(entry: LedgerEntry): PendingGenerationRecord {
  return {
    generationType: generationTypeForCall(entry.call),
    model: entry.model,
    estimatedUsd: entry.estimatedUsd,
    actualUsd: null,
    billed: entry.billed,
    ok: entry.billed,
    message: CARRIED_FORWARD_MESSAGE,
  };
}
