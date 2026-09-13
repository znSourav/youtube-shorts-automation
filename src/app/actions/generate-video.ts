"use server";

import { readFileSync } from "node:fs";
import { extname } from "node:path";

import { CeilingExceededError, checkCeiling, recordSpend } from "../../lib/spend-ledger.ts";
import { generateVideo, VIDEO_PRICE_PER_SECOND } from "../../providers/video/veo.ts";
import { sceneVideoPath } from "../../core/storage-paths.ts";
import type { Scene } from "../../core/story/schema.ts";
import {
  recordGeneration,
  updateSceneVideo,
  GenerationType,
  SceneAssetStatus,
} from "../../core/persistence/generation-repository.ts";

// Veo 3.1 Lite only supports these three clip lengths (docs/original-brief.md
// §14). The Story Director's own scene.duration is a creative-writing field
// and is not guaranteed to land exactly on one of these -- this resolves to
// the NEAREST supported value (never always-rounding-up, never a hardcoded
// max) so §14's per-scene variation actually reaches the paid call.
const SUPPORTED_DURATIONS = [4, 6, 8] as const;
const DEFAULT_DURATION_SECONDS = 8;

// Not exported by veo.ts -- mirrored here for the ledger's `model` field,
// matching smoke-test.ts's own VIDEO_MODEL_ID convention.
const VIDEO_MODEL_ID = "veo-3.1-lite-generate-preview";

// Second-layer guard (CR-03 / T-02-12): buildStoryPrompt's own instruction is
// the primary control; this catches a pose-change motion_prompt that slipped
// through anyway, BEFORE a real paid Veo call is dispatched on it.
// Deliberately broad -- a false positive here just substitutes an equally
// usable camera/environment-only prompt; a false negative risks paying for
// the exact head/torso kinematic artifact CR-03 identified.
const POSE_CHANGE_PATTERN =
  /\b(turns?|turning|turned|looks?|looking|looked|reaches?|reaching|reached|walks?|walking|walked|gestures?|gesturing|gestured|waves?|waving|waved|raises?|raising|raised)\b/i;

export interface GenerateSceneVideoResult {
  ok: boolean;
  // Internal bookkeeping only -- never rendered in the UI (T-02-06). Kept so
  // story-probe.ts can report the real on-disk path/size for its own output.
  videoPath: string | null;
  // What SceneVideo actually renders -- a self-contained data: URL, matching
  // generate-images.ts's transport pattern (no new file-serving route, no
  // filesystem path ever reaches rendered output).
  videoDataUrl: string | null;
  // Already plain-language -- rendered verbatim on failure.
  message: string;
  durationSeconds: number;
}

function mimeTypeForImagePath(imagePath: string): string {
  const ext = extname(imagePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      throw new Error(`Cannot infer mimeType for "${imagePath}": unrecognized extension "${ext}".`);
  }
}

function clampDuration(duration: number | undefined): number {
  if (duration === undefined || !Number.isFinite(duration)) {
    return DEFAULT_DURATION_SECONDS;
  }
  let nearest: number = SUPPORTED_DURATIONS[0];
  let smallestDiff = Math.abs(duration - nearest);
  for (const candidate of SUPPORTED_DURATIONS) {
    const diff = Math.abs(duration - candidate);
    if (diff < smallestDiff) {
      nearest = candidate;
      smallestDiff = diff;
    }
  }
  return nearest;
}

function safeMotionPrompt(scene: Scene): string {
  const original = scene.motion_prompt;
  if (!POSE_CHANGE_PATTERN.test(original)) {
    return original;
  }
  console.log(
    `generateSceneVideoAction: scene ${scene.scene_number}'s motion_prompt contained pose-change language ` +
      `("${original}") -- falling back to a camera/environment-only phrasing (CR-03 second-layer guard, T-02-12).`,
  );
  const camera = scene.camera?.trim() || "a slow, gentle camera drift";
  const environment = scene.environment?.trim() || "the scene";
  return (
    `${camera}, moving gently through ${environment}. Only ambient motion -- drifting light, particles, ` +
    "or a soft breeze through cloth or hair. The character holds their pose, calm and still, unchanged."
  );
}

/**
 * Single gated dispatch point for a scene's video (T-02-04): checkCeiling
 * immediately before every call -- including any future retry, since callers
 * always go through this function -- generateVideo (Phase 1, unchanged),
 * then recordSpend immediately after. Every outcome maps to one
 * plain-language sentence; the provider's own blockReason/operation name
 * never crosses into the return value's `message` (T-02-06) -- only into the
 * server console via generateVideo's own logRawResponse call.
 */
export async function generateSceneVideoAction(
  storyId: string,
  scene: Scene,
  imagePath: string,
): Promise<GenerateSceneVideoResult> {
  const durationSeconds = clampDuration(scene.duration);
  const estimatedUsd = durationSeconds * VIDEO_PRICE_PER_SECOND["720p"];

  try {
    checkCeiling(estimatedUsd);
  } catch (err) {
    const message =
      err instanceof CeilingExceededError
        ? "The generation budget was reached, so this scene's video could not be created."
        : "This scene's video could not be created due to an unexpected error.";
    // No provider call was dispatched -- nothing was necessarily billed, so
    // no generation record (mirrors the existing decision not to call
    // recordSpend here). The scene's status is still written.
    await updateSceneVideo(storyId, scene.scene_number, null, SceneAssetStatus.FAILED);
    return { ok: false, videoPath: null, videoDataUrl: null, message, durationSeconds };
  }

  let imageBytes: Buffer;
  let mimeType: string;
  try {
    imageBytes = readFileSync(imagePath);
    mimeType = mimeTypeForImagePath(imagePath);
  } catch (err) {
    console.error(`generateSceneVideoAction: failed to read scene image at ${imagePath}`, err);
    // Still pre-dispatch -- the Veo call never happened, so no generation
    // record; the scene's status is still written.
    await updateSceneVideo(storyId, scene.scene_number, null, SceneAssetStatus.FAILED);
    return {
      ok: false,
      videoPath: null,
      videoDataUrl: null,
      message: "The scene's image could not be read, so no video could be generated.",
      durationSeconds,
    };
  }

  const motionPrompt = safeMotionPrompt(scene);
  const outputPath = sceneVideoPath(storyId, scene.scene_number);

  let result;
  try {
    result = await generateVideo({
      imageBytes,
      mimeType,
      prompt: motionPrompt,
      durationSeconds,
      resolution: "720p",
      aspectRatio: "9:16",
      outputPath,
    });
  } catch (err) {
    // Not a classified block -- the call itself failed to complete. Nothing
    // was necessarily billed, so no recordSpend here (mirrors
    // generate-images.ts's identical convention), and no generation record.
    console.error(`generateSceneVideoAction: scene ${scene.scene_number} threw`, err);
    await updateSceneVideo(storyId, scene.scene_number, null, SceneAssetStatus.FAILED);
    return {
      ok: false,
      videoPath: null,
      videoDataUrl: null,
      message: "An unexpected error prevented this scene's video from being generated.",
      durationSeconds,
    };
  }

  recordSpend({
    call: `scene-video:${storyId}:${scene.scene_number}`,
    model: VIDEO_MODEL_ID,
    estimatedUsd,
    usageMetadata: result.usageMetadata,
    // Mirror the story/image convention (director.ts, generate-images.ts):
    // any dispatched call counts, including a block or a client-side polling
    // timeout, since by the time generateVideo() has returned here (rather
    // than throwing) the initial ai.models.generateVideos() dispatch already
    // succeeded -- timedOut and blocked are both post-dispatch outcomes that
    // may have already cost money on Veo's side regardless of what this
    // process could observe.
    billed: true,
    at: new Date().toISOString(),
  });

  // Dual write for the same dispatched call recordSpend above just wrote to
  // the real ledger -- IMAGE-03's "same is true ... for video" durability
  // requirement. Never a replacement for the ledger (unmodified above).
  const generationRecordBase = {
    generationType: GenerationType.VIDEO,
    model: VIDEO_MODEL_ID,
    estimatedUsd,
    actualUsd: null,
    billed: true,
  } as const;

  if (result.timedOut) {
    const message = "Generating this scene's video took too long and was stopped. Please try again.";
    await updateSceneVideo(storyId, scene.scene_number, null, SceneAssetStatus.FAILED);
    await recordGeneration(storyId, { ...generationRecordBase, ok: false, message }, scene.scene_number);
    return { ok: false, videoPath: null, videoDataUrl: null, message, durationSeconds };
  }

  if (result.blocked || !result.filePath) {
    const message = "The video could not be generated. Please try again.";
    await updateSceneVideo(storyId, scene.scene_number, null, SceneAssetStatus.FAILED);
    await recordGeneration(storyId, { ...generationRecordBase, ok: false, message }, scene.scene_number);
    return { ok: false, videoPath: null, videoDataUrl: null, message, durationSeconds };
  }

  let videoDataUrl: string | null = null;
  try {
    const videoBytes = readFileSync(result.filePath);
    videoDataUrl = `data:video/mp4;base64,${videoBytes.toString("base64")}`;
  } catch (err) {
    console.error(`generateSceneVideoAction: failed to read generated video at ${result.filePath}`, err);
    const message = "The video was generated but could not be loaded for playback. Please try again.";
    await updateSceneVideo(storyId, scene.scene_number, null, SceneAssetStatus.FAILED);
    await recordGeneration(storyId, { ...generationRecordBase, ok: false, message }, scene.scene_number);
    return {
      ok: false,
      videoPath: result.filePath,
      videoDataUrl: null,
      message,
      durationSeconds,
    };
  }

  await updateSceneVideo(storyId, scene.scene_number, result.filePath, SceneAssetStatus.READY);
  await recordGeneration(
    storyId,
    { ...generationRecordBase, ok: true, message: "Video generated." },
    scene.scene_number,
  );

  return {
    ok: true,
    videoPath: result.filePath,
    videoDataUrl,
    message: "Video generated.",
    durationSeconds,
  };
}
