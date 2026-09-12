import { GoogleGenAI } from "@google/genai";
import { logRawResponse } from "../../lib/log-response.ts";

// Pricing verified live 2026-09-12 against ai.google.dev/gemini-api/docs/pricing
// (RESEARCH.md "Cost calculation"). Only the primary model is priced per the
// plan's explicit instruction; if the 403/404 fallback below is ever taken,
// the primary model's price is reused as the best available estimate and the
// fallback is reported loudly rather than silently priced at $0.
export const IMAGE_PRICE_PER_CALL: Record<string, number> = {
  "gemini-3.1-flash-image": 0.067,
};

const PRIMARY_MODEL = "gemini-3.1-flash-image";
// RESEARCH.md Assumption A2: the primary id may be allowlist-gated. If the
// primary model 403s/404s, fall back to this confirmed-available legacy id.
const FALLBACK_MODEL = "gemini-2.5-flash-image";

export interface GenerateImageParams {
  prompt: string;
  aspectRatio: string;
  model?: string;
  // Plan 01-04 (D-02): a single free-text style descriptor composed into the
  // prompt text sent to the model. Intentionally NOT a preset registry — the
  // real six-preset style-configuration system with Style Bible generation
  // belongs to Phase 2 (CONTEXT.md Deferred Ideas).
  style?: string;
}

export interface ImageBlockClassification {
  stage: "prompt" | "candidate";
  reason: string;
}

export interface GenerateImageResult {
  bytes: Buffer | null;
  mimeType: string | null;
  usageMetadata: unknown;
  estimatedUsd: number;
  modelUsed: string;
  fallbackUsed: boolean;
  blocked: boolean;
  block?: ImageBlockClassification;
}

function isNotFoundOrForbidden(err: unknown): boolean {
  const status = (err as { status?: number; code?: number })?.status ?? (err as { code?: number })?.code;
  return status === 403 || status === 404;
}

/**
 * Calls Gemini's native image generation model and returns bytes plus a
 * defensive classification. Classifies BEFORE parsing (RESEARCH.md Pattern
 * 1): promptFeedback.blockReason is read first, then candidates[0].finishReason,
 * and only then is inline image data looked for. A response with no image and
 * no thrown exception is reported with whichever field was actually set,
 * never as a generic "no image returned" message (RESEARCH.md Pitfall 2).
 */
export async function generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
  const primaryModel = params.model ?? PRIMARY_MODEL;
  const ai = new GoogleGenAI({});

  // D-02: style is composed into the prompt text as a single free-text
  // descriptor, not a preset registry (Phase 2's concern, not this one's).
  const promptText = params.style ? `${params.style} style. ${params.prompt}` : params.prompt;

  let modelUsed = primaryModel;
  let fallbackUsed = false;
  let response;

  try {
    response = await ai.models.generateContent({
      model: primaryModel,
      contents: promptText,
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: params.aspectRatio },
      },
    });
  } catch (err) {
    if (!isNotFoundOrForbidden(err)) {
      throw err;
    }
    console.log(
      `IMAGE MODEL FALLBACK: primary model "${primaryModel}" returned a 403/404 ` +
        `(${(err as Error).message}); retrying with fallback model "${FALLBACK_MODEL}".`,
    );
    modelUsed = FALLBACK_MODEL;
    fallbackUsed = true;
    response = await ai.models.generateContent({
      model: FALLBACK_MODEL,
      contents: promptText,
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: params.aspectRatio },
      },
    });
  }

  // Empirical verification per plan Task 2: log the full raw response before
  // any parsing code runs, so the real shape is confirmed rather than assumed
  // from RESEARCH.md or either of Google's inconsistent docs pages.
  logRawResponse(`generateContent raw response (model=${modelUsed})`, response);

  const estimatedUsd = IMAGE_PRICE_PER_CALL[primaryModel] ?? IMAGE_PRICE_PER_CALL[PRIMARY_MODEL];
  const usageMetadata = response.usageMetadata ?? null;

  // Classify BEFORE checking for image bytes (RESEARCH.md Pattern 1).
  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) {
    return {
      bytes: null,
      mimeType: null,
      usageMetadata,
      estimatedUsd,
      modelUsed,
      fallbackUsed,
      blocked: true,
      block: { stage: "prompt", reason: String(blockReason) },
    };
  }

  const candidate = response.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const part = candidate?.content?.parts?.find((p) => p.inlineData?.data);

  if (!part?.inlineData?.data) {
    // Ambiguous-block guard (RESEARCH.md Pitfall 2): no image and no thrown
    // exception. Print whichever field was actually set rather than a
    // generic "no image returned" message.
    const reason = finishReason ? String(finishReason) : "NO_CANDIDATE_OR_IMAGE_DATA";
    return {
      bytes: null,
      mimeType: null,
      usageMetadata,
      estimatedUsd,
      modelUsed,
      fallbackUsed,
      blocked: true,
      block: { stage: "candidate", reason },
    };
  }

  return {
    bytes: Buffer.from(part.inlineData.data, "base64"),
    mimeType: part.inlineData.mimeType ?? "image/png",
    usageMetadata,
    estimatedUsd,
    modelUsed,
    fallbackUsed,
    blocked: false,
  };
}
