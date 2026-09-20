"use server";

import { readFileSync } from "node:fs";
import { extname } from "node:path";

import { BudgetExceededError, checkBudget } from "../../core/budget/ledger.ts";
import { MissingApiKeyError, MISSING_API_KEY_MESSAGE, assertApiKeyConfigured } from "../../core/config/provider-key.ts";
import { serializeDispatch } from "../../core/budget/dispatch-chain.ts";
import { generateVideo, VIDEO_PRICE_PER_SECOND, plainLanguageVideoBlockMessage } from "../../providers/video/veo.ts";
import { storyDir, sceneVideoPath } from "../../core/storage-paths.ts";
import type { Scene } from "../../core/story/schema.ts";
import { findStoryWithScenes } from "../../core/persistence/story-repository.ts";
import { evaluateVideoDispatch } from "../../core/approval/gates.ts";
import { maxSceneRetryAttempts } from "../../core/retry/caps.ts";
import { validateMp4Buffer, CORRUPT_VIDEO_MESSAGE } from "../../core/output/mp4-validation.ts";
import {
  recordGeneration,
  updateSceneVideo,
  incrementVideoAttempt,
  setVideoSaveCorrupted,
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
 * Single gated dispatch point for a scene's video, with three gates in a
 * fixed order -- approval, then per-scene retry cap, then the real monthly
 * budget -- before any provider work happens. It resolves the scene's image
 * path itself (from the database, via evaluateVideoDispatch/findStoryWithScenes)
 * so no caller can supply one (RESEARCH.md Pattern 3) -- closing WINDOWS
 * ledger item 7, since a restored story's browser state never needs to hold
 * a filesystem path for this to work. `checkBudget` (src/core/budget/ledger.ts)
 * runs immediately before every dispatch -- including any future retry,
 * since callers always go through this function -- generateVideo (Phase 1,
 * unchanged), then the durable spend record immediately after. Every outcome
 * maps to one plain-language sentence; the provider's own blockReason/
 * operation name never crosses into the return value's `message` (T-02-06)
 * -- only into the server console via generateVideo's own logRawResponse
 * call.
 *
 * Not exported -- every caller goes through generateSceneVideoAction below,
 * which serializes calls into this function app-wide via the shared
 * `serializeDispatch` queue (src/core/budget/dispatch-chain.ts, CR-03's
 * original video-only mutex, generalized by plan 05-03). This function must
 * NEVER call `serializeDispatch` itself -- it already runs inside one
 * caller's callback; a nested call would enqueue itself behind the very
 * callback it is running inside of and hang forever (the queue is not
 * reentrant).
 */
async function dispatchSceneVideo(
  storyId: string,
  sceneNumber: number,
): Promise<GenerateSceneVideoResult> {
  // STARTUP-02 (06-01, Task 2): the very first check, ahead of even the
  // storyDir(storyId) guard -- synchronous and free. Wrapped in its own
  // try/catch so a refusal returns the plain-language sentence rather than
  // throwing out of the action. A refusal is not a generation failure -- do
  // NOT call updateSceneVideo(FAILED) and do NOT call incrementVideoAttempt
  // here: no dispatch occurred, exactly the same reasoning the
  // evaluateVideoDispatch refusal branch below already documents.
  try {
    assertApiKeyConfigured();
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return { ok: false, videoPath: null, videoDataUrl: null, message: MISSING_API_KEY_MESSAGE, durationSeconds: 0 };
    }
    throw err;
  }

  try {
    storyDir(storyId);
  } catch {
    return { ok: false, videoPath: null, videoDataUrl: null, message: "This story could not be found.", durationSeconds: 0 };
  }

  let story = null;
  try {
    story = await findStoryWithScenes(storyId);
  } catch (err) {
    console.error(`generateSceneVideoAction: failed to read story ${storyId}`, err);
  }

  const decision = evaluateVideoDispatch(story, sceneNumber, maxSceneRetryAttempts());
  if (!decision.allowed) {
    // A refusal is not a generation failure -- do NOT call updateSceneVideo
    // with a FAILED status here. Writing FAILED would corrupt the scene's
    // own status for the status screen built in plan 04-03.
    return { ok: false, videoPath: null, videoDataUrl: null, message: decision.message, durationSeconds: 0 };
  }

  const imagePath = decision.imagePath;
  // camera/environment are absent because they are not Scene columns (only
  // durationSeconds/storyPurpose/imagePrompt/motionPrompt are persisted) --
  // an accepted, documented narrowing of the CR-03 guard's phrasing, not a
  // behaviour regression, since safeMotionPrompt's existing fallbacks
  // ("a slow, gentle camera drift" / "the scene") apply on this rewrite
  // path exactly as they already do when a live-generated scene omits them.
  const scene: Scene = {
    scene_number: decision.scene.sceneNumber,
    duration: decision.scene.durationSeconds ?? undefined,
    story_purpose: decision.scene.storyPurpose,
    image_prompt: decision.scene.imagePrompt,
    motion_prompt: decision.scene.motionPrompt,
  };

  const durationSeconds = clampDuration(scene.duration);
  const estimatedUsd = durationSeconds * VIDEO_PRICE_PER_SECOND["720p"];

  try {
    await checkBudget(estimatedUsd);
  } catch (err) {
    const message =
      err instanceof BudgetExceededError
        ? "The generation budget was reached, so this scene's video could not be created."
        : "This scene's video could not be created due to an unexpected error.";
    // WR-07 (04-REVIEW.md, second pass): every other failure branch in this
    // file logs before returning -- this was the one silent exception. An
    // unexpected (non-budget) error in the pre-flight budget check would
    // otherwise be completely invisible in the server console.
    if (!(err instanceof BudgetExceededError)) {
      console.error(
        `generateSceneVideoAction: checkBudget failed unexpectedly for story ${storyId} scene ${sceneNumber}`,
        err,
      );
    }
    // No provider call was dispatched -- nothing was necessarily billed, so
    // no generation record (mirrors the existing decision not to record
    // here). The scene's status is still written.
    await updateSceneVideo(storyId, sceneNumber, null, SceneAssetStatus.FAILED);
    return { ok: false, videoPath: null, videoDataUrl: null, message, durationSeconds };
  }

  // Phase 4 (04-03): writes GENERATING before any file read or provider
  // dispatch, so a scene interrupted mid-flight by a dev-server recompile
  // (04-RESEARCH.md Pitfall 2) is visibly "in flight" on the status screen
  // instead of indistinguishable from a scene that was never started (both
  // would otherwise read WAITING). Every existing FAILED/READY write further
  // down stays exactly as it was.
  await updateSceneVideo(storyId, sceneNumber, null, SceneAssetStatus.GENERATING);

  let imageBytes: Buffer;
  let mimeType: string;
  try {
    imageBytes = readFileSync(imagePath);
    mimeType = mimeTypeForImagePath(imagePath);
  } catch (err) {
    console.error(`generateSceneVideoAction: failed to read scene image at ${imagePath}`, err);
    // Still pre-dispatch -- the Veo call never happened, so no generation
    // record, and (WR-02 fix) no attempt consumed either: this is a purely
    // local failure that never reached the money-consuming boundary below.
    await updateSceneVideo(storyId, sceneNumber, null, SceneAssetStatus.FAILED);
    return {
      ok: false,
      videoPath: null,
      videoDataUrl: null,
      message: "The scene's image could not be read, so no video could be generated.",
      durationSeconds,
    };
  }

  const motionPrompt = safeMotionPrompt(scene);
  const outputPath = sceneVideoPath(storyId, sceneNumber);

  // D-03 (WR-02 fix): the increment now sits immediately before the actual
  // Veo dispatch, not before the pre-dispatch image read above. A scene
  // refused by the budget check above, or one whose local image read fails
  // before this point, has not cost anything and must not consume one of
  // its limited attempts -- only a scene that reaches this real dispatch
  // boundary must consume one, even if the process dies mid-call.
  await incrementVideoAttempt(storyId, sceneNumber);

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
    console.error(`generateSceneVideoAction: scene ${sceneNumber} threw`, err);
    await updateSceneVideo(storyId, sceneNumber, null, SceneAssetStatus.FAILED);
    return {
      ok: false,
      videoPath: null,
      videoDataUrl: null,
      message: "An unexpected error prevented this scene's video from being generated.",
      durationSeconds,
    };
  }

  // This IS the record now -- generate-video.ts used to dual-write the same
  // dispatched call to both the throwaway dev ledger (via a manual
  // try/catch around recordSpend, since spend-ledger.ts's own
  // withLedgerFileLock comment documents it can genuinely throw on a lock
  // timeout or a stale lock file left by a crash) and this table. The
  // dev-ledger write is gone (Phase 5); this is the one and only durable
  // record of this dispatched call.
  //
  // Fifth-pass review CR-01's concern transfers exactly: recordGeneration
  // (src/core/persistence/generation-repository.ts) is best-effort by
  // contract -- it never throws, it logs and returns. A failed write here
  // must never discard the video: the Veo call already succeeded and
  // already cost real money by this point regardless of whether this
  // bookkeeping write lands, so discarding a successfully generated,
  // already-paid-for video over a database hiccup would be strictly worse
  // than proceeding with a loudly-logged missing entry -- the scene still
  // advances to READY below exactly as it would have. A missing entry is a
  // real, narrow risk (this specific call's cost would not count against
  // the budget), which is why recordGeneration itself logs loudly rather
  // than silently swallowing the failure -- it is the one signal an
  // operator has that the recorded and real spend may have drifted apart.
  //
  // Mirrors the story/image convention (director.ts, generate-images.ts):
  // any dispatched call counts, including a block or a client-side polling
  // timeout, since by the time generateVideo() has returned here (rather
  // than throwing) the initial ai.models.generateVideos() dispatch already
  // succeeded -- timedOut and blocked are both post-dispatch outcomes that
  // may have already cost money on Veo's side regardless of what this
  // process could observe.
  const generationRecordBase = {
    generationType: GenerationType.VIDEO,
    model: VIDEO_MODEL_ID,
    estimatedUsd,
    actualUsd: null,
    billed: true,
  } as const;

  if (result.timedOut) {
    const message = "Generating this scene's video took too long and was stopped. Please try again.";
    await updateSceneVideo(storyId, sceneNumber, null, SceneAssetStatus.FAILED);
    await recordGeneration(storyId, { ...generationRecordBase, ok: false, message }, sceneNumber);
    return { ok: false, videoPath: null, videoDataUrl: null, message, durationSeconds };
  }

  if (result.blocked || !result.filePath) {
    // D-01/06-RESEARCH.md Pattern 2: chosen by the failure's own real cause
    // (result.blockKind), never a single generic sentence -- a genuine RAI
    // content-safety block now tells her to rephrase, while an operation
    // error or malformed response still gets the try-again framing.
    const message = plainLanguageVideoBlockMessage(result.blockKind);
    await updateSceneVideo(storyId, sceneNumber, null, SceneAssetStatus.FAILED);
    await recordGeneration(storyId, { ...generationRecordBase, ok: false, message }, sceneNumber);
    return { ok: false, videoPath: null, videoDataUrl: null, message, durationSeconds };
  }

  // Step 1: read the file into a buffer, in its own try. Unchanged from the
  // pre-Task-3 combined block -- same log, same READY-with-real-path write,
  // same billed generation record, same returned message. This branch has
  // no bytes to validate (the read itself is what failed), so OUTPUT-02's
  // proof does not apply here; the sixth-pass review's reasoning still
  // holds unchanged, see below.
  let videoBytes: Buffer;
  try {
    videoBytes = readFileSync(result.filePath);
  } catch (err) {
    // Sixth-pass review BLOCKER: the Veo call already succeeded and the
    // video file genuinely exists at result.filePath -- only reading it
    // back for THIS response's inline preview failed (a transient local
    // I/O hiccup: a locked file, an antivirus scan mid-write, a momentary
    // disk issue). Writing READY with the real path (not FAILED with null)
    // is what the success branch four lines below already does for the
    // happy path; mirroring it here means a scene is never marked failed,
    // never loses its retry-cap headroom, and is never dropped from the
    // CapCut output folder over a readback failure that has nothing to do
    // with whether the video itself is good. The next poll/reload
    // (getStoryStatusAction's own existsSync check, or a fresh
    // loadStoryAction readFileSync) gets an independent chance to read the
    // same file again -- likely succeeding, since the failure here was
    // local and transient, not a property of the file itself. This
    // response still can't show her the video inline right now, so it
    // still returns ok: false with a plain explanation, but that return
    // value is discarded by every real caller (both the batch and the
    // retry path rely entirely on the next poll tick to read the real
    // DB-backed status, per this function's own callers' documentation).
    console.error(`generateSceneVideoAction: failed to read generated video at ${result.filePath}`, err);
    const message = "The video was generated but could not be loaded for playback just now.";
    await updateSceneVideo(storyId, sceneNumber, result.filePath, SceneAssetStatus.READY);
    await recordGeneration(storyId, { ...generationRecordBase, ok: true, message: "Video generated." }, sceneNumber);
    return {
      ok: false,
      videoPath: result.filePath,
      videoDataUrl: null,
      message,
      durationSeconds,
    };
  }

  // Step 2: OUTPUT-02 -- proves videoBytes is a genuine, non-empty,
  // playable MP4 at approximately durationSeconds and exactly 9:16 BEFORE
  // the scene is ever marked READY. Reuses the buffer already read above
  // (no second disk read, 06-RESEARCH.md Pattern 4). The invalid file is
  // deliberately left on disk -- the next attempt overwrites the same
  // path, and episode-export.ts's existing file-existence downgrade only
  // applies to an already-READY scene, so deleting it here would only add
  // a new I/O failure mode on an already-failing path for no benefit.
  const verdict = validateMp4Buffer(videoBytes, { durationSeconds });
  if (!verdict.valid) {
    console.error(
      `generateSceneVideoAction: scene ${sceneNumber} of story ${storyId} failed MP4 validation -- ${verdict.reason}`,
    );
    await updateSceneVideo(storyId, sceneNumber, null, SceneAssetStatus.FAILED);
    // D-05: the free-retry exemption flag, not the retry-cap increment --
    // incrementVideoAttempt already ran before dispatch (D-03/D-02) and is
    // deliberately left untouched here; the exemption is what lets gates.ts
    // (plan 06-04) bypass the cap check on the next retry for this scene.
    await setVideoSaveCorrupted(storyId, sceneNumber);
    // The Veo call already succeeded and already cost real money regardless
    // of this local save-integrity failure -- billed: true, unconditionally,
    // via the existing generationRecordBase spread (PROJECT.md's "billed on
    // dispatch, not on local observability" convention, Phase 2 CR-01).
    await recordGeneration(
      storyId,
      { ...generationRecordBase, ok: false, message: CORRUPT_VIDEO_MESSAGE },
      sceneNumber,
    );
    return {
      ok: false,
      videoPath: null,
      videoDataUrl: null,
      message: CORRUPT_VIDEO_MESSAGE,
      durationSeconds,
    };
  }

  // Step 3: valid verdict -- fall through to the existing READY write and
  // success return, both unchanged.
  const videoDataUrl = `data:video/mp4;base64,${videoBytes.toString("base64")}`;

  await updateSceneVideo(storyId, sceneNumber, result.filePath, SceneAssetStatus.READY);
  await recordGeneration(
    storyId,
    { ...generationRecordBase, ok: true, message: "Video generated." },
    sceneNumber,
  );

  return {
    ok: true,
    videoPath: result.filePath,
    videoDataUrl,
    message: "Video generated.",
    durationSeconds,
  };
}

// CR-03 (04-REVIEW.md, second pass) originally gave dispatchSceneVideo its
// own video-only serialization mutex so at most one call is ever mid-flight
// at a time app-wide: batch.ts's own doc comment claims "exactly one paid
// call in flight at once", but that only held WITHIN one
// runBatchVideoDispatch call -- an independently-dispatched
// retrySceneVideoAction call had no coordination with a still-running
// batch, so two concurrent calls could each pass the budget check before
// either had recorded its spend (a Veo call takes minutes; the spend record
// only writes after it resolves).
//
// Plan 05-03 generalized that video-only mutex into `serializeDispatch`
// (src/core/budget/dispatch-chain.ts) -- the same shared queue now covers
// every paid dispatch type in the application (story, uniqueness
// comparison, scene image, scene video), not just video, so the race this
// closes is the app-wide one 01-REVIEW-FIX.md's WR-02 note described: two
// callers passing the budget check against the same cumulative total before
// either had recorded anything, not just two video callers.
//
// The serialized unit sits exactly where it always did -- around the whole
// dispatchSceneVideo call, covering its budget check, its Veo dispatch, and
// its spend record together as one unit -- via a single `serializeDispatch`
// call here. dispatchSceneVideo itself must NEVER call `serializeDispatch`
// again: the queue is not reentrant, and a nested call would enqueue itself
// behind the very callback it is running inside of and hang forever.
export async function generateSceneVideoAction(
  storyId: string,
  sceneNumber: number,
): Promise<GenerateSceneVideoResult> {
  return serializeDispatch(() => dispatchSceneVideo(storyId, sceneNumber));
}
