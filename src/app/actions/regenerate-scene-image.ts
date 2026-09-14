"use server";

import { storyDir } from "../../core/storage-paths.ts";
import { findStoryWithScenes } from "../../core/persistence/story-repository.ts";
import { evaluateImageRegeneration } from "../../core/approval/gates.ts";
import { maxSceneRetryAttempts } from "../../core/retry/caps.ts";
import { incrementImageAttempt } from "../../core/persistence/generation-repository.ts";
import { generateSceneImagesAction } from "./generate-images.ts";
import type { Scene, StoryDirectorOutput } from "../../core/story/schema.ts";

export interface RegenerateSceneImageResult {
  ok: boolean;
  sceneNumber: number;
  // A data: URL, never a filesystem path -- see the doc comment below: this
  // type declares no field whose value is a filesystem path at all, so
  // SceneImageStatus.imagePath has nowhere to land even by accident.
  imageDataUrl: string | null;
  message: string;
  // Non-null only when this refusal is specifically a reached retry cap --
  // lets the browser tell an exhausted-cap refusal apart from a transient/
  // not-found one, so it can render the calm amber inline note (D-03)
  // rather than a generic error.
  capMessage: string | null;
  // Non-null only when the story's images were already approved before this
  // regeneration -- the UI-SPEC's one-time post-approval heads-up, resolving
  // 04-RESEARCH.md Open Question 1: the approval flag stays intact and the
  // change is surfaced to her rather than silently voided (D-02).
  approvalNotice: string | null;
}

/**
 * IMAGE-02: replaces exactly one scene's image, touching nothing else.
 *
 * Deliberately NOT gated on approval -- D-02 scopes approval to gating video
 * spend only; regenerating an image spends image money, not video money.
 * imagesApprovedAt is deliberately left intact afterward -- the UI-SPEC's
 * state-persistence row settled 04-RESEARCH.md Open Question 1 in favour of
 * surfacing the change (via `approvalNotice`) rather than silently
 * revoking her decision.
 *
 * Reuses generateSceneImagesAction (the single existing image dispatch
 * point) for a one-element array rather than opening a second call site --
 * that function is already per-scene isolated, already ceiling-gated,
 * already records spend, and already writes only that scene's row through
 * the [storyId, sceneNumber] compound key. This keeps check-boundaries.ts
 * invariant 5 green: no second Gemini Image call site is created.
 */
export async function regenerateSceneImageAction(
  storyId: string,
  sceneNumber: number,
): Promise<RegenerateSceneImageResult> {
  try {
    storyDir(storyId);
  } catch {
    return {
      ok: false,
      sceneNumber,
      imageDataUrl: null,
      message: "This story could not be found.",
      capMessage: null,
      approvalNotice: null,
    };
  }

  let story = null;
  try {
    story = await findStoryWithScenes(storyId);
  } catch (err) {
    console.error(`regenerateSceneImageAction: failed to read story ${storyId}`, err);
  }

  const decision = evaluateImageRegeneration(story, sceneNumber, maxSceneRetryAttempts());
  if (!decision.allowed) {
    return {
      ok: false,
      sceneNumber,
      imageDataUrl: null,
      message: decision.message,
      // The browser needs to tell an exhausted-cap refusal apart from a
      // not-found refusal, so it can render the calm amber inline note
      // rather than a transient error -- only set when the story and scene
      // both existed (i.e. this decision came from the cap check, not a
      // not-found branch).
      capMessage: story !== null ? decision.message : null,
      approvalNotice: null,
    };
  }

  // D-03: the increment sits before any dispatch -- a regeneration that
  // dies mid-call still consumes one of its limited attempts.
  await incrementImageAttempt(storyId, sceneNumber);

  const thatOneScene: Scene = {
    scene_number: decision.scene.sceneNumber,
    duration: decision.scene.durationSeconds ?? undefined,
    story_purpose: decision.scene.storyPurpose,
    image_prompt: decision.scene.imagePrompt,
    motion_prompt: decision.scene.motionPrompt,
  };

  const characterBible = story?.characterBible as StoryDirectorOutput["character_bible"];
  const styleBible = story?.styleBible as StoryDirectorOutput["style_bible"];

  const statuses = await generateSceneImagesAction(storyId, [thatOneScene], characterBible, styleBible);
  const status = statuses[0];

  return {
    ok: status.ok,
    sceneNumber,
    imageDataUrl: status.imageDataUrl,
    message: status.message,
    capMessage: null,
    approvalNotice: decision.alreadyApproved
      ? "You already approved these images — this new one will be used for video generation without asking you to approve again."
      : null,
  };
}
