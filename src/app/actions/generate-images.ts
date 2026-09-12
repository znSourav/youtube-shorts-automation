"use server";

import { mkdirSync, writeFileSync } from "node:fs";

import { CeilingExceededError, checkCeiling, recordSpend } from "../../lib/spend-ledger.ts";
import {
  generateImage,
  IMAGE_PRICE_PER_CALL,
  type ImageBlockClassification,
} from "../../providers/image/gemini-image.ts";
import { sceneDir, sceneImagePath } from "../../core/storage-paths.ts";
import type { Scene, StoryDirectorOutput } from "../../core/story/schema.ts";

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

/**
 * Generates one image per scene, sequentially -- no parallelism, no job
 * queue (02-RESEARCH.md's Architecture Patterns; Phase 4 owns real per-scene
 * job tracking). `checkCeiling` runs immediately before every single
 * scene's `generateImage` call, and `recordSpend` runs immediately after a
 * dispatched call returns (including a blocked one, conservative accounting
 * per spend-ledger.ts's own convention). On a classified block -- or on the
 * ceiling itself refusing the call -- the loop stops; every remaining scene
 * is reported as skipped rather than silently attempted. No automatic
 * retry exists on this path.
 */
export async function generateSceneImagesAction(
  storyId: string,
  scenes: Scene[],
  characterBible: CharacterBible,
  styleBible: StyleBible,
): Promise<SceneImageStatus[]> {
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

    try {
      checkCeiling(estimatedUsd);
    } catch (err) {
      stopped = true;
      const message =
        err instanceof CeilingExceededError
          ? "The generation budget was reached, so this scene's image could not be created."
          : "This scene's image could not be created due to an unexpected error.";
      statuses.push({ sceneNumber: scene.scene_number, imagePath: null, imageDataUrl: null, ok: false, message });
      continue;
    }

    const prompt = composeScenePrompt(scene, characterBible, styleBible);

    let result;
    try {
      result = await generateImage({ prompt, aspectRatio: "9:16" });
    } catch (err) {
      // Not a classified block -- the call itself failed to complete (e.g. a
      // network error). Nothing was necessarily billed, so no recordSpend
      // here; still stop rather than keep spending into an unknown state.
      stopped = true;
      console.error(`generateSceneImagesAction: scene ${scene.scene_number} threw`, err);
      statuses.push({
        sceneNumber: scene.scene_number,
        imagePath: null,
        imageDataUrl: null,
        ok: false,
        message: "An unexpected error prevented this scene's image from being generated.",
      });
      continue;
    }

    recordSpend({
      call: `scene-image:${storyId}:${scene.scene_number}`,
      model: result.modelUsed,
      estimatedUsd,
      usageMetadata: result.usageMetadata,
      billed: !result.blocked,
      at: new Date().toISOString(),
    });

    if (result.blocked || !result.bytes || !result.mimeType) {
      stopped = true;
      statuses.push({
        sceneNumber: scene.scene_number,
        imagePath: null,
        imageDataUrl: null,
        ok: false,
        message: plainLanguageBlockMessage(result.block),
      });
      continue;
    }

    const extension = extensionForMimeType(result.mimeType);
    const imagePath = sceneImagePath(storyId, scene.scene_number, extension);
    mkdirSync(sceneDir(storyId, scene.scene_number), { recursive: true });
    writeFileSync(imagePath, result.bytes);

    statuses.push({
      sceneNumber: scene.scene_number,
      imagePath,
      imageDataUrl: `data:${result.mimeType};base64,${result.bytes.toString("base64")}`,
      ok: true,
      message: "Image generated.",
    });
  }

  return statuses;
}
