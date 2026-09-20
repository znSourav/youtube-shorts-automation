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

export type VideoDispatchDecision =
  | GateRefusal
  | { allowed: true; scene: SceneRow; imagePath: string; capExempt: boolean };

export type ApprovalDecision = GateRefusal | { allowed: true };

// WR-01: refusal carries its own `reason` so callers can tell an exhausted
// retry cap apart from a not-found refusal without re-deriving it from
// `story`'s truthiness (which conflated the scene-not-found case with the
// cap case -- both have a non-null story).
export type ImageRegenerationRefusal = { allowed: false; message: string; reason: "not-found" | "cap" };

export type ImageRegenerationDecision =
  | ImageRegenerationRefusal
  | { allowed: true; scene: SceneRow; alreadyApproved: boolean; capExempt: boolean };

export type BatchDispatchDecision = GateRefusal | { allowed: true; sceneNumbers: number[] };

/**
 * Decides whether a scene's video generation may be dispatched. Branch
 * order is load-bearing -- the approval check comes before anything that
 * could leak whether a particular scene exists or is ready:
 *   1. story not found
 *   2. story not approved (APPROVAL-01's "through any path" gate)
 *   3. scene not found
 *   4. scene's video-attempt cap reached (D-03) -- UNLESS the scene's
 *      videoSaveCorrupted flag is set (D-05, Phase 6 06-04), in which case
 *      this refusal is skipped even at or above the cap. The guard stays in
 *      this exact position in the branch order -- narrowed, not moved -- so
 *      it still runs strictly after the story-not-found and
 *      images-not-approved guards above: a capped-and-flagged scene on an
 *      unapproved story is still refused with the approval message, never
 *      granted early. The granted decision's `capExempt` field reports
 *      whether this scene's grant came from the exemption (true even when
 *      the scene is also below the cap -- the exemption is fundamentally
 *      about not charging an attempt at the dispatch boundary, not only
 *      about clearing this refusal).
 *   5. scene's video is already READY (fourth-pass review CR-01: a scene
 *      that has already succeeded must never be re-dispatched by any
 *      caller -- batch or single-scene retry -- since two overlapping
 *      "Generate All Videos" batches for the same story, each computing
 *      their own eligibility snapshot at a different moment, can otherwise
 *      both reach a scene the other has already finished, re-billing it
 *      for no benefit and risking a spurious downgrade to FAILED if the
 *      redundant call trips the ceiling). Deliberately does NOT refuse
 *      "GENERATING" -- that status is what a legitimate stuck-scene retry
 *      (a dropped after() callback, 04-RESEARCH.md Pitfall 2) must still be
 *      able to re-dispatch through this same gate. This guard also stays
 *      unconditional on the exemption: a corruption flag must never re-bill
 *      a scene that already succeeded (READY), since D-05 only concerns a
 *      SAVE that failed, not one that already worked.
 *   6. scene's image isn't ready
 *   7. grant, handing back the scene row, its own server-resolved imagePath
 *      (RESEARCH.md Pattern 3 -- never a client-supplied path), and whether
 *      this grant is capExempt.
 *
 * D-02/D-05 asymmetry, deliberate and NOT an inconsistency to fix: a
 * technical generation failure (timeout, malformed response, content block)
 * still consumes an attempt per D-02, because the cap's job is to stop an
 * accidental click-loop from burning money and that applies regardless of
 * cause. A local save-integrity failure (this app's own write step
 * producing an unplayable file even though the provider likely did its job)
 * does not consume one, per D-05 -- these are genuinely different
 * categories. The exemption is one-shot by construction: the dispatch
 * boundary (dispatchSceneVideo, src/app/actions/generate-video.ts) clears
 * the flag BEFORE the paid call runs, so a second free retry requires a
 * second recorded corruption. The unchanged monthly budget check
 * (checkBudget) remains the money backstop for any repeated-corruption
 * loop -- this gate only ever controls attempt-cap bookkeeping, never spend.
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

  if (scene.videoAttempts >= maxVideoAttempts && !scene.videoSaveCorrupted) {
    return {
      allowed: false,
      message:
        `This scene's video has reached its limit of ${maxVideoAttempts} attempts. The other scenes aren't ` +
        "affected — you can continue with what's ready, or start a new story to try again.",
    };
  }

  if (scene.videoStatus === "READY") {
    return { allowed: false, message: "This scene's video has already been generated." };
  }

  if (scene.imageStatus !== "READY" || scene.imagePath === null) {
    return { allowed: false, message: "This scene's image isn't ready yet, so its video can't be generated." };
  }

  return { allowed: true, scene, imagePath: scene.imagePath, capExempt: scene.videoSaveCorrupted };
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
 *
 * Mirrors evaluateVideoDispatch's D-05 exemption (Phase 6, 06-04): the
 * attempt-cap refusal below is skipped when the scene's imageSaveCorrupted
 * flag is set, without moving the guard or changing the refusal's `reason`
 * tag when the flag is absent. The granted decision's `capExempt` field
 * reports whether this grant came from the exemption, same shape and same
 * one-shot-by-construction reasoning as the video path.
 */
export function evaluateImageRegeneration(
  story: StoryWithScenes | null,
  sceneNumber: number,
  maxImageAttempts: number,
): ImageRegenerationDecision {
  if (story === null) {
    return { allowed: false, message: "This story could not be found.", reason: "not-found" };
  }

  const scene = story.scenes.find((s) => s.sceneNumber === sceneNumber);
  if (!scene) {
    return { allowed: false, message: "That scene could not be found in this story.", reason: "not-found" };
  }

  if (scene.imageAttempts >= maxImageAttempts && !scene.imageSaveCorrupted) {
    return {
      allowed: false,
      message:
        `This scene's image has reached its limit of ${maxImageAttempts} attempts. You can keep the current ` +
        "image and move on, or start a new story for a different result.",
      reason: "cap",
    };
  }

  return {
    allowed: true,
    scene,
    alreadyApproved: story.imagesApprovedAt !== null,
    capExempt: scene.imageSaveCorrupted,
  };
}

/**
 * Decides whether the "Generate All Videos" batch action (D-04, VIDEO-02) may
 * dispatch, and if so, which scenes it should dispatch for. This is a FAST
 * REFUSAL for the wife's benefit only -- it is never the gate itself
 * (04-RESEARCH.md Pitfall 1). Every scene number this returns still passes
 * through evaluateVideoDispatch a second time, inside generateSceneVideoAction,
 * before any paid call is dispatched.
 *
 * Branch order:
 *   1. story not found
 *   2. story not approved (same locked string evaluateVideoDispatch uses)
 *   3. compute the work list: READY-imaged, not-already-video-READY,
 *      not-already-GENERATING, under the retry cap OR carrying the video
 *      corruption flag (D-05, Phase 6 06-04) -- skipping already-READY
 *      scenes is a money decision (makes pressing the button twice safe),
 *      skipping already-GENERATING scenes keeps a re-run batch from
 *      re-dispatching a scene that's already mid-flight (CR-01: e.g.
 *      re-clicking "Generate All Videos" after reopening a story
 *      mid-batch), and the capped-but-not-exempt condition keeps the batch
 *      from burning attempts it would only refuse one layer down. Every
 *      other condition in this filter is unrelated to the retry-cap
 *      exemption and stays exactly as strict as it already is -- this
 *      filter is a FAST REFUSAL for her benefit only, never the gate itself
 *      (see the doc comment above), so leaving the cap condition here
 *      stricter than evaluateVideoDispatch's own would silently hide a
 *      scene that a per-scene retry through that gate would happily accept.
 *   4. an empty work list refuses with a plain-language "nothing left" message
 */
export function evaluateBatchDispatch(
  story: StoryWithScenes | null,
  maxVideoAttempts: number,
): BatchDispatchDecision {
  if (story === null) {
    return { allowed: false, message: "This story could not be found." };
  }

  if (story.imagesApprovedAt === null) {
    return {
      allowed: false,
      message: "These images haven't been approved yet. Approve them before generating video.",
    };
  }

  const sceneNumbers = story.scenes
    .filter(
      (s) =>
        s.imageStatus === "READY" &&
        s.imagePath !== null &&
        s.videoStatus !== "READY" &&
        s.videoStatus !== "GENERATING" &&
        (s.videoAttempts < maxVideoAttempts || s.videoSaveCorrupted),
    )
    .map((s) => s.sceneNumber)
    .sort((a, b) => a - b);

  if (sceneNumbers.length === 0) {
    return { allowed: false, message: "There aren't any scenes left to make videos for right now." };
  }

  return { allowed: true, sceneNumbers };
}
