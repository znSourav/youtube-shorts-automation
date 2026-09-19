// The ONLY door Server Actions use for generation-record writes and scene
// asset-status updates, sitting beside story-repository.ts behind the same
// boundary invariant (check-boundaries.ts invariant 3: src/app/actions/ must
// reach the database only through src/core/persistence/). Every exported
// function takes an optional trailing `client = prisma` parameter, matching
// story-repository.ts's and spend-ledger.ts's injectable-default convention.
//
// All four functions below are BEST-EFFORT BY CONTRACT: each wraps its own
// write in a try/catch, logs one server-console line naming the story, the
// scene (if any), and the failure, and returns normally -- it never throws.
// This is deliberate, not an oversight: every call site here runs AFTER a
// paid provider call has already succeeded (or already failed and already
// been billed) and, for the image/video paths, after the asset has already
// been written to disk. A database failure at this point must never
// propagate into the caller's result -- a durability record is worth less
// than the asset it describes. This is the same judgement generate-images.ts
// already made at its disk-write-failure branch (choosing not to set its
// `stopped` flag when only the local write failed): a failure here costs a
// durability record, never the paid result. It is also why a story
// generated through a CLI probe that never persisted a story row still
// produces images normally -- the update simply finds no scene/story to
// attach to, logs once, and returns.
import { prisma } from "../../lib/db.ts";
import type { PrismaClient } from "../../generated/prisma/client.ts";
import { GenerationType, SceneAssetStatus } from "../../generated/prisma/enums.ts";
// Re-exported so Server Actions (and src/core/uniqueness/check.ts) can
// reference these enums' values without importing src/generated/prisma
// directly -- check-boundaries.ts invariant 3 requires src/app/actions/ to
// reach the database ONLY through this module.
export { GenerationType, SceneAssetStatus };

/**
 * The record shape minus the story id. The story id is deliberately absent
 * because the uniqueness gate makes paid calls (story attempts, uniqueness
 * comparisons) *before* the story row they belong to exists -- carrying the
 * id-less shape until flush time (recordGenerations) is what lets the
 * database keep a required foreign key instead of a nullable one.
 *
 * Never write a raw provider response, a prompt, or usage metadata into
 * `message` -- it is the same plain-language sentence the action already
 * returns to the browser, or a short fixed success phrase (T-03-06).
 */
export interface PendingGenerationRecord {
  generationType: GenerationType;
  model: string;
  estimatedUsd: number;
  actualUsd: number | null;
  billed: boolean;
  ok: boolean;
  message: string;
}

async function resolveSceneId(
  storyId: string,
  sceneNumber: number,
  client: PrismaClient,
): Promise<string | null> {
  const scene = await client.scene.findUnique({
    where: { storyId_sceneNumber: { storyId, sceneNumber } },
    select: { id: true },
  });
  return scene?.id ?? null;
}

/**
 * Writes one generation record. Resolves `sceneNumber` (when given) to that
 * story's scene id first, using the compound `[storyId, sceneNumber]` unique
 * key the schema already declares -- a scene number with no matching row
 * simply resolves to a null sceneId; the record still attaches to the story.
 * If the story itself does not exist, the write throws a foreign-key error,
 * caught below and logged once (never propagated).
 *
 * `storyId` may be `null`. A null id is reserved for a call dispatched
 * before its story exists, or for one whose story is never created (Phase 5:
 * see `recordGenerationAtDispatch` below, the enforcement ledger's own write
 * path) -- a null story id can never resolve a scene, so scene-id resolution
 * is skipped entirely in that case.
 */
export async function recordGeneration(
  storyId: string | null,
  record: PendingGenerationRecord,
  sceneNumber?: number,
  client: PrismaClient = prisma,
): Promise<void> {
  try {
    let sceneId: string | null = null;
    if (storyId !== null && sceneNumber !== undefined) {
      sceneId = await resolveSceneId(storyId, sceneNumber, client);
    }
    await client.generationRecord.create({
      data: {
        storyId,
        sceneId,
        generationType: record.generationType,
        model: record.model,
        estimatedUsd: record.estimatedUsd,
        actualUsd: record.actualUsd,
        billed: record.billed,
        ok: record.ok,
        message: record.message,
      },
    });
  } catch (err) {
    console.error(
      `generation-repository: recordGeneration failed for story ${storyId ?? "(none)"}` +
        (sceneNumber !== undefined ? ` scene ${sceneNumber}` : "") +
        ` (type=${record.generationType})`,
      err,
    );
  }
}

/**
 * Phase 5's enforcement-ledger write path: writes one generation record at
 * the moment its paid call is dispatched, with a null story id when the
 * story does not yet exist (or may never exist) -- linked to a story
 * afterward via `attachGenerationRecordsToStory` once its id exists. Meant
 * to run INSIDE the same `serializeDispatch` (src/core/budget/dispatch-chain.ts)
 * callback as the budget check and the paid call it accounts for, so the
 * check, the call, and the record are one serialized unit.
 *
 * Same best-effort contract as every other write in this module (try/catch,
 * one console.error naming the type and story, never throws) but returns the
 * created row's id on success -- or null on failure -- so the caller can
 * link it to a story later. A swallowed failure here under-counts future
 * spend by exactly the amount the retired file ledger's own lock-timeout
 * risk already carried (05-RESEARCH.md Pitfall 4, restated here because this
 * is the function that inherits it) -- a deliberate, accepted trade: a
 * database hiccup must never discard an already-paid-for result.
 */
export async function recordGenerationAtDispatch(
  record: PendingGenerationRecord,
  storyId: string | null,
  sceneNumber?: number,
  client: PrismaClient = prisma,
): Promise<string | null> {
  try {
    let sceneId: string | null = null;
    if (storyId !== null && sceneNumber !== undefined) {
      sceneId = await resolveSceneId(storyId, sceneNumber, client);
    }
    const row = await client.generationRecord.create({
      data: {
        storyId,
        sceneId,
        generationType: record.generationType,
        model: record.model,
        estimatedUsd: record.estimatedUsd,
        actualUsd: record.actualUsd,
        billed: record.billed,
        ok: record.ok,
        message: record.message,
      },
    });
    return row.id;
  } catch (err) {
    console.error(
      `generation-repository: recordGenerationAtDispatch failed for story ${storyId ?? "(none)"}` +
        (sceneNumber !== undefined ? ` scene ${sceneNumber}` : "") +
        ` (type=${record.generationType})`,
      err,
    );
    return null;
  }
}

/**
 * Best-effort `updateMany` linking already-written generation record ids
 * (from `recordGenerationAtDispatch`) to a story now that it has an id. A
 * no-op on an empty array -- returns immediately without touching the
 * database. Same never-throws contract as the rest of this module: the
 * records already exist and already count against her budget by the time
 * this runs, so a lost association here costs traceability only, never a
 * spend figure.
 */
export async function attachGenerationRecordsToStory(
  storyId: string,
  recordIds: string[],
  client: PrismaClient = prisma,
): Promise<void> {
  if (recordIds.length === 0) {
    return;
  }
  try {
    await client.generationRecord.updateMany({
      where: { id: { in: recordIds } },
      data: { storyId },
    });
  } catch (err) {
    console.error(
      `generation-repository: attachGenerationRecordsToStory failed for story ${storyId} (${recordIds.length} record ids)`,
      err,
    );
  }
}

/**
 * Flushes many story-level records (no scene number) against one story id
 * in one call -- used to attach the uniqueness gate's accumulated story +
 * comparison spend once the story row exists (create-story.ts). Each record
 * is written independently through recordGeneration's own best-effort
 * contract, so one failed write never blocks the others.
 */
export async function recordGenerations(
  storyId: string,
  records: PendingGenerationRecord[],
  client: PrismaClient = prisma,
): Promise<void> {
  for (const record of records) {
    await recordGeneration(storyId, record, undefined, client);
  }
}

/**
 * Targeted single-scene image path/status update, addressed by the
 * [storyId, sceneNumber] compound unique key. A scene that does not exist
 * (no database row for this story, e.g. a story generated via a CLI probe
 * that never persisted) logs once and returns normally without throwing.
 */
export async function updateSceneImage(
  storyId: string,
  sceneNumber: number,
  imagePath: string | null,
  status: SceneAssetStatus,
  client: PrismaClient = prisma,
): Promise<void> {
  try {
    await client.scene.update({
      where: { storyId_sceneNumber: { storyId, sceneNumber } },
      data: { imagePath, imageStatus: status },
    });
  } catch (err) {
    console.error(`generation-repository: updateSceneImage failed for story ${storyId} scene ${sceneNumber}`, err);
  }
}

/**
 * Targeted single-scene video path/status update -- VIDEO-03's database
 * half. Same best-effort contract as updateSceneImage.
 */
export async function updateSceneVideo(
  storyId: string,
  sceneNumber: number,
  videoPath: string | null,
  status: SceneAssetStatus,
  client: PrismaClient = prisma,
): Promise<void> {
  try {
    await client.scene.update({
      where: { storyId_sceneNumber: { storyId, sceneNumber } },
      data: { videoPath, videoStatus: status },
    });
  } catch (err) {
    console.error(`generation-repository: updateSceneVideo failed for story ${storyId} scene ${sceneNumber}`, err);
  }
}

/**
 * D-03: increments a scene's image/video attempt counter by 1. Best-effort
 * like every other write in this module -- deliberately: losing a counter
 * increment costs one extra permitted retry, while throwing here would cost
 * an already-paid-for generation.
 */
export async function incrementImageAttempt(
  storyId: string,
  sceneNumber: number,
  client: PrismaClient = prisma,
): Promise<void> {
  try {
    await client.scene.update({
      where: { storyId_sceneNumber: { storyId, sceneNumber } },
      data: { imageAttempts: { increment: 1 } },
    });
  } catch (err) {
    console.error(`generation-repository: incrementImageAttempt failed for story ${storyId} scene ${sceneNumber}`, err);
  }
}

export async function incrementVideoAttempt(
  storyId: string,
  sceneNumber: number,
  client: PrismaClient = prisma,
): Promise<void> {
  try {
    await client.scene.update({
      where: { storyId_sceneNumber: { storyId, sceneNumber } },
      data: { videoAttempts: { increment: 1 } },
    });
  } catch (err) {
    console.error(`generation-repository: incrementVideoAttempt failed for story ${storyId} scene ${sceneNumber}`, err);
  }
}
