import { test } from "node:test";
import assert from "node:assert/strict";

import { redactLargeStrings, logRawResponse } from "./log-response.ts";

test("redactLargeStrings replaces a long string with a length-naming placeholder", () => {
  const big = "A".repeat(5000);
  const result = redactLargeStrings(big) as string;
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("A".repeat(300)), "original characters must be absent");
  assert.ok(/5000/.test(result), `placeholder should state the original length: ${result}`);
});

test("redactLargeStrings leaves a short string unchanged", () => {
  const short = "a".repeat(40);
  const result = redactLargeStrings(short);
  assert.equal(result, short);
});

test("redactLargeStrings traverses nested objects and arrays, redacting a deeply buried long string", () => {
  const big = "B".repeat(5000);
  const value = { level1: { level2: [{ level3: big }] } };
  const result = redactLargeStrings(value) as typeof value;
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("B".repeat(300)), "buried long string must be redacted");
});

test("fields named data, imageBytes, or videoBytes are redacted regardless of length", () => {
  const value = {
    data: "short",
    imageBytes: "also-short",
    videoBytes: "still-short",
    other: "short-too",
  };
  const result = redactLargeStrings(value) as Record<string, unknown>;
  assert.notEqual(result.data, "short");
  assert.notEqual(result.imageBytes, "also-short");
  assert.notEqual(result.videoBytes, "still-short");
  assert.equal(result.other, "short-too");
});

test("key-shaped fields (apiKey, authorization, x-goog-api-key, token) are replaced wholesale, no prefix/suffix survives", () => {
  const secret = "AIzaSyTESTVALUE1234567890";
  const value = {
    apiKey: secret,
    authorization: `Bearer ${secret}`,
    "x-goog-api-key": secret,
    token: secret,
  };
  const result = redactLargeStrings(value) as Record<string, unknown>;
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes(secret), "no part of the secret may survive");
  assert.ok(!serialized.includes(secret.slice(0, 6)), "no prefix of the secret may survive");
  assert.ok(!serialized.includes(secret.slice(-6)), "no suffix of the secret may survive");
});

test("a circular object does not throw and yields a marker where the cycle was", () => {
  type Circular = { name: string; self?: Circular };
  const value: Circular = { name: "root" };
  value.self = value;
  let result: unknown;
  assert.doesNotThrow(() => {
    result = redactLargeStrings(value);
  });
  const serialized = JSON.stringify(result);
  assert.ok(/circular/i.test(serialized), `expected a circular marker in: ${serialized}`);
});

test("the return value survives JSON.parse(JSON.stringify(...)) without throwing", () => {
  const big = "C".repeat(5000);
  const value = { candidates: [{ content: { parts: [{ inlineData: { data: big } }] } }] };
  const result = redactLargeStrings(value);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(result)));
});

test("real usage-metadata token-count fields, nested under usageMetadata as the SDK actually shapes them, are left unchanged (WINDOWS #2)", () => {
  const value = { usageMetadata: { promptTokenCount: 42 } };
  const result = redactLargeStrings(value) as typeof value;
  assert.equal(result.usageMetadata.promptTokenCount, 42);
});

test("a nested tokensDetails array's tokenCount field, inside usageMetadata, is left unchanged", () => {
  const value = { usageMetadata: { candidatesTokensDetails: [{ modality: "TEXT", tokenCount: 10 }] } };
  const result = redactLargeStrings(value) as typeof value;
  assert.equal(result.usageMetadata.candidatesTokensDetails[0].tokenCount, 10);
});

test("every real usage-metadata field name, nested under usageMetadata, is left unchanged, all twelve at once", () => {
  const value = {
    usageMetadata: {
      cachedContentTokenCount: 1,
      candidatesTokenCount: 2,
      promptTokenCount: 3,
      thoughtsTokenCount: 4,
      toolUsePromptTokenCount: 5,
      totalTokenCount: 6,
      tokensDetails: [{ modality: "TEXT", tokenCount: 7 }],
      candidatesTokensDetails: [{ modality: "TEXT", tokenCount: 8 }],
      promptTokensDetails: [{ modality: "TEXT", tokenCount: 9 }],
      cacheTokensDetails: [{ modality: "TEXT", tokenCount: 10 }],
      toolUsePromptTokensDetails: [{ modality: "TEXT", tokenCount: 11 }],
      responseTokensDetails: [{ modality: "TEXT", tokenCount: 12 }],
    },
  };
  const result = redactLargeStrings(value) as typeof value;
  assert.deepEqual(result, value);
});

test("06-REVIEW.md WR-01: a suffix-shaped field OUTSIDE usageMetadata is NOT exempted -- the pre-Phase-6 strict behavior still applies elsewhere in the tree", () => {
  const value = { promptTokenCount: 42, nested: { sessionTokenCount: "a-real-secret-value" } };
  const result = redactLargeStrings(value) as Record<string, unknown>;
  assert.notEqual(result.promptTokenCount, 42, "a top-level field sharing the suffix, with no usageMetadata ancestor, must still redact");
  assert.equal(result.promptTokenCount, "[REDACTED:secret]");
  const nested = result.nested as Record<string, unknown>;
  assert.equal(nested.sessionTokenCount, "[REDACTED:secret]", "a nested field sharing the suffix, with no usageMetadata ancestor, must still redact");
});

test("apiKey, x-goog-api-key, authorization, and bare token remain redacted", () => {
  const value = { apiKey: "secret", "x-goog-api-key": "secret", authorization: "Bearer secret", token: "secret" };
  const result = redactLargeStrings(value) as Record<string, unknown>;
  assert.equal(result.apiKey, "[REDACTED:secret]");
  assert.equal(result["x-goog-api-key"], "[REDACTED:secret]");
  assert.equal(result.authorization, "[REDACTED:secret]");
  assert.equal(result.token, "[REDACTED:secret]");
});

test("a name that passes the safe-token-suffix test but is also key-shaped still redacts (defense in depth), even inside usageMetadata", () => {
  const value = { usageMetadata: { apiKeyTokenCount: "secret" } };
  const result = redactLargeStrings(value) as Record<string, unknown>;
  const usageMetadata = result.usageMetadata as Record<string, unknown>;
  assert.equal(usageMetadata.apiKeyTokenCount, "[REDACTED:secret]");
});

test("logRawResponse prints the label followed by the redacted JSON without throwing", () => {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    assert.doesNotThrow(() => logRawResponse("TEST LABEL", { apiKey: "secret-value", ok: true }));
  } finally {
    console.log = originalLog;
  }
  const output = lines.join("\n");
  assert.ok(output.includes("TEST LABEL"), "label must be printed");
  assert.ok(!output.includes("secret-value"), "secret must not be printed");
});
