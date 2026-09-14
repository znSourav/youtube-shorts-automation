import { test } from "node:test";
import assert from "node:assert/strict";

import { maxSceneRetryAttempts, DEFAULT_MAX_SCENE_RETRY_ATTEMPTS } from "./caps.ts";

// Mirrors src/core/uniqueness/check.test.ts's maxRegenerationAttempts
// coverage style. Every case passes a plain object as the `env` argument --
// never mutates process.env.

test("DEFAULT_MAX_SCENE_RETRY_ATTEMPTS equals 3", () => {
  assert.equal(DEFAULT_MAX_SCENE_RETRY_ATTEMPTS, 3);
});

test("an absent MAX_SCENE_RETRY_ATTEMPTS returns DEFAULT_MAX_SCENE_RETRY_ATTEMPTS", () => {
  assert.equal(maxSceneRetryAttempts({}), DEFAULT_MAX_SCENE_RETRY_ATTEMPTS);
});

test('"5" returns 5', () => {
  assert.equal(maxSceneRetryAttempts({ MAX_SCENE_RETRY_ATTEMPTS: "5" }), 5);
});

test('"0" returns the default', () => {
  assert.equal(maxSceneRetryAttempts({ MAX_SCENE_RETRY_ATTEMPTS: "0" }), DEFAULT_MAX_SCENE_RETRY_ATTEMPTS);
});

test('"-2" returns the default', () => {
  assert.equal(maxSceneRetryAttempts({ MAX_SCENE_RETRY_ATTEMPTS: "-2" }), DEFAULT_MAX_SCENE_RETRY_ATTEMPTS);
});

test('"2.5" returns the default', () => {
  assert.equal(maxSceneRetryAttempts({ MAX_SCENE_RETRY_ATTEMPTS: "2.5" }), DEFAULT_MAX_SCENE_RETRY_ATTEMPTS);
});

test('"abc" returns the default', () => {
  assert.equal(maxSceneRetryAttempts({ MAX_SCENE_RETRY_ATTEMPTS: "abc" }), DEFAULT_MAX_SCENE_RETRY_ATTEMPTS);
});

test('"" returns the default', () => {
  assert.equal(maxSceneRetryAttempts({ MAX_SCENE_RETRY_ATTEMPTS: "" }), DEFAULT_MAX_SCENE_RETRY_ATTEMPTS);
});
