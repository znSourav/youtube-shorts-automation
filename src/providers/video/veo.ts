import { GoogleGenAI, type GenerateVideosOperation } from "@google/genai";
import { logRawResponse } from "../../lib/log-response.ts";
import { VIDEO_HTTP_TIMEOUT_MS } from "../../core/config/provider-timeouts.ts";

// Pricing verified live 2026-09-12 against ai.google.dev/gemini-api/docs/pricing
// (RESEARCH.md "Cost calculation").
export const VIDEO_PRICE_PER_SECOND: Record<string, number> = {
  "720p": 0.05,
  "1080p": 0.08,
};

const MODEL = "veo-3.1-lite-generate-preview";
const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes (ROADMAP SC-4: no silent hang)

export interface GenerateVideoParams {
  imageBytes: Buffer;
  mimeType: string;
  prompt: string;
  durationSeconds: number;
  resolution: "720p" | "1080p";
  aspectRatio: string;
  outputPath: string;
}

// D-01/06-RESEARCH.md Pattern 2: mirrors gemini-image.ts's `stage`
// discriminator and gemini.ts's `StoryBlockClassification.stage` -- the
// same "classify the real cause, don't collapse it into one boolean" shape,
// extended to the one provider that was still missing it. "content" is the
// ONLY genuine content-safety classification Veo reports
// (raiMediaFilteredCount > 0); every other blocked branch is "technical" (an
// operation error, or a malformed/empty response).
export type VideoBlockKind = "content" | "technical";

// The rephrase framing -- set only on the genuine RAI content-safety block.
export const VIDEO_CONTENT_BLOCK_MESSAGE =
  "This scene's video couldn't be made from that image and movement description. Try rephrasing the scene, or regenerate its image first.";

// The try-again framing -- byte-identical to what generate-video.ts already
// returned for every blocked case before this discriminator existed, so a
// technical failure's observable message is unchanged.
export const VIDEO_TECHNICAL_BLOCK_MESSAGE = "The video could not be generated. Please try again.";

/**
 * Selects the plain-language sentence for a blocked video result, mirroring
 * gemini-image.ts's plainLanguageBlockMessage shape (a guard for the
 * specific classified case, then a single fall-through). An undefined
 * blockKind (an unclassified block, which should not happen given the three
 * branches in generateVideo below always set one, but is defended against
 * anyway) gets the safe try-again framing, never the rephrase framing --
 * telling her to rewrite a scene that failed for a technical reason would
 * waste one of her limited retry attempts on advice that cannot help.
 */
export function plainLanguageVideoBlockMessage(blockKind?: VideoBlockKind): string {
  if (blockKind === "content") {
    return VIDEO_CONTENT_BLOCK_MESSAGE;
  }
  return VIDEO_TECHNICAL_BLOCK_MESSAGE;
}

export interface GenerateVideoResult {
  filePath: string | null;
  usageMetadata: unknown;
  estimatedUsd: number;
  blocked: boolean;
  blockReason?: string;
  blockKind?: VideoBlockKind;
  timedOut?: boolean;
  operationName?: string;
}

/**
 * Calls Veo 3.1 Lite image-to-video, polls the long-running operation with a
 * hard 10-minute ceiling (printing a waiting line each iteration so a slow
 * poll is visibly progress and not a hang), then downloads the result.
 * raiMediaFilteredCount/raiMediaFilteredReasons are read BEFORE assuming
 * success, once the operation reports done (RESEARCH.md Pattern 1, Pitfall 3).
 */
export async function generateVideo(params: GenerateVideoParams): Promise<GenerateVideoResult> {
  const ai = new GoogleGenAI({});
  const estimatedUsd = params.durationSeconds * VIDEO_PRICE_PER_SECOND[params.resolution];

  let operation: GenerateVideosOperation = await ai.models.generateVideos({
    model: MODEL,
    prompt: params.prompt,
    image: {
      imageBytes: params.imageBytes.toString("base64"),
      mimeType: params.mimeType,
    },
    config: {
      aspectRatio: params.aspectRatio,
      resolution: params.resolution,
      // Empirical correction vs RESEARCH.md's Code Examples: the installed
      // SDK's GenerateVideosConfig.durationSeconds is typed `number`, not the
      // string `"8"` shown in Google's own Veo docs sample.
      durationSeconds: params.durationSeconds,
      // 05-REVIEW.md WR-01 / 06-RESEARCH.md Pattern 6: bounds this one
      // dispatch HTTP attempt only -- NOT the polling loop below, which
      // POLL_TIMEOUT_MS already bounds separately. See
      // src/core/config/provider-timeouts.ts's header comment.
      httpOptions: { timeout: VIDEO_HTTP_TIMEOUT_MS },
    },
  });

  const startedAt = Date.now();
  while (!operation.done) {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      return {
        filePath: null,
        usageMetadata: null,
        estimatedUsd,
        blocked: false,
        timedOut: true,
        operationName: operation.name,
      };
    }
    console.log(`VEO POLL: waiting for operation ${operation.name ?? "(unnamed)"} to complete...`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    // 05-REVIEW.md WR-01 / 06-RESEARCH.md Pitfall 3: this per-call timeout
    // bounds ONE individual poll request -- a single hung poll would
    // otherwise never be reached by the POLL_TIMEOUT_MS check above, since
    // that check only runs between iterations, after each await resolves.
    operation = await ai.operations.getVideosOperation({
      operation,
      config: { httpOptions: { timeout: VIDEO_HTTP_TIMEOUT_MS } },
    });
  }

  logRawResponse("generateVideos operation raw response (done)", operation);

  if (operation.error) {
    // Technical: the long-running operation itself errored, not a
    // content-safety decision.
    return {
      filePath: null,
      usageMetadata: operation.response ?? null,
      estimatedUsd,
      blocked: true,
      blockKind: "technical",
      blockReason: `operation error: ${JSON.stringify(operation.error)}`,
    };
  }

  const raiCount = operation.response?.raiMediaFilteredCount;
  const raiReasons = operation.response?.raiMediaFilteredReasons;
  if (raiCount && raiCount > 0) {
    // Content: the ONLY genuine content-safety classification Veo reports.
    return {
      filePath: null,
      usageMetadata: operation.response ?? null,
      estimatedUsd,
      blocked: true,
      blockKind: "content",
      blockReason: (raiReasons ?? []).join("; ") || "raiMediaFilteredCount>0 with no reasons given",
    };
  }

  const generatedVideo = operation.response?.generatedVideos?.[0];
  if (!generatedVideo?.video) {
    // Technical: a malformed or empty response, not a policy decision.
    return {
      filePath: null,
      usageMetadata: operation.response ?? null,
      estimatedUsd,
      blocked: true,
      blockKind: "technical",
      blockReason: "NO_VIDEO_IN_RESPONSE",
    };
  }

  // Don't hand-roll the download/auth-header wiring (RESEARCH.md "Don't Hand-Roll").
  await ai.files.download({
    file: generatedVideo.video,
    downloadPath: params.outputPath,
  });

  return {
    filePath: params.outputPath,
    usageMetadata: operation.response ?? null,
    estimatedUsd,
    blocked: false,
  };
}
