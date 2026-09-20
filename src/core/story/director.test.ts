import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildStorySchema,
  buildStoryPrompt,
  plainLanguageStoryBlockMessage,
  STORY_CUT_SHORT_MESSAGE,
  STORY_REPHRASE_MESSAGE,
  STORY_TRY_AGAIN_MESSAGE,
} from "./director.ts";
import { STYLE_PRESETS } from "./styles.ts";
import {
  LLM_HTTP_TIMEOUT_MS,
  IMAGE_HTTP_TIMEOUT_MS,
  VIDEO_HTTP_TIMEOUT_MS,
} from "../config/provider-timeouts.ts";

function containsForbiddenKeyword(value: unknown): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(containsForbiddenKeyword);
  }
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (key === "$ref" || key === "oneOf" || key === "allOf") {
      return true;
    }
    if (containsForbiddenKeyword(val)) {
      return true;
    }
  }
  return false;
}

// (a) STORY-05's mechanical proof: the scene count is a parameter, never a
// constant -- the same assertion is what makes a hardcoded value impossible
// to ship.
for (const n of [3, 5, 6, 7]) {
  test(`buildStorySchema(${n}) sets scenes.minItems and scenes.maxItems to ${n}`, () => {
    const schema = buildStorySchema(n) as {
      properties: { scenes: { minItems: number; maxItems: number } };
    };
    assert.equal(schema.properties.scenes.minItems, n);
    assert.equal(schema.properties.scenes.maxItems, n);
  });
}

// (b) Only the confirmed-supported JSON-Schema keyword subset is used.
test("buildStorySchema output contains no $ref, oneOf, or allOf at any depth", () => {
  const schema = buildStorySchema(5);
  assert.equal(containsForbiddenKeyword(schema), false);
});

// (c) SCENE-02's mechanical half: the continuity instruction and the
// character material actually reach the prompt, not merely assumed from
// context.
test("buildStoryPrompt includes the selected preset's medium/color_palette seed text, the scene count, the idea, and the character description", () => {
  const preset = STYLE_PRESETS["soft-hand-painted-2d"];
  const prompt = buildStoryPrompt({
    idea: "UNIQUE_IDEA_MARKER about a lonely lighthouse keeper",
    characterDescription: "UNIQUE_CHARACTER_MARKER an old keeper with a grey beard",
    stylePresetId: "soft-hand-painted-2d",
    mood: "Calm",
    sceneCount: 6,
  });
  assert.ok(prompt.includes(preset.styleBibleSeed.medium), "missing style medium seed text");
  assert.ok(prompt.includes(preset.styleBibleSeed.color_palette), "missing style color_palette seed text");
  assert.ok(prompt.includes("6"), "missing requested scene count");
  assert.ok(prompt.includes("UNIQUE_IDEA_MARKER"), "missing the wife's idea text");
  assert.ok(prompt.includes("UNIQUE_CHARACTER_MARKER"), "missing the character description");
});

test("buildStoryPrompt throws on an unknown style preset id", () => {
  assert.throws(() =>
    buildStoryPrompt({
      idea: "an idea",
      characterDescription: "a character",
      stylePresetId: "not-a-real-preset",
      mood: "Calm",
      sceneCount: 5,
    }),
  );
});

// (d) The wife's free text lives in the content section, never concatenated
// into the instruction section -- checked by asserting the instruction text
// (the delimiter) appears before the idea text.
test("buildStoryPrompt places the wife's free text in the content section, after the instruction section", () => {
  const prompt = buildStoryPrompt({
    idea: "UNIQUE_IDEA_MARKER",
    characterDescription: "a character",
    stylePresetId: "soft-hand-painted-2d",
    mood: "Calm",
    sceneCount: 5,
  });
  const delimiterIndex = prompt.indexOf("WIFE'S STORY IDEA");
  const ideaIndex = prompt.indexOf("UNIQUE_IDEA_MARKER");
  assert.ok(delimiterIndex > -1, "content-section delimiter not found");
  assert.ok(ideaIndex > delimiterIndex, "idea text must appear after the delimiter, not before it");
});

// (e) 06-02 Task 1: a three-line guard against a future edit silently
// setting one of provider-timeouts.ts's constants to 0 or a non-finite
// value, which the SDK treats as "no timeout" -- reopening the exact
// unbounded-hang gap this module exists to close. This module has no test
// file of its own (a leaf constants module doesn't warrant a new entry in
// test:lib); this guard lives here instead.
test("every provider HTTP timeout constant is a finite integer greater than zero", () => {
  for (const value of [LLM_HTTP_TIMEOUT_MS, IMAGE_HTTP_TIMEOUT_MS, VIDEO_HTTP_TIMEOUT_MS]) {
    assert.ok(Number.isFinite(value) && value > 0, `expected a finite positive timeout, got ${value}`);
  }
});

// (f) 06-02 Task 3: plainLanguageStoryBlockMessage's selector, tested as a
// pure function (does NOT call runStoryDirector -- that dispatches real
// work per this task's own scope note).

test('plainLanguageStoryBlockMessage returns STORY_CUT_SHORT_MESSAGE for a MAX_TOKENS blockReason, regardless of blockStage', () => {
  assert.equal(
    plainLanguageStoryBlockMessage({ blockReason: "MAX_TOKENS", blockStage: "candidate" }),
    STORY_CUT_SHORT_MESSAGE,
  );
});

test('plainLanguageStoryBlockMessage returns STORY_REPHRASE_MESSAGE for a "prompt" stage block', () => {
  assert.equal(
    plainLanguageStoryBlockMessage({ blockStage: "prompt", blockReason: "SAFETY" }),
    STORY_REPHRASE_MESSAGE,
  );
});

test('plainLanguageStoryBlockMessage returns STORY_TRY_AGAIN_MESSAGE for a "candidate" stage block other than MAX_TOKENS', () => {
  assert.equal(
    plainLanguageStoryBlockMessage({ blockStage: "candidate", blockReason: "NO_TEXT_IN_RESPONSE" }),
    STORY_TRY_AGAIN_MESSAGE,
  );
});

test('plainLanguageStoryBlockMessage returns STORY_TRY_AGAIN_MESSAGE for a "parse" stage block', () => {
  assert.equal(
    plainLanguageStoryBlockMessage({ blockStage: "parse", blockReason: "JSON.parse failed" }),
    STORY_TRY_AGAIN_MESSAGE,
  );
});

test("plainLanguageStoryBlockMessage returns STORY_TRY_AGAIN_MESSAGE for an unclassified block", () => {
  assert.equal(plainLanguageStoryBlockMessage({}), STORY_TRY_AGAIN_MESSAGE);
});

test("none of the three story block message constants leak provider/API terminology", () => {
  const forbidden = ["gemini", "finishreason", "promptfeedback", "json", "model"];
  for (const message of [STORY_CUT_SHORT_MESSAGE, STORY_REPHRASE_MESSAGE, STORY_TRY_AGAIN_MESSAGE]) {
    const lowered = message.toLowerCase();
    for (const term of forbidden) {
      assert.ok(!lowered.includes(term), `"${message}" unexpectedly contains forbidden substring "${term}"`);
    }
  }
});
