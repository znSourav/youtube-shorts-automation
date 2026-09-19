import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CARRIED_FORWARD_MESSAGE,
  generationTypeForCall,
  selectUnrecordedEntries,
  toPendingRecord,
  type ExistingGenerationRow,
} from "./historical-import.ts";
import { GenerationType } from "../persistence/generation-repository.ts";
import { loadLedger, LEDGER_PATH } from "../../lib/spend-ledger.ts";
import type { LedgerEntry } from "../../lib/spend-ledger.ts";

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    call: "scene-image:story-x:1",
    model: "gemini-3.1-flash-image",
    estimatedUsd: 0.067,
    usageMetadata: null,
    billed: true,
    at: "2026-09-12T04:39:57.286Z",
    ...overrides,
  };
}

function existingRow(overrides: Partial<ExistingGenerationRow> = {}): ExistingGenerationRow {
  return {
    generationType: GenerationType.IMAGE,
    model: "gemini-3.1-flash-image",
    estimatedUsd: 0.067,
    createdAt: "2026-09-12T04:39:57.286Z",
    message: "Image generated.",
    ...overrides,
  };
}

// --- generationTypeForCall -------------------------------------------------

test("generationTypeForCall maps every real call prefix to its GenerationType", () => {
  assert.equal(generationTypeForCall("story:3-scene"), GenerationType.STORY);
  assert.equal(generationTypeForCall("story:5-scene"), GenerationType.STORY);
  assert.equal(generationTypeForCall("uniqueness-comparison:abc"), GenerationType.UNIQUENESS_CHECK);
  assert.equal(generationTypeForCall("generic-image"), GenerationType.IMAGE);
  assert.equal(generationTypeForCall("childscene-image"), GenerationType.IMAGE);
  assert.equal(generationTypeForCall("scene-image:story-x:1"), GenerationType.IMAGE);
  assert.equal(generationTypeForCall("generic-video"), GenerationType.VIDEO);
  assert.equal(generationTypeForCall("childscene-video"), GenerationType.VIDEO);
  assert.equal(generationTypeForCall("childscene-conservative-video"), GenerationType.VIDEO);
  assert.equal(generationTypeForCall("scene-video:story-x:1"), GenerationType.VIDEO);
});

test("generationTypeForCall throws on an unrecognised prefix rather than guessing", () => {
  assert.throws(() => generationTypeForCall("mystery-call:whatever"), /mystery-call/);
});

// --- selectUnrecordedEntries -------------------------------------------------

test("selectUnrecordedEntries returns only the entry with no matching row when a matching row is 200ms apart", () => {
  const matched = entry({ call: "scene-image:a:1", at: "2026-09-12T04:39:57.200Z" });
  const unmatched = entry({ call: "scene-image:a:2", at: "2026-09-12T04:40:10.000Z" });
  const existing = existingRow({ createdAt: "2026-09-12T04:39:57.000Z" }); // 200ms from `matched`

  const result = selectUnrecordedEntries([matched, unmatched], [existing]);
  assert.equal(result.unrecorded.length, 1);
  assert.equal(result.unrecorded[0]!.call, "scene-image:a:2");
  assert.equal(result.claimedCount, 1);
});

test("selectUnrecordedEntries claims each existing row at most once: two identical entries, one matching row -> exactly one unrecorded", () => {
  const e1 = entry({ call: "scene-image:a:1", at: "2026-09-12T04:39:57.000Z" });
  const e2 = entry({ call: "scene-image:a:2", at: "2026-09-12T04:39:58.000Z" });
  const existing = existingRow({ createdAt: "2026-09-12T04:39:57.500Z" });

  const result = selectUnrecordedEntries([e1, e2], [existing]);
  assert.equal(result.unrecorded.length, 1);
  assert.equal(result.claimedCount, 1);
});

test("selectUnrecordedEntries does not claim a row whose timestamp is 30s away, whose amount differs by more than $0.0001, or whose model differs", () => {
  const base = entry({ at: "2026-09-12T04:39:57.000Z" });

  const farInTime = selectUnrecordedEntries([base], [existingRow({ createdAt: "2026-09-12T04:40:27.000Z" })]);
  assert.equal(farInTime.unrecorded.length, 1);
  assert.equal(farInTime.claimedCount, 0);

  const differentAmount = selectUnrecordedEntries([base], [existingRow({ estimatedUsd: 0.0672 })]);
  assert.equal(differentAmount.unrecorded.length, 1);
  assert.equal(differentAmount.claimedCount, 0);

  const differentModel = selectUnrecordedEntries([base], [existingRow({ model: "some-other-model" })]);
  assert.equal(differentModel.unrecorded.length, 1);
  assert.equal(differentModel.claimedCount, 0);
});

test("selectUnrecordedEntries ignores an existing row that carries the carried-forward marker message, even though it would otherwise match", () => {
  const e = entry({ at: "2026-09-12T04:39:57.000Z" });
  const markerRow = existingRow({ createdAt: "2026-09-12T04:39:57.000Z", message: CARRIED_FORWARD_MESSAGE });

  const result = selectUnrecordedEntries([e], [markerRow]);
  assert.equal(result.unrecorded.length, 1);
  assert.equal(result.claimedCount, 0);
});

test("selectUnrecordedEntries returns an empty list when every entry already has a matching row", () => {
  const e1 = entry({ call: "scene-image:a:1", at: "2026-09-12T04:39:57.000Z" });
  const e2 = entry({ call: "scene-video:a:1", at: "2026-09-12T04:40:00.000Z", estimatedUsd: 0.4 });
  const existing1 = existingRow({ createdAt: "2026-09-12T04:39:58.000Z" });
  const existing2 = existingRow({
    generationType: GenerationType.VIDEO,
    model: "gemini-3.1-flash-image",
    estimatedUsd: 0.4,
    createdAt: "2026-09-12T04:40:01.000Z",
  });

  const result = selectUnrecordedEntries([e1, e2], [existing1, existing2]);
  assert.deepEqual(result.unrecorded, []);
  assert.equal(result.claimedCount, 2);
});

// --- Against the real ledger file + a realistic 14-row fixture -------------

// Mirrors the 14 rows that already exist in prisma/dev.db from Phase 3's
// dual-write (confirmed directly against the real database while planning
// this test), so this test's "already recorded" population matches reality
// without this test itself touching a database.
const REAL_EXISTING_14_ROWS: ExistingGenerationRow[] = [
  { generationType: GenerationType.STORY, model: "gemini-3.1-pro-preview", estimatedUsd: 0.05, createdAt: "2026-09-13T13:04:59.671Z", message: "Story generated." },
  { generationType: GenerationType.STORY, model: "gemini-3.1-pro-preview", estimatedUsd: 0.05, createdAt: "2026-09-13T16:46:23.391Z", message: "Story generated." },
  { generationType: GenerationType.STORY, model: "gemini-3.1-pro-preview", estimatedUsd: 0.05, createdAt: "2026-09-13T16:48:14.205Z", message: "Story generated." },
  { generationType: GenerationType.STORY, model: "gemini-3.1-pro-preview", estimatedUsd: 0.05, createdAt: "2026-09-15T18:53:06.267Z", message: "Story generated." },
  { generationType: GenerationType.IMAGE, model: "gemini-3.1-flash-image", estimatedUsd: 0.067, createdAt: "2026-09-15T18:53:29.681Z", message: "Image generated." },
  { generationType: GenerationType.IMAGE, model: "gemini-3.1-flash-image", estimatedUsd: 0.067, createdAt: "2026-09-15T18:53:39.891Z", message: "Image generated." },
  { generationType: GenerationType.IMAGE, model: "gemini-3.1-flash-image", estimatedUsd: 0.067, createdAt: "2026-09-15T18:53:48.510Z", message: "Image generated." },
  { generationType: GenerationType.IMAGE, model: "gemini-3.1-flash-image", estimatedUsd: 0.067, createdAt: "2026-09-15T18:53:56.639Z", message: "Image generated." },
  { generationType: GenerationType.IMAGE, model: "gemini-3.1-flash-image", estimatedUsd: 0.067, createdAt: "2026-09-15T18:54:06.020Z", message: "Image generated." },
  { generationType: GenerationType.VIDEO, model: "veo-3.1-lite-generate-preview", estimatedUsd: 0.30000000000000004, createdAt: "2026-09-15T18:55:42.948Z", message: "Video generated." },
  { generationType: GenerationType.VIDEO, model: "veo-3.1-lite-generate-preview", estimatedUsd: 0.2, createdAt: "2026-09-15T18:56:18.840Z", message: "Video generated." },
  { generationType: GenerationType.VIDEO, model: "veo-3.1-lite-generate-preview", estimatedUsd: 0.4, createdAt: "2026-09-15T18:57:05.457Z", message: "Video generated." },
  { generationType: GenerationType.VIDEO, model: "veo-3.1-lite-generate-preview", estimatedUsd: 0.30000000000000004, createdAt: "2026-09-15T18:57:42.349Z", message: "Video generated." },
  { generationType: GenerationType.VIDEO, model: "veo-3.1-lite-generate-preview", estimatedUsd: 0.4, createdAt: "2026-09-15T18:58:29.432Z", message: "Video generated." },
];

test("against the real ledger file, feeding all 40 real entries and the real 14-row existing population returns exactly 26 unrecorded entries totalling $2.9370", () => {
  const ledger = loadLedger(LEDGER_PATH);
  assert.equal(ledger.entries.length, 40, "expected the real ledger file to still hold 40 entries");

  const result = selectUnrecordedEntries(ledger.entries, REAL_EXISTING_14_ROWS);

  assert.equal(result.unrecorded.length, 26);
  assert.equal(result.claimedCount, 14);

  const total = result.unrecorded.reduce((sum, e) => sum + e.estimatedUsd, 0);
  assert.ok(Math.abs(total - 2.937) <= 0.0001, `expected ~2.9370, got ${total}`);

  const byType = new Map<string, { count: number; total: number }>();
  for (const e of result.unrecorded) {
    const type = generationTypeForCall(e.call);
    const bucket = byType.get(type) ?? { count: 0, total: 0 };
    bucket.count += 1;
    bucket.total += e.estimatedUsd;
    byType.set(type, bucket);
  }
  assert.equal(byType.get(GenerationType.IMAGE)?.count, 11);
  assert.ok(Math.abs((byType.get(GenerationType.IMAGE)?.total ?? 0) - 0.737) <= 0.0005);
  assert.equal(byType.get(GenerationType.VIDEO)?.count, 5);
  assert.ok(Math.abs((byType.get(GenerationType.VIDEO)?.total ?? 0) - 1.7) <= 0.0005);
  assert.equal(byType.get(GenerationType.STORY)?.count, 10);
  assert.ok(Math.abs((byType.get(GenerationType.STORY)?.total ?? 0) - 0.5) <= 0.0005);
});

// --- toPendingRecord ---------------------------------------------------------

test("toPendingRecord maps type/model/amount verbatim, actualUsd null, ok mirrors billed, message is the fixed marker", () => {
  const billedEntry = entry({ call: "scene-video:a:1", model: "veo-3.1-lite-generate-preview", estimatedUsd: 0.4, billed: true });
  const record = toPendingRecord(billedEntry);
  assert.equal(record.generationType, GenerationType.VIDEO);
  assert.equal(record.model, "veo-3.1-lite-generate-preview");
  assert.equal(record.estimatedUsd, 0.4);
  assert.equal(record.actualUsd, null);
  assert.equal(record.billed, true);
  assert.equal(record.ok, true);
  assert.equal(record.message, CARRIED_FORWARD_MESSAGE);

  const blockedEntry = entry({ call: "story:3-scene", model: "gemini-3.1-pro-preview", estimatedUsd: 0.05, billed: false });
  const blockedRecord = toPendingRecord(blockedEntry);
  assert.equal(blockedRecord.billed, false);
  assert.equal(blockedRecord.ok, false);
  assert.equal(blockedRecord.message, CARRIED_FORWARD_MESSAGE);
});
