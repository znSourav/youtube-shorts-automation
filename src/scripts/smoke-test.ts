import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { writeFileSync as writeFileSyncOverwrite } from "node:fs";
import path from "node:path";

import {
  checkCeiling,
  recordSpend,
  loadLedger,
  totalSpentUsd,
  CeilingExceededError,
} from "../lib/spend-ledger.ts";
import { generateImage, IMAGE_PRICE_PER_CALL } from "../providers/image/gemini-image.ts";
import { generateVideo, VIDEO_PRICE_PER_SECOND } from "../providers/video/veo.ts";

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

function parseArgs(argv: string[]): { probe: string; imageOnly: boolean } {
  const probeArg = argv.find((a) => a.startsWith("--probe="));
  const probe = probeArg ? probeArg.slice("--probe=".length) : "all";
  const imageOnly = argv.includes("--image-only");
  return { probe, imageOnly };
}

function formatLogArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) return arg.stack ?? arg.message;
  return String(arg);
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

    const pngPath = path.join(OUTPUT_DIR, "scene-generic.png");
    writeFileSync(pngPath, imageResult.bytes);
    const pngStat = statSync(pngPath);
    if (pngStat.size === 0) {
      console.error("IMAGE ERROR: written PNG is zero-length.");
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

async function main(): Promise<void> {
  const { probe, imageOnly } = parseArgs(process.argv.slice(2));

  if (probe === "childscene") {
    console.error(
      "UNIMPLEMENTED PROBE: --probe=childscene is not implemented in plan 01-03; see plan 01-04.",
    );
    process.exitCode = 1;
    return;
  }

  if (probe !== "generic" && probe !== "all") {
    console.error(`UNKNOWN PROBE: "${probe}". Valid values: generic, childscene, all.`);
    process.exitCode = 1;
    return;
  }

  const exitCode = await withMirroredConsole("generic-run.log", () => runGenericProbe(imageOnly));

  if (probe === "all" && exitCode === 0) {
    // D-01's second call (childscene) belongs to plan 01-04. Reported
    // loudly rather than silently treating a generic-only run as complete.
    console.error(
      "UNIMPLEMENTED PROBE: --probe=all also includes childscene, which is not implemented in plan " +
        "01-03; see plan 01-04.",
    );
    process.exitCode = 1;
    return;
  }

  process.exitCode = exitCode;
}

await main();
