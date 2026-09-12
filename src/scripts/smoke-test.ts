import { mkdirSync, writeFileSync, statSync, existsSync, readFileSync } from "node:fs";
import { writeFileSync as writeFileSyncOverwrite } from "node:fs";
import path from "node:path";
import { inspect } from "node:util";

import {
  checkCeiling,
  recordSpend,
  loadLedger,
  totalSpentUsd,
  CeilingExceededError,
} from "../lib/spend-ledger.ts";
import { generateImage, IMAGE_PRICE_PER_CALL } from "../providers/image/gemini-image.ts";
import {
  generateVideo,
  VIDEO_PRICE_PER_SECOND,
  type GenerateVideoResult,
} from "../providers/video/veo.ts";

// D-06: throwaway output location, deliberately separate from storage/stories/<id>/.
const OUTPUT_DIR = "storage/_smoketest";

// D-01: a deliberately unremarkable object-on-a-table prompt — this call's
// only job is to prove the raw plumbing works on content nothing could
// object to, so a later child-protagonist probe (plan 01-04) that IS blocked
// can be trusted as a content finding rather than a code bug.
const GENERIC_PROMPT = "A ceramic teacup on a wooden table, soft daylight";
const GENERIC_MOTION_PROMPT = "Gentle camera drift across the scene; soft steam rising from the teacup";

const IMAGE_MODEL = "gemini-3.1-flash-image";
const VIDEO_RESOLUTION: "720p" = "720p";
const VIDEO_DURATION_SECONDS = 4;
const VIDEO_MODEL_ID = "veo-3.1-lite-generate-preview";

// D-01's second, representative generation (plan 01-04): a real
// product-shaped scene, drawn from the requester's own example idea
// (CONTEXT.md <specifics>), in the D-02 "Soft hand-painted 2D" style — not a
// generic stand-in. The whole point is to probe whether Gemini's and Veo's
// safety filters false-positive on wholesome children's-story content, since
// this entire channel is animated stories about child protagonists.
const CHILD_SCENE_STYLE = "Soft hand-painted 2D";
const CHILD_SCENE_PROMPT =
  "A little girl with pigtails kneeling in a lush, colorful garden, looking around hopefully for her " +
  "lost cat, and discovering the garden is magical: softly glowing flowers, gentle fireflies, warm " +
  "sunlight filtering through leaves. Wholesome, storybook children's illustration, no text.";
const CHILD_MOTION_PROMPT =
  "Gentle camera drift through the magical garden; glowing flowers softly pulse and fireflies drift " +
  "past while the little girl looks around for her cat.";

// Quick task 260912-j3x: probes CR-03 (01-UAT.md) — Veo 3.1 Lite animated
// CHILD_MOTION_PROMPT's "looks around for her cat" as a head-independent-of-
// torso rotation. This prompt requests ONLY camera drift and environmental
// motion, never a character body/head pose change, to see whether avoiding
// pose-change language avoids the artifact. Stays consistent with the D-02
// "Soft hand-painted 2D" style already baked into the source image. Worded
// as a positive description of the motion wanted, not a list of things to
// avoid — negative instructions are unreliable steering for video models.
const CONSERVATIVE_MOTION_PROMPT =
  "A slow, gentle camera push-in drifting through the magical garden. The glowing flowers pulse " +
  "softly, fireflies drift past, and a light breeze gives a faint sway to the little girl's hair and " +
  "clothing. The girl herself holds her pose, calm and still, front-facing.";
// 8s is deliberately different from the tracer's 4s (plan 01-04 Task 1): the
// longest duration Veo 3.1 Lite supports at 720p, establishing the
// worst-case per-clip cost for Phase 5's budget system.
const CHILD_VIDEO_DURATION_SECONDS = 8;

// Reuses the already-approved childscene image (never regenerated) and
// writes beside — never over — the original clip so the two can be compared
// side by side without losing the reviewed original.
const CONSERVATIVE_SOURCE_IMAGE = path.join(OUTPUT_DIR, "scene-childscene.jpg");
const CONSERVATIVE_OUTPUT_VIDEO = path.join(OUTPUT_DIR, "scene-childscene-conservative.mp4");

function parseArgs(argv: string[]): { probe: string; imageOnly: boolean; report: boolean } {
  const probeArg = argv.find((a) => a.startsWith("--probe="));
  const probe = probeArg ? probeArg.slice("--probe=".length) : "all";
  const imageOnly = argv.includes("--image-only");
  const report = argv.includes("--report");
  return { probe, imageOnly, report };
}

// CR-02: the provider's own reported mimeType decides the file extension —
// never assume PNG. gemini-image.ts's own fallback (line 145) only applies
// when the provider omits mimeType entirely; when it IS present but not one
// of these three known values, ".png" here is a documented fallback guess,
// not a silent one.
function extensionForMimeType(mimeType: string | null): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

// Faithful inverse of extensionForMimeType: the on-disk extension was itself
// derived from the provider's own reported mimeType (CR-02), so mapping back
// recovers the real type rather than assuming one. Throws (naming the path)
// for anything unrecognized instead of guessing, since a wrong mimeType sent
// to Veo would be silently-wrong input to a paid call.
function mimeTypeForExtension(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      throw new Error(`Cannot infer mimeType for "${filePath}": unrecognized extension "${ext}".`);
  }
}

function formatLogArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return arg.stack ?? arg.message;
  // WR-04: String(arg) collapses any plain-object thrown value (e.g. the
  // { status?, code? }-shaped SDK errors gemini-image.ts's own
  // isNotFoundOrForbidden casts caught errors to) into the useless
  // "[object Object]" in the persisted .log file, even though the live
  // terminal shows the real object via console.error's util.inspect-based
  // formatting. Use util.inspect directly so the durable log matches what
  // was actually printed.
  return inspect(arg, { depth: null });
}

/**
 * Mirrors every printed line (from this file AND from the provider modules
 * it calls) into `storage/_smoketest/<logFileName>`, per this plan's stdout
 * line contract. Overwrites on each run so the log reflects only the latest
 * invocation.
 */
async function withMirroredConsole<T>(logFileName: string, fn: () => Promise<T>): Promise<T> {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(formatLogArg).join(" "));
    originalLog(...args);
  };
  console.error = (...args: unknown[]) => {
    lines.push(args.map(formatLogArg).join(" "));
    originalError(...args);
  };
  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSyncOverwrite(path.join(OUTPUT_DIR, logFileName), lines.join("\n") + "\n");
  }
}

/**
 * Runs the `generic` probe: ledger check -> image -> classify -> disk write
 * -> (unless --image-only) ledger check -> video -> poll -> classify ->
 * disk write -> cost summary. Because the generic prompt is deliberately
 * unblockable content (D-01), any classified block here is treated as a
 * probe FAILURE to investigate (missing artifact), not the "successful
 * observation" that the same block-handling machinery treats a real content
 * probe's block as (see plan 01-04's childscene probe).
 */
async function runGenericProbe(imageOnly: boolean): Promise<number> {
  try {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    const imageEstimate = IMAGE_PRICE_PER_CALL[IMAGE_MODEL];
    checkCeiling(imageEstimate);

    console.log(`Dispatching image call (model=${IMAGE_MODEL}, estimate=$${imageEstimate.toFixed(4)})...`);
    const imageResult = await generateImage({
      prompt: GENERIC_PROMPT,
      aspectRatio: "9:16",
      model: IMAGE_MODEL,
    });

    recordSpend({
      call: "generic-image",
      model: imageResult.modelUsed,
      estimatedUsd: imageResult.estimatedUsd,
      usageMetadata: imageResult.usageMetadata,
      billed: true,
      at: new Date().toISOString(),
    });

    console.log(`IMAGE COST $${imageResult.estimatedUsd.toFixed(4)} (model=${imageResult.modelUsed})`);

    if (imageResult.blocked) {
      console.log(`IMAGE BLOCKED stage=${imageResult.block?.stage} reason=${imageResult.block?.reason}`);
      const ledgerAfterImage = loadLedger();
      console.log(`TOTAL THIS RUN $${imageResult.estimatedUsd.toFixed(4)}`);
      console.log(`LEDGER TOTAL $${totalSpentUsd(ledgerAfterImage).toFixed(4)}`);
      console.error(
        "GENERIC PROBE FAILURE: the teacup image was blocked. This prompt has nothing to be blocked " +
          "for — treat this as a plumbing/classification bug to investigate, not a content finding.",
      );
      return 1;
    }

    if (!imageResult.bytes || imageResult.bytes.length === 0) {
      console.error("IMAGE ERROR: no bytes returned and the call was not classified as blocked.");
      return 1;
    }

    const pngPath = path.join(
      OUTPUT_DIR,
      `scene-generic.${extensionForMimeType(imageResult.mimeType)}`,
    );
    writeFileSync(pngPath, imageResult.bytes);
    const pngStat = statSync(pngPath);
    if (pngStat.size === 0) {
      console.error("IMAGE ERROR: written image file is zero-length.");
      return 1;
    }
    console.log(`Wrote ${pngPath} (${pngStat.size} bytes)`);

    if (imageOnly) {
      console.log("VIDEO CALL DELIBERATELY NOT DISPATCHED (--image-only passed; D-03 guard).");
      const ledgerImageOnly = loadLedger();
      console.log(`TOTAL THIS RUN $${imageResult.estimatedUsd.toFixed(4)}`);
      console.log(`LEDGER TOTAL $${totalSpentUsd(ledgerImageOnly).toFixed(4)}`);
      return 0;
    }

    // D-03 guard: Veo is unreachable unless a real image was written to disk
    // and classified good above. This is an explicit early-return guard, not
    // sequential statements that happen to run in order.
    const videoEstimate = VIDEO_DURATION_SECONDS * VIDEO_PRICE_PER_SECOND[VIDEO_RESOLUTION];
    checkCeiling(videoEstimate);

    console.log(
      `Dispatching video call (resolution=${VIDEO_RESOLUTION}, duration=${VIDEO_DURATION_SECONDS}s, ` +
        `estimate=$${videoEstimate.toFixed(4)})...`,
    );
    const videoResult = await generateVideo({
      imageBytes: imageResult.bytes,
      mimeType: imageResult.mimeType ?? "image/png",
      prompt: GENERIC_MOTION_PROMPT,
      durationSeconds: VIDEO_DURATION_SECONDS,
      resolution: VIDEO_RESOLUTION,
      aspectRatio: "9:16",
      outputPath: path.join(OUTPUT_DIR, "scene-generic.mp4"),
    });

    recordSpend({
      call: "generic-video",
      model: VIDEO_MODEL_ID,
      estimatedUsd: videoResult.estimatedUsd,
      usageMetadata: videoResult.usageMetadata,
      billed: true,
      at: new Date().toISOString(),
    });

    console.log(`VIDEO COST $${videoResult.estimatedUsd.toFixed(4)} (model=${VIDEO_MODEL_ID})`);

    if (videoResult.timedOut) {
      console.error(
        `VIDEO TIMEOUT: operation ${videoResult.operationName ?? "(unnamed)"} did not complete within ` +
          "10 minutes.",
      );
      return 1;
    }

    const total = imageResult.estimatedUsd + videoResult.estimatedUsd;
    const ledgerFinal = loadLedger();

    if (videoResult.blocked) {
      console.log(`VIDEO BLOCKED reason=${videoResult.blockReason}`);
      console.log(`TOTAL THIS RUN $${total.toFixed(4)}`);
      console.log(`LEDGER TOTAL $${totalSpentUsd(ledgerFinal).toFixed(4)}`);
      console.error(
        "GENERIC PROBE FAILURE: the teacup clip was blocked (raiMediaFilteredReasons set). This content " +
          "has nothing to be blocked for — treat this as a plumbing bug or a non-deterministic RAI false " +
          "positive (RESEARCH.md Pitfall 3) to investigate, not a content finding.",
      );
      return 1;
    }

    console.log(`Wrote ${videoResult.filePath}`);
    console.log(`TOTAL THIS RUN $${total.toFixed(4)}`);
    console.log(`LEDGER TOTAL $${totalSpentUsd(ledgerFinal).toFixed(4)}`);
    return 0;
  } catch (err) {
    if (err instanceof CeilingExceededError) {
      console.error(`SPEND CEILING REFUSAL: ${err.message}`);
      return 2;
    }
    console.error("UNCLASSIFIED ERROR:", err);
    return 1;
  }
}

/**
 * Variant inputs that differ between the childscene and childscene-conservative
 * dispatches — everything else (the checkCeiling gate, duration, resolution,
 * aspect ratio, model) is shared so there is exactly one ceiling-gated
 * dispatch site rather than a duplicated one a future edit could drop the
 * gate from.
 */
interface ChildVideoVariant {
  motionPrompt: string;
  outputPath: string;
  ledgerCall: string;
  logLabel: string;
}

const CHILDSCENE_VARIANT: ChildVideoVariant = {
  motionPrompt: CHILD_MOTION_PROMPT,
  outputPath: path.join(OUTPUT_DIR, "scene-childscene.mp4"),
  ledgerCall: "childscene-video",
  logLabel: "childscene",
};

/**
 * Dispatches a single childscene-family Veo call (image -> motion), gated
 * behind checkCeiling() every time it is invoked — including the D-01 retry,
 * so the retry path can never bypass the D-04 budget gate (T-01-02). Shared
 * by the original childscene probe and the childscene-conservative probe via
 * `variant`, so both paths pass through one gate instead of two.
 */
async function dispatchChildVideo(
  imageBytes: Buffer,
  mimeType: string,
  attemptLabel: string,
  variant: ChildVideoVariant,
): Promise<GenerateVideoResult> {
  const videoEstimate = CHILD_VIDEO_DURATION_SECONDS * VIDEO_PRICE_PER_SECOND[VIDEO_RESOLUTION];
  checkCeiling(videoEstimate);

  console.log(
    `Dispatching ${variant.logLabel} video call (${attemptLabel}, resolution=${VIDEO_RESOLUTION}, ` +
      `duration=${CHILD_VIDEO_DURATION_SECONDS}s, estimate=$${videoEstimate.toFixed(4)})...`,
  );
  const result = await generateVideo({
    imageBytes,
    mimeType,
    prompt: variant.motionPrompt,
    durationSeconds: CHILD_VIDEO_DURATION_SECONDS,
    resolution: VIDEO_RESOLUTION,
    aspectRatio: "9:16",
    outputPath: variant.outputPath,
  });

  recordSpend({
    call: variant.ledgerCall,
    model: VIDEO_MODEL_ID,
    estimatedUsd: result.estimatedUsd,
    usageMetadata: result.usageMetadata,
    billed: true,
    at: new Date().toISOString(),
  });

  console.log(
    `VIDEO COST $${result.estimatedUsd.toFixed(4)} (model=${VIDEO_MODEL_ID}, ${variant.logLabel}, ${attemptLabel})`,
  );
  return result;
}

/**
 * Runs the D-01 representative probe: the "Soft hand-painted 2D" style on a
 * real, product-shaped child-protagonist scene (CONTEXT.md <specifics>).
 * Classification follows the same defensive pattern as the generic probe,
 * but here a classified block is a SUCCESSFUL, reportable probe outcome
 * (not a bug to investigate) — CONTEXT.md records this as a finding that
 * would materially affect provider viability for this product. A Veo block
 * is retried exactly once, through the same checkCeiling() gate as a first
 * attempt (D-04), per RESEARCH.md Pitfall 3: a single block may be a
 * documented non-deterministic false positive, not proof of categorical
 * non-viability.
 */
async function runChildsceneProbe(): Promise<number> {
  try {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    const imageEstimate = IMAGE_PRICE_PER_CALL[IMAGE_MODEL];
    checkCeiling(imageEstimate);

    console.log(
      `Dispatching childscene image call (model=${IMAGE_MODEL}, style="${CHILD_SCENE_STYLE}", ` +
        `estimate=$${imageEstimate.toFixed(4)})...`,
    );
    const imageResult = await generateImage({
      prompt: CHILD_SCENE_PROMPT,
      aspectRatio: "9:16",
      model: IMAGE_MODEL,
      style: CHILD_SCENE_STYLE,
    });

    recordSpend({
      call: "childscene-image",
      model: imageResult.modelUsed,
      estimatedUsd: imageResult.estimatedUsd,
      usageMetadata: imageResult.usageMetadata,
      billed: true,
      at: new Date().toISOString(),
    });

    console.log(`IMAGE COST $${imageResult.estimatedUsd.toFixed(4)} (model=${imageResult.modelUsed})`);

    if (imageResult.blocked) {
      // A classified block IS the probe's successful outcome — print the
      // provider's own reason text verbatim, never a generic "no output"
      // message (RESEARCH.md Pitfall 2), and never paraphrase it.
      console.log(
        `CHILD PROBE: BLOCKED reason=${imageResult.block?.reason} (image, stage=${imageResult.block?.stage})`,
      );
      const ledgerAfterImage = loadLedger();
      console.log(`TOTAL THIS RUN $${imageResult.estimatedUsd.toFixed(4)}`);
      console.log(`LEDGER TOTAL $${totalSpentUsd(ledgerAfterImage).toFixed(4)}`);
      return 0;
    }

    if (!imageResult.bytes || imageResult.bytes.length === 0) {
      console.error("IMAGE ERROR: no bytes returned and the call was not classified as blocked.");
      return 1;
    }

    console.log("CHILD PROBE: PASS (image)");

    const pngPath = path.join(
      OUTPUT_DIR,
      `scene-childscene.${extensionForMimeType(imageResult.mimeType)}`,
    );
    writeFileSync(pngPath, imageResult.bytes);
    const pngStat = statSync(pngPath);
    if (pngStat.size === 0) {
      console.error("IMAGE ERROR: written image file is zero-length.");
      return 1;
    }
    console.log(`Wrote ${pngPath} (${pngStat.size} bytes)`);

    // D-03-style guard: Veo is unreachable unless a real image was written
    // to disk and classified good above.
    let videoResult = await dispatchChildVideo(
      imageResult.bytes,
      imageResult.mimeType ?? "image/png",
      "attempt 1",
      CHILDSCENE_VARIANT,
    );
    let videoCostTotal = videoResult.estimatedUsd;
    let isRetry = false;

    if (videoResult.timedOut) {
      console.error(
        `VIDEO TIMEOUT: operation ${videoResult.operationName ?? "(unnamed)"} did not complete within ` +
          "10 minutes.",
      );
      return 1;
    }

    if (videoResult.blocked) {
      console.log(`CHILD PROBE: BLOCKED reason=${videoResult.blockReason} (video, attempt 1)`);

      // RESEARCH.md Pitfall 3: a real, closed-as-not-planned googleapis/js-genai
      // issue (#1272) documents an identical prompt/image succeeding on a
      // subsequent retry — one block is not proof of categorical
      // non-viability. Retry exactly once; do not loop.
      isRetry = true;
      videoResult = await dispatchChildVideo(
        imageResult.bytes,
        imageResult.mimeType ?? "image/png",
        "retry",
        CHILDSCENE_VARIANT,
      );
      videoCostTotal += videoResult.estimatedUsd;

      if (videoResult.timedOut) {
        console.error(
          `VIDEO TIMEOUT (retry): operation ${videoResult.operationName ?? "(unnamed)"} did not complete ` +
            "within 10 minutes.",
        );
        return 1;
      }
    }

    const total = imageResult.estimatedUsd + videoCostTotal;
    const ledgerFinal = loadLedger();

    if (videoResult.blocked) {
      console.log(
        `CHILD PROBE: BLOCKED reason=${videoResult.blockReason} (video, retry) — one block is not proof ` +
          "of categorical non-viability (RESEARCH.md Pitfall 3); a human must judge whether this is a " +
          "real content-policy wall or the documented non-deterministic RAI false positive.",
      );
      console.log(`TOTAL THIS RUN $${total.toFixed(4)}`);
      console.log(`LEDGER TOTAL $${totalSpentUsd(ledgerFinal).toFixed(4)}`);
      return 0;
    }

    console.log(isRetry ? "CHILD PROBE: PASS (video, retry)" : "CHILD PROBE: PASS (video)");
    console.log(`Wrote ${videoResult.filePath}`);
    console.log(`TOTAL THIS RUN $${total.toFixed(4)}`);
    console.log(`LEDGER TOTAL $${totalSpentUsd(ledgerFinal).toFixed(4)}`);
    return 0;
  } catch (err) {
    if (err instanceof CeilingExceededError) {
      console.error(`SPEND CEILING REFUSAL: ${err.message}`);
      return 2;
    }
    console.error("UNCLASSIFIED ERROR:", err);
    return 1;
  }
}

const CONSERVATIVE_VARIANT: ChildVideoVariant = {
  motionPrompt: CONSERVATIVE_MOTION_PROMPT,
  outputPath: CONSERVATIVE_OUTPUT_VIDEO,
  ledgerCall: "childscene-conservative-video",
  logLabel: "childscene-conservative",
};

/**
 * Quick task 260912-j3x: re-animates the ALREADY-APPROVED
 * scene-childscene.jpg (never regenerated — no image call on this path) with
 * CONSERVATIVE_MOTION_PROMPT, to empirically probe whether CR-03's
 * head/torso kinematic disconnect (01-UAT.md) reproduces under a motion
 * prompt that never asks for a character pose change. Writes to the distinct
 * CONSERVATIVE_OUTPUT_VIDEO path so the original, already-reviewed clip is
 * never overwritten and the two can be compared side by side.
 */
async function runChildsceneConservativeProbe(): Promise<number> {
  try {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    // Source image must already exist on disk — this probe never generates
    // one. Checked BEFORE any checkCeiling call and before any provider call,
    // so this path can never reach the provider without its source image.
    if (!existsSync(CONSERVATIVE_SOURCE_IMAGE)) {
      console.error(
        `SOURCE IMAGE MISSING: ${CONSERVATIVE_SOURCE_IMAGE} does not exist. Run ` +
          '"npm run smoke -- --probe=childscene" first to produce it.',
      );
      return 1;
    }

    const imageBytes = readFileSync(CONSERVATIVE_SOURCE_IMAGE);
    if (imageBytes.length === 0) {
      console.error(`SOURCE IMAGE ERROR: ${CONSERVATIVE_SOURCE_IMAGE} is zero-length.`);
      return 1;
    }
    console.log(
      `Reusing existing source image ${CONSERVATIVE_SOURCE_IMAGE} (${imageBytes.length} bytes) — ` +
        "no image generation call is dispatched on this path.",
    );

    const mimeType = mimeTypeForExtension(CONSERVATIVE_SOURCE_IMAGE);

    // D-03-style guard: Veo is unreachable unless a real image was read from
    // disk above. dispatchChildVideo() gates the paid call behind
    // checkCeiling() itself, same as every other paid call in this file.
    const videoResult = await dispatchChildVideo(imageBytes, mimeType, "attempt 1", CONSERVATIVE_VARIANT);

    if (videoResult.timedOut) {
      console.error(
        `VIDEO TIMEOUT: operation ${videoResult.operationName ?? "(unnamed)"} did not complete within ` +
          "10 minutes.",
      );
      return 1;
    }

    const total = videoResult.estimatedUsd;
    const ledgerFinal = loadLedger();

    if (videoResult.blocked) {
      // Deliberately NO retry here, unlike runChildsceneProbe's single
      // block-retry. That retry exists to disambiguate Veo's documented
      // non-deterministic RAI false positives (RESEARCH.md Pitfall 3) on a
      // BLOCKING outcome; this probe investigates motion QUALITY, not
      // blocking, so an automatic retry would silently double the spend to
      // $0.80 for no extra signal. Report the provider's own reason verbatim
      // (RESEARCH.md Pitfall 2) and leave any re-run decision to the human.
      console.log(`CHILD CONSERVATIVE PROBE: BLOCKED reason=${videoResult.blockReason} (video, attempt 1)`);
      console.log(`TOTAL THIS RUN $${total.toFixed(4)}`);
      console.log(`LEDGER TOTAL $${totalSpentUsd(ledgerFinal).toFixed(4)}`);
      return 0;
    }

    console.log("CHILD CONSERVATIVE PROBE: PASS (video)");
    console.log(`Wrote ${videoResult.filePath}`);
    console.log(`TOTAL THIS RUN $${total.toFixed(4)}`);
    console.log(`LEDGER TOTAL $${totalSpentUsd(ledgerFinal).toFixed(4)}`);
    return 0;
  } catch (err) {
    if (err instanceof CeilingExceededError) {
      console.error(`SPEND CEILING REFUSAL: ${err.message}`);
      return 2;
    }
    console.error("UNCLASSIFIED ERROR:", err);
    return 1;
  }
}

/**
 * Task 2: reconciles every paid call in the phase's ledger against the
 * providers' own usageMetadata, making NO paid calls and requiring no
 * GEMINI_API_KEY. Prints one row per ledger entry, then a total and a
 * remaining-headroom line against the $3.00 D-05 ceiling.
 */
function runReport(): number {
  // WR-03: mirror the try/catch taxonomy used by runGenericProbe and
  // runChildsceneProbe (2 for CeilingExceededError, 1 for anything else) so
  // a corrupted/unparseable ledger (loadLedger's deliberate throw, per its
  // own docstring) is reported via this script's own error convention
  // instead of an unhandled exception propagating out of `main`.
  try {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    const ledger = loadLedger();
    console.log("COST REPORT — every paid call recorded in this phase's ledger (no network call made)");
    console.log("");

    for (const entry of ledger.entries) {
      console.log(
        `call=${entry.call} model=${entry.model} estimatedUsd=$${entry.estimatedUsd.toFixed(4)} ` +
          `usageMetadata=${JSON.stringify(entry.usageMetadata)}`,
      );
    }

    const total = totalSpentUsd(ledger);
    const headroom = ledger.ceilingUsd - total;
    console.log("");
    console.log(`TOTAL LEDGER $${total.toFixed(4)}`);
    console.log(`REMAINING HEADROOM $${headroom.toFixed(4)} of $${ledger.ceilingUsd.toFixed(2)} ceiling`);
    return 0;
  } catch (err) {
    if (err instanceof CeilingExceededError) {
      console.error(`SPEND CEILING REFUSAL: ${err.message}`);
      return 2;
    }
    console.error("UNCLASSIFIED ERROR:", err);
    return 1;
  }
}

async function main(): Promise<void> {
  const { probe, imageOnly, report } = parseArgs(process.argv.slice(2));

  if (report) {
    process.exitCode = await withMirroredConsole("cost-report.log", async () => runReport());
    return;
  }

  if (probe !== "generic" && probe !== "childscene" && probe !== "childscene-conservative" && probe !== "all") {
    console.error(
      `UNKNOWN PROBE: "${probe}". Valid values: generic, childscene, childscene-conservative, all.`,
    );
    process.exitCode = 1;
    return;
  }

  if (probe === "generic") {
    process.exitCode = await withMirroredConsole("generic-run.log", () => runGenericProbe(imageOnly));
    return;
  }

  if (probe === "childscene") {
    process.exitCode = await withMirroredConsole("childscene-run.log", () => runChildsceneProbe());
    return;
  }

  if (probe === "childscene-conservative") {
    // Opt-in paid follow-up (quick task 260912-j3x) — deliberately NOT part
    // of the "all" sequence below, so a future full smoke run never silently
    // costs an extra $0.40.
    process.exitCode = await withMirroredConsole("childscene-conservative-run.log", () =>
      runChildsceneConservativeProbe(),
    );
    return;
  }

  // probe === "all": sequence generic then childscene (D-03-style ordering)
  // — don't spend on the second, content-sensitive probe until the first,
  // deliberately-unblockable plumbing probe has proven the call chain works.
  const genericExit = await withMirroredConsole("generic-run.log", () => runGenericProbe(imageOnly));
  if (genericExit !== 0) {
    process.exitCode = genericExit;
    return;
  }
  process.exitCode = await withMirroredConsole("childscene-run.log", () => runChildsceneProbe());
}

await main();
