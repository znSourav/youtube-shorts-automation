import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyStoryResponse, classifyComparisonResponse, LLM_PRICE_PER_CALL, COMPARISON_MODEL } from "./gemini.ts";

function baseResponse(overrides: Record<string, unknown> = {}) {
  return {
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
    ...overrides,
  };
}

// These four cases are the four ways a real Story Director call fails, each
// needing a different fix -- a test that cannot tell them apart is worth
// little when one of them fires against a $1.80 budget.

test("classifyStoryResponse returns a blocked result naming a prompt-level block reason verbatim", () => {
  const response = baseResponse({ promptFeedback: { blockReason: "SAFETY" } });
  const result = classifyStoryResponse(response, "gemini-3.1-pro-preview", false, 0.05);
  assert.equal(result.blocked, true);
  assert.equal(result.block?.stage, "prompt");
  assert.equal(result.block?.reason, "SAFETY");
});

test("classifyStoryResponse names truncation specifically when finishReason is MAX_TOKENS, not a generic message", () => {
  const response = baseResponse({
    candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } }],
  });
  const result = classifyStoryResponse(response, "gemini-3.1-pro-preview", false, 0.05);
  assert.equal(result.blocked, true);
  assert.equal(result.block?.stage, "candidate");
  assert.equal(result.block?.reason, "MAX_TOKENS");
});

test("classifyStoryResponse returns a blocked result instead of throwing when the body is not parseable JSON", () => {
  const response = baseResponse({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not valid json" }] } }],
  });
  const result = classifyStoryResponse(response, "gemini-3.1-pro-preview", false, 0.05);
  assert.equal(result.blocked, true);
  assert.equal(result.block?.stage, "parse");
});

test("classifyStoryResponse returns the parsed object with the model id and a positive estimated cost on a well-formed response", () => {
  const response = baseResponse({
    candidates: [
      { finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ story: { title: "T" } }) }] } },
    ],
  });
  const result = classifyStoryResponse(response, "gemini-3.1-pro-preview", false, 0.05);
  assert.equal(result.blocked, false);
  assert.deepEqual(result.raw, { story: { title: "T" } });
  assert.equal(result.modelUsed, "gemini-3.1-pro-preview");
  assert.ok(result.estimatedUsd > 0);
});

test("classifyStoryResponse reports a missing-text candidate distinctly, not as a generic block", () => {
  const response = baseResponse({
    candidates: [{ finishReason: "STOP", content: { parts: [] } }],
  });
  const result = classifyStoryResponse(response, "gemini-3.1-pro-preview", false, 0.05);
  assert.equal(result.blocked, true);
  assert.equal(result.block?.reason, "NO_TEXT_IN_RESPONSE");
});

test("LLM_PRICE_PER_CALL prices both the primary and fallback models above zero", () => {
  assert.ok(LLM_PRICE_PER_CALL["gemini-3.1-pro-preview"] > 0);
  assert.ok(LLM_PRICE_PER_CALL["gemini-3.8-flash"] > 0);
});

// Comparison classifier (structural-uniqueness tie-breaker, plan 03-02 Task
// 2) -- same four failure modes as the story classifier, each needing a
// distinct fix, plus the two-of-three case that must not collapse.

test("classifyComparisonResponse returns a blocked result naming a prompt-level block reason verbatim", () => {
  const response = baseResponse({ promptFeedback: { blockReason: "SAFETY" } });
  const result = classifyComparisonResponse(response, COMPARISON_MODEL, 0.01);
  assert.equal(result.blocked, true);
  assert.equal(result.block?.stage, "prompt");
  assert.equal(result.block?.reason, "SAFETY");
});

test("classifyComparisonResponse names truncation specifically when finishReason is MAX_TOKENS, not a generic message", () => {
  const response = baseResponse({
    candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } }],
  });
  const result = classifyComparisonResponse(response, COMPARISON_MODEL, 0.01);
  assert.equal(result.blocked, true);
  assert.equal(result.block?.stage, "candidate");
  assert.equal(result.block?.reason, "MAX_TOKENS");
});

test("classifyComparisonResponse returns a blocked result instead of throwing when the body is not parseable JSON", () => {
  const response = baseResponse({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: "not valid json" }] } }],
  });
  const result = classifyComparisonResponse(response, COMPARISON_MODEL, 0.01);
  assert.equal(result.blocked, true);
  assert.equal(result.block?.stage, "parse");
});

test("classifyComparisonResponse returns the three booleans with the model id and a positive estimated cost on a well-formed all-true response", () => {
  const response = baseResponse({
    candidates: [
      {
        finishReason: "STOP",
        content: {
          parts: [{ text: JSON.stringify({ protagonist_match: true, obstacle_match: true, ending_match: true }) }],
        },
      },
    ],
  });
  const result = classifyComparisonResponse(response, COMPARISON_MODEL, 0.01);
  assert.equal(result.blocked, false);
  assert.equal(result.protagonistMatch, true);
  assert.equal(result.obstacleMatch, true);
  assert.equal(result.endingMatch, true);
  assert.equal(result.modelUsed, COMPARISON_MODEL);
  assert.ok(result.estimatedUsd > 0);
});

test("classifyComparisonResponse returns exactly a two-of-three response's booleans without collapsing them", () => {
  const response = baseResponse({
    candidates: [
      {
        finishReason: "STOP",
        content: {
          parts: [{ text: JSON.stringify({ protagonist_match: true, obstacle_match: false, ending_match: true }) }],
        },
      },
    ],
  });
  const result = classifyComparisonResponse(response, COMPARISON_MODEL, 0.01);
  assert.equal(result.blocked, false);
  assert.equal(result.protagonistMatch, true);
  assert.equal(result.obstacleMatch, false);
  assert.equal(result.endingMatch, true);
});
