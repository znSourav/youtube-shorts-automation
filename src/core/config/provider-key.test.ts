import { test } from "node:test";
import assert from "node:assert/strict";

import { MissingApiKeyError, MISSING_API_KEY_MESSAGE, assertApiKeyConfigured } from "./provider-key.ts";

test("assertApiKeyConfigured throws MissingApiKeyError when neither key var is set", () => {
  assert.throws(() => assertApiKeyConfigured({}), MissingApiKeyError);
});

test("assertApiKeyConfigured treats a whitespace-only GEMINI_API_KEY as absent", () => {
  assert.throws(() => assertApiKeyConfigured({ GEMINI_API_KEY: "   " }), MissingApiKeyError);
});

test("assertApiKeyConfigured returns without throwing when GEMINI_API_KEY is set", () => {
  assert.doesNotThrow(() => assertApiKeyConfigured({ GEMINI_API_KEY: "abc" }));
});

test("assertApiKeyConfigured returns without throwing when GOOGLE_API_KEY is set -- it takes precedence", () => {
  assert.doesNotThrow(() => assertApiKeyConfigured({ GOOGLE_API_KEY: "abc" }));
});

test("MissingApiKeyError's name is exactly the class name", () => {
  const err = new MissingApiKeyError();
  assert.equal(err.name, "MissingApiKeyError");
});

test("MISSING_API_KEY_MESSAGE names no environment variable, file path, provider, or model", () => {
  const forbidden = ["GEMINI_API_KEY", "GOOGLE_API_KEY", ".env", "process.env", "gemini", "veo"];
  const lowered = MISSING_API_KEY_MESSAGE.toLowerCase();
  for (const term of forbidden) {
    assert.ok(!lowered.includes(term.toLowerCase()), `message must not contain "${term}": ${MISSING_API_KEY_MESSAGE}`);
  }
});
