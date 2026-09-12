import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyStoryResponse, LLM_PRICE_PER_CALL } from "./gemini.ts";

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
