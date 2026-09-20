import { GoogleGenAI } from "@google/genai";
import { logRawResponse } from "../../lib/log-response.ts";
import { LLM_HTTP_TIMEOUT_MS } from "../../core/config/provider-timeouts.ts";

// RESEARCH.md "Standard Stack" / Assumption A1: gemini-3.1-pro-preview wins
// on creative-writing quality (LMArena Creative Writing #1 for Pro-tier);
// gemini-3.8-flash is the GA-tier fallback if Preview access is gated.
//
// Google publishes per-token text pricing, not a per-call figure, for either
// model. These are deliberately conservative FLAT per-call estimates for the
// ceiling gate -- over-estimating is the only safe direction here, since
// under-estimating could let a real call through that pushes total spend
// past DEV_CEILING_USD before recordSpend's real usageMetadata is known.
export const LLM_PRICE_PER_CALL: Record<string, number> = {
  "gemini-3.1-pro-preview": 0.05,
  "gemini-3.8-flash": 0.01,
};

const PRIMARY_MODEL = "gemini-3.1-pro-preview";
// RESEARCH.md Assumption A1: the primary id is a Preview-tier id that may be
// allowlist-gated. If it 403s/404s, fall back to the GA-tier model, exactly
// the same fallback shape gemini-image.ts already established for images.
const FALLBACK_MODEL = "gemini-3.8-flash";

// RESEARCH.md Assumption A2: the cheaper GA-tier model (the same id
// generateStory itself falls back to on 403/404) is judged an adequate
// choice for a three-boolean structural-match judgement, reserved for
// deliberate cost reasons -- a three-boolean judgement doesn't need the
// Preview-tier creative-writing model. This is a cost decision whose
// failure mode is judgement quality, not spend: if the cheaper model's
// true/false judgments prove unreliable, upgrading this one constant is the
// fix, not a network/pricing change. No primary/fallback dance is needed
// for this call -- COMPARISON_MODEL already IS the fallback id.
export const COMPARISON_MODEL = "gemini-3.8-flash";

function isNotFoundOrForbidden(err: unknown): boolean {
  const status = (err as { status?: number; code?: number })?.status ?? (err as { code?: number })?.code;
  return status === 403 || status === 404;
}

export interface GenerateStoryParams {
  prompt: string;
  responseSchema: object;
  model?: string;
}

export interface StoryBlockClassification {
  stage: "prompt" | "candidate" | "parse";
  reason: string;
}

export interface GenerateStoryResult {
  // Parsed JSON before zod validation -- runStoryDirector (director.ts) is
  // the only caller that validates it further.
  raw: unknown;
  usageMetadata: unknown;
  estimatedUsd: number;
  modelUsed: string;
  fallbackUsed: boolean;
  blocked: boolean;
  block?: StoryBlockClassification;
}

// Loose structural shape of a generateContent response -- deliberately not
// the SDK's own exported response type, so gemini.test.ts can construct
// plain fixture objects and exercise this function with zero network calls
// and no dependency on the SDK's internal type surface.
interface RawGenerateContentResponse {
  promptFeedback?: { blockReason?: unknown };
  candidates?: Array<{
    finishReason?: unknown;
    content?: { parts?: Array<{ text?: string }> };
  }>;
  usageMetadata?: unknown;
}

/**
 * Classifies a raw generateContent response BEFORE trusting any payload
 * field, then parses the JSON text (RESEARCH.md Pattern 1 / Pitfall 3,
 * mirroring gemini-image.ts's classify-before-parse ordering): first
 * `promptFeedback.blockReason`, then `candidates[0].finishReason` (a
 * non-STOP reason -- including MAX_TOKENS, named specifically since a
 * truncated response needs a different fix than a content block -- is
 * always treated as blocked), and only then `candidates[0].content.parts[0].text`.
 * A JSON.parse failure on that text returns a classified blocked result
 * rather than throwing, carrying the parser's own message verbatim.
 */
export function classifyStoryResponse(
  response: RawGenerateContentResponse,
  modelUsed: string,
  fallbackUsed: boolean,
  estimatedUsd: number,
): GenerateStoryResult {
  const usageMetadata = response.usageMetadata ?? null;

  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) {
    return {
      raw: null,
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
  if (finishReason && finishReason !== "STOP") {
    // MAX_TOKENS is its own named outcome, distinct from a content-safety
    // block -- it needs raising maxOutputTokens or shrinking the schema,
    // not a re-prompt (RESEARCH.md Pitfall 2).
    return {
      raw: null,
      usageMetadata,
      estimatedUsd,
      modelUsed,
      fallbackUsed,
      blocked: true,
      block: { stage: "candidate", reason: String(finishReason) },
    };
  }

  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    return {
      raw: null,
      usageMetadata,
      estimatedUsd,
      modelUsed,
      fallbackUsed,
      blocked: true,
      block: { stage: "candidate", reason: "NO_TEXT_IN_RESPONSE" },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      raw: null,
      usageMetadata,
      estimatedUsd,
      modelUsed,
      fallbackUsed,
      blocked: true,
      block: { stage: "parse", reason: `JSON.parse failed: ${(err as Error).message}` },
    };
  }

  return {
    raw: parsed,
    usageMetadata,
    estimatedUsd,
    modelUsed,
    fallbackUsed,
    blocked: false,
  };
}

/**
 * Calls Gemini's structured-output `generateContent` for the Story
 * Director and returns a classified, defensively-parsed result. Mirrors
 * `gemini-image.ts`'s shape exactly: primary/fallback model on 403/404,
 * `logRawResponse` before any field access, classify-before-parse via
 * `classifyStoryResponse`. `maxOutputTokens` is set explicitly (16384) --
 * the unset 8192 default can truncate a 7-scene response mid-JSON
 * (RESEARCH.md Pitfall 2).
 */
export async function generateStory(params: GenerateStoryParams): Promise<GenerateStoryResult> {
  const primaryModel = params.model ?? PRIMARY_MODEL;
  const ai = new GoogleGenAI({});

  const config = {
    responseMimeType: "application/json",
    responseSchema: params.responseSchema,
    maxOutputTokens: 16384,
    // 05-REVIEW.md WR-01 / 06-RESEARCH.md Pattern 6: bounds this one HTTP
    // attempt (shared by the primary and fallback generateContent calls
    // below) so a hung request can never wedge serializeDispatch's shared
    // queue. See src/core/config/provider-timeouts.ts's header comment.
    httpOptions: { timeout: LLM_HTTP_TIMEOUT_MS },
  };

  let modelUsed = primaryModel;
  let fallbackUsed = false;
  let response;

  try {
    response = await ai.models.generateContent({
      model: primaryModel,
      contents: params.prompt,
      config,
    });
  } catch (err) {
    if (!isNotFoundOrForbidden(err)) {
      throw err;
    }
    console.log(
      `STORY MODEL FALLBACK: primary model "${primaryModel}" returned a 403/404 ` +
        `(${(err as Error).message}); retrying with fallback model "${FALLBACK_MODEL}".`,
    );
    modelUsed = FALLBACK_MODEL;
    fallbackUsed = true;
    response = await ai.models.generateContent({
      model: FALLBACK_MODEL,
      contents: params.prompt,
      config,
    });
  }

  // Empirical shape verification, same convention as gemini-image.ts: log
  // the full raw response before any parsing code runs.
  logRawResponse(`generateContent raw response (model=${modelUsed})`, response);

  // Priced off modelUsed (the model actually dispatched, reassigned to
  // FALLBACK_MODEL above on a 403/404), not primaryModel (the model only
  // intended before any fallback) -- otherwise a genuine fallback reports
  // the more expensive primary model's price on the correctly-named
  // fallback response (WR-04).
  const estimatedUsd = LLM_PRICE_PER_CALL[modelUsed] ?? LLM_PRICE_PER_CALL[PRIMARY_MODEL];

  return classifyStoryResponse(response, modelUsed, fallbackUsed, estimatedUsd);
}

export interface CompareStructuralSimilarityParams {
  prompt: string;
  responseSchema: object;
}

export interface ComparisonBlockClassification {
  stage: "prompt" | "candidate" | "parse";
  reason: string;
}

export interface ClassifyComparisonResult {
  usageMetadata: unknown;
  estimatedUsd: number;
  modelUsed: string;
  blocked: boolean;
  block?: ComparisonBlockClassification;
  // Present only when blocked is false.
  protagonistMatch?: boolean;
  obstacleMatch?: boolean;
  endingMatch?: boolean;
}

/**
 * Classifies a raw generateContent response for the structural-comparison
 * tie-breaker, in the identical classify-before-parse order
 * classifyStoryResponse uses: prompt-level blockReason first, then a
 * candidate finishReason other than STOP, then the absence of text, and
 * only then the JSON parse -- a parse failure returns a classified blocked
 * result rather than throwing. Reuses the same loose RawGenerateContentResponse
 * shape as classifyStoryResponse (not the SDK's own response type) so this
 * file's test can build plain fixture objects with zero SDK dependency.
 */
export function classifyComparisonResponse(
  response: RawGenerateContentResponse,
  modelUsed: string,
  estimatedUsd: number,
): ClassifyComparisonResult {
  const usageMetadata = response.usageMetadata ?? null;

  const blockReason = response.promptFeedback?.blockReason;
  if (blockReason) {
    return {
      usageMetadata,
      estimatedUsd,
      modelUsed,
      blocked: true,
      block: { stage: "prompt", reason: String(blockReason) },
    };
  }

  const candidate = response.candidates?.[0];
  const finishReason = candidate?.finishReason;
  if (finishReason && finishReason !== "STOP") {
    return {
      usageMetadata,
      estimatedUsd,
      modelUsed,
      blocked: true,
      block: { stage: "candidate", reason: String(finishReason) },
    };
  }

  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) {
    return {
      usageMetadata,
      estimatedUsd,
      modelUsed,
      blocked: true,
      block: { stage: "candidate", reason: "NO_TEXT_IN_RESPONSE" },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      usageMetadata,
      estimatedUsd,
      modelUsed,
      blocked: true,
      block: { stage: "parse", reason: `JSON.parse failed: ${(err as Error).message}` },
    };
  }

  const obj = parsed as Record<string, unknown>;
  return {
    usageMetadata,
    estimatedUsd,
    modelUsed,
    blocked: false,
    protagonistMatch: Boolean(obj.protagonist_match),
    obstacleMatch: Boolean(obj.obstacle_match),
    endingMatch: Boolean(obj.ending_match),
  };
}

/**
 * Calls Gemini's structured-output generateContent for the targeted
 * structural-comparison tie-breaker and returns a classified, defensively-
 * parsed result. Mirrors generateStory's shape: logRawResponse before any
 * field access, classify-before-parse via classifyComparisonResponse. An
 * explicit small maxOutputTokens is set -- a three-boolean response needs
 * very few tokens, and bounding it is what stops a runaway response costing
 * more than the judgement is worth.
 */
export async function compareStructuralSimilarity(
  params: CompareStructuralSimilarityParams,
): Promise<ClassifyComparisonResult> {
  const ai = new GoogleGenAI({});

  const config = {
    responseMimeType: "application/json",
    responseSchema: params.responseSchema,
    maxOutputTokens: 256,
    // 05-REVIEW.md WR-01 / 06-RESEARCH.md Pattern 6: bounds this one HTTP
    // attempt so a hung request can never wedge serializeDispatch's shared
    // queue. See src/core/config/provider-timeouts.ts's header comment.
    httpOptions: { timeout: LLM_HTTP_TIMEOUT_MS },
  };

  const response = await ai.models.generateContent({
    model: COMPARISON_MODEL,
    contents: params.prompt,
    config,
  });

  logRawResponse(`generateContent raw response (comparison, model=${COMPARISON_MODEL})`, response);

  const estimatedUsd = LLM_PRICE_PER_CALL[COMPARISON_MODEL];

  return classifyComparisonResponse(response, COMPARISON_MODEL, estimatedUsd);
}
