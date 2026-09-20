"use server";

import { mkdirSync, writeFileSync } from "node:fs";

import { BudgetExceededError, checkBudget } from "../../core/budget/ledger.ts";
import { MissingApiKeyError, MISSING_API_KEY_MESSAGE, assertApiKeyConfigured } from "../../core/config/provider-key.ts";
import { serializeDispatch } from "../../core/budget/dispatch-chain.ts";
import {
  generateImage,
  IMAGE_PRICE_PER_CALL,
  type ImageBlockClassification,
} from "../../providers/image/gemini-image.ts";
import { sceneDir, sceneImagePath } from "../../core/storage-paths.ts";
import type { Scene, StoryDirectorOutput } from "../../core/story/schema.ts";
import {
  recordGeneration,
  updateSceneImage,
  setImageSaveCorrupted,
  GenerationType,
  SceneAssetStatus,
} from "../../core/persistence/generation-repository.ts";

type CharacterBible = StoryDirectorOutput["character_bible"];
type StyleBible = StoryDirectorOutput["style_bible"];

export interface SceneImageStatus {
  sceneNumber: number;
  // Internal bookkeeping / gating value only (page.tsx uses it to know
  // "does this scene have an image yet"). Never rendered as visible text --
  // the wife-facing UI must not display a filesystem path (T-02-06).
  imagePath: string | null;
  // What SceneCard actually renders -- a self-contained data: URL, so no
  // new HTTP route is needed to serve a file living outside Next.js's
  // public/ directory.
  imageDataUrl: string | null;
  ok: boolean;
  message: string;
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default: {
      // Defensive fallback for an unexpected-but-well-formed mimeType
      // (e.g. "image/gif") -- derive the extension from the subtype rather
      // than assuming a constant. Phase 1's 01-04-SUMMARY.md is the reason
      // this function exists at all: Gemini returned image/jpeg where the
      // earlier research assumed image/png.
      const subtype = mimeType.split("/")[1];
      return subtype && /^[a-z0-9]+$/i.test(subtype) ? subtype : "bin";
    }
  }
}

/**
 * Composes one scene's image prompt from three independent sources: the
 * scene's own image_prompt, the Character Bible's appearance/hair/clothing/
 * distinguishing-features text, and the Style Bible's rendering fields.
 * This is SCENE-02's operational half -- deliberate duplication across every
 * scene rather than reliance on the model remembering earlier scenes, since
 * each scene image is generated independently (docs/original-brief.md §17).
 */
function composeScenePrompt(scene: Scene, characterBible: CharacterBible, styleBible: StyleBible): string {
  return [
    scene.image_prompt,
    "Character continuity (must match exactly across every scene of this story): " +
      `appearance: ${characterBible.appearance}; hair: ${characterBible.hair}; ` +
      `clothing: ${characterBible.clothing}; distinguishing features: ${characterBible.distinguishing_features}.`,
    "Rendering style: " +
      `medium: ${styleBible.medium}; color palette: ${styleBible.color_palette}; ` +
      `character rendering: ${styleBible.character_rendering}.`,
  ].join(" ");
}

function plainLanguageBlockMessage(block?: ImageBlockClassification): string {
  if (!block) {
    return "The image could not be generated for an unknown reason. Please try again.";
  }
  if (block.stage === "prompt") {
    return "The image request was blocked before generation started. Please try a different description.";
  }
  return "The image generation did not return a usable image. Please try again.";
}

// One dispatched scene's outcome, returned from inside the serializeDispatch
// callback so the loop body (which owns `stopped` and `statuses`) can react
// without re-deriving what happened. `blocked` and `write-failed` are two
// separate kinds (not folded into one "failed") because only `blocked` sets
// `stopped` -- a local disk-write failure must not stop later, already-
// billable scenes from being attempted (see the write-failure branch below).
type DispatchedSceneOutcome =
  | { kind: "blocked"; message: string }
  | { kind: "write-failed"; message: string }
  | { kind: "success"; imagePath: string; imageDataUrl: string; message: string };

/**
 * Generates one image per scene, sequentially -- no parallelism, no job
 * queue (02-RESEARCH.md's Architecture Patterns; Phase 4 owns real per-scene
 * job tracking). The real monthly budget (`checkBudget`,
 * src/core/budget/ledger.ts) is checked immediately before every single
 * scene's `generateImage` call, and the durable spend record (`recordGeneration`)
 * is written immediately after a dispatched call returns (including a
 * blocked one, conservative accounting) -- both sit inside one
 * `serializeDispatch` (src/core/budget/dispatch-chain.ts) callback per scene,
 * so the check, the call, and the record are a single serialized unit with
 * respect to every other paid-call site in the process (Phase 5's shared
 * dispatch queue, established by plan 05-03). On a classified block -- or on
 * the budget itself refusing the call -- the loop stops; every remaining
 * scene is reported as skipped rather than silently attempted. No automatic
 * retry exists on this path.
 */
export async function generateSceneImagesAction(
  storyId: string,
  scenes: Scene[],
  characterBible: CharacterBible,
  styleBible: StyleBible,
): Promise<SceneImageStatus[]> {
  // STARTUP-02 (06-01, Task 2): checked ONCE, before the loop -- a missing
  // key cannot become present midway through a per-scene loop. Wrapped in
  // its own try/catch (rather than letting it throw out of the action
  // uncaught) so every requested scene gets a status carrying
  // MISSING_API_KEY_MESSAGE without ever calling updateSceneImage: no
  // dispatch occurred, so a scene's stored status must not be corrupted by
  // a refusal (the same reasoning dispatchSceneVideo's evaluateVideoDispatch
  // early return already documents).
  try {
    assertApiKeyConfigured();
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return scenes.map((scene) => ({
        sceneNumber: scene.scene_number,
        imagePath: null,
        imageDataUrl: null,
        ok: false,
        message: MISSING_API_KEY_MESSAGE,
      }));
    }
    throw err;
  }

  const estimatedUsd = Math.max(...Object.values(IMAGE_PRICE_PER_CALL));
  const statuses: SceneImageStatus[] = [];
  let stopped = false;

  for (const scene of scenes) {
    if (stopped) {
      statuses.push({
        sceneNumber: scene.scene_number,
        imagePath: null,
        imageDataUrl: null,
        ok: false,
        message: "Skipped because an earlier scene could not be generated.",
      });
      continue;
    }

    let outcome: DispatchedSceneOutcome;
    try {
      outcome = await serializeDispatch(async (): Promise<DispatchedSceneOutcome> => {
        await checkBudget(estimatedUsd);

        const prompt = composeScenePrompt(scene, characterBible, styleBible);
        const result = await generateImage({ prompt, aspectRatio: "9:16" });

        // This IS the record now -- generate-images.ts used to dual-write
        // the same dispatched call to both the throwaway dev ledger and
        // this table; the dev ledger write is gone (Phase 5), so this is
        // the one and only durable record of this dispatched call.
        //
        // Behavioural note: the record reflects the provider outcome, not
        // the wife-facing outcome -- a scene whose image generated
        // successfully but then failed to write to local disk (the
        // write-failed branch below) still gets a record showing a
        // successful, billed call. That is accurate: the money bought a
        // real image, even though she is correctly told the scene failed.
        const generationRecordBase = {
          generationType: GenerationType.IMAGE,
          model: result.modelUsed,
          estimatedUsd,
          actualUsd: null,
          billed: !result.blocked,
        } as const;

        if (result.blocked || !result.bytes || !result.mimeType) {
          const message = plainLanguageBlockMessage(result.block);
          await updateSceneImage(storyId, scene.scene_number, null, SceneAssetStatus.FAILED);
          await recordGeneration(storyId, { ...generationRecordBase, ok: false, message }, scene.scene_number);
          return { kind: "blocked", message };
        }

        const extension = extensionForMimeType(result.mimeType);
        const imagePath = sceneImagePath(storyId, scene.scene_number, extension);
        try {
          mkdirSync(sceneDir(storyId, scene.scene_number), { recursive: true });
          writeFileSync(imagePath, result.bytes);
        } catch (err) {
          // The paid call already succeeded and the spend record above
          // already ran -- only the local write failed (locked file, full
          // disk, permissions). Report this scene as failed but do NOT set
          // `stopped`: the budget gate and provider call for subsequent
          // scenes are unaffected, so already-paid-for progress on later
          // scenes should not be discarded.
          //
          // D-05 (Phase 6, 06-04): this is the image path's local
          // save-integrity failure branch -- the image analog of a
          // corrupted video save (06-RESEARCH.md Open Question 2: OUTPUT-02
          // itself is video-only, so no image container/pixel validator is
          // added here; D-05's exemption wording covers both asset types,
          // and this existing write-failure branch is the real, already-
          // present integrity failure on the image side). Sets the
          // exemption flag alongside the existing status write and
          // generation record, and the message tells her the retry is
          // free -- matching CORRUPT_VIDEO_MESSAGE's shape and tone.
          console.error(`generateSceneImagesAction: failed to write scene ${scene.scene_number}'s image to disk`, err);
          const message =
            "This scene's image didn't save properly, so it can't be used. Trying again won't use up one of this scene's attempts.";
          await updateSceneImage(storyId, scene.scene_number, null, SceneAssetStatus.FAILED);
          await setImageSaveCorrupted(storyId, scene.scene_number);
          await recordGeneration(storyId, { ...generationRecordBase, ok: false, message }, scene.scene_number);
          return { kind: "write-failed", message };
        }

        await updateSceneImage(storyId, scene.scene_number, imagePath, SceneAssetStatus.READY);
        await recordGeneration(
          storyId,
          { ...generationRecordBase, ok: true, message: "Image generated." },
          scene.scene_number,
        );

        return {
          kind: "success",
          imagePath,
          imageDataUrl: `data:${result.mimeType};base64,${result.bytes.toString("base64")}`,
          message: "Image generated.",
        };
      });
    } catch (err) {
      // Either the budget refused the call (no provider call was
      // dispatched -- nothing was necessarily billed, so no generation
      // record, mirroring the prior decision not to record here), or the
      // call itself failed to complete (e.g. a network error -- also
      // nothing necessarily billed). Either way, stop rather than keep
      // going into an unknown state; the scene's status is still written.
      stopped = true;
      // MissingApiKeyError branch ahead of the BudgetExceededError ternary:
      // unreachable in practice since the guard above already ran once
      // before this loop started, but kept here so this catch's message
      // selection stays correct in shape even if a future change moves the
      // guard back inside the loop.
      const message =
        err instanceof MissingApiKeyError
          ? MISSING_API_KEY_MESSAGE
          : err instanceof BudgetExceededError
            ? "The generation budget was reached, so this scene's image could not be created."
            : "This scene's image could not be created due to an unexpected error.";
      if (!(err instanceof MissingApiKeyError) && !(err instanceof BudgetExceededError)) {
        console.error(`generateSceneImagesAction: scene ${scene.scene_number} threw`, err);
      }
      await updateSceneImage(storyId, scene.scene_number, null, SceneAssetStatus.FAILED);
      statuses.push({ sceneNumber: scene.scene_number, imagePath: null, imageDataUrl: null, ok: false, message });
      continue;
    }

    if (outcome.kind === "blocked") {
      stopped = true;
      statuses.push({
        sceneNumber: scene.scene_number,
        imagePath: null,
        imageDataUrl: null,
        ok: false,
        message: outcome.message,
      });
      continue;
    }

    if (outcome.kind === "write-failed") {
      statuses.push({
        sceneNumber: scene.scene_number,
        imagePath: null,
        imageDataUrl: null,
        ok: false,
        message: outcome.message,
      });
      continue;
    }

    statuses.push({
      sceneNumber: scene.scene_number,
      imagePath: outcome.imagePath,
      imageDataUrl: outcome.imageDataUrl,
      ok: true,
      message: outcome.message,
    });
  }

  return statuses;
}
