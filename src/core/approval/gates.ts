// This module is the phase's access-control surface (APPROVAL-01, D-01,
// D-02, D-03): every refusal message here is already plain language and is
// returned verbatim to the browser, and no branch may ever embed a
// filesystem path, a model id, a scene id, or raw provider text into a
// message.
//
// Zero I/O by design -- this module imports only the StoryWithScenes type
// from story-repository.ts and nothing else. That purity is the point: it
// is directly unit-testable with plain object fixtures and needs no
// database, no provider, and no Server Action serialization. Callers
// (Server Actions) fetch the story, then hand it to these pure functions to
// decide what to do.
import type { StoryWithScenes } from "../persistence/story-repository.ts";

export type GateRefusal = { allowed: false; message: string };

export type SceneRow = StoryWithScenes["scenes"][number];

export type VideoDispatchDecision = GateRefusal | { allowed: true; scene: SceneRow; imagePath: string };

export type ApprovalDecision = GateRefusal | { allowed: true };

export type ImageRegenerationDecision = GateRefusal | { allowed: true; scene: SceneRow; alreadyApproved: boolean };

/**
 * Decides whether a scene's video generation may be dispatched. Branch
 * order is load-bearing -- the approval check comes before anything that
 * could leak whether a particular scene exists or is ready:
 *   1. story not found
 *   2. story not approved (APPROVAL-01's "through any path" gate)
 *   3. scene not found
 *   4. scene's video-attempt cap reached (D-03)
 *   5. scene's image isn't ready
 *   6. grant, handing back the scene row and its own server-resolved
 *      imagePath (RESEARCH.md Pattern 3 -- never a client-supplied path)
 */
export function evaluateVideoDispatch(
  story: StoryWithScenes | null,
  sceneNumber: number,
  maxVideoAttempts: number,
): VideoDispatchDecision {
  if (story === null) {
    return { allowed: false, message: "This story could not be found." };
  }

  if (story.imagesApprovedAt === null) {
    return {
      allowed: false,
      message: "These images haven't been approved yet. Approve them before generating video.",
    };
  }

  const scene = story.scenes.find((s) => s.sceneNumber === sceneNumber);
  if (!scene) {
    return { allowed: false, message: "That scene could not be found in this story." };
  }

  if (scene.videoAttempts >= maxVideoAttempts) {
    return {
      allowed: false,
      message:
        `This scene's video has reached its limit of ${maxVideoAttempts} attempts. The other scenes aren't ` +
        "affected — you can continue with what's ready, or start a new story to try again.",
    };
  }

  if (scene.imageStatus !== "READY" || scene.imagePath === null) {
    return { allowed: false, message: "This scene's image isn't ready yet, so its video can't be generated." };
  }

  return { allowed: true, scene, imagePath: scene.imagePath };
}

/**
 * Decides whether a story's scene images may be approved (D-01/D-02): every
 * scene image must be READY with a resolved path before the single
 * story-level approval action can be recorded.
 */
export function evaluateApproval(story: StoryWithScenes | null): ApprovalDecision {
  if (story === null) {
    return { allowed: false, message: "This story could not be found." };
  }

  const notReady = story.scenes.some((s) => s.imageStatus !== "READY" || s.imagePath === null);
  if (notReady) {
    return { allowed: false, message: "All scene images need to be ready before you can approve them." };
  }

  return { allowed: true };
}

/**
 * Decides whether a single scene's image may be regenerated (IMAGE-02,
 * D-03). Deliberately NO approval check on this path: regenerating an
 * image spends image money, not video money, and D-02 scopes approval to
 * gating video generation only. `alreadyApproved` reflects whether the
 * story's images were already approved at the time of this decision -- it
 * is how plan 04-02 decides whether to surface the UI-SPEC's one-time
 * amber heads-up ("You already approved these images — this new one will
 * be used for video generation without asking you to approve again."),
 * resolving 04-RESEARCH.md Open Question 1 the way the UI-SPEC's
 * state-persistence row settled it: the approval flag stays intact and the
 * change is surfaced to her rather than silently voided.
 */
export function evaluateImageRegeneration(
  story: StoryWithScenes | null,
  sceneNumber: number,
  maxImageAttempts: number,
): ImageRegenerationDecision {
  if (story === null) {
    return { allowed: false, message: "This story could not be found." };
  }

  const scene = story.scenes.find((s) => s.sceneNumber === sceneNumber);
  if (!scene) {
    return { allowed: false, message: "That scene could not be found in this story." };
  }

  if (scene.imageAttempts >= maxImageAttempts) {
    return {
      allowed: false,
      message:
        `This scene's image has reached its limit of ${maxImageAttempts} attempts. You can keep the current ` +
        "image and move on, or start a new story for a different result.",
    };
  }

  return { allowed: true, scene, alreadyApproved: story.imagesApprovedAt !== null };
}
