import { test } from "node:test";
import assert from "node:assert/strict";

import { STYLE_PRESETS, MOOD_OPTIONS, type StylePreset } from "./styles.ts";

const EXPECTED_STYLE_IDS = [
  "soft-hand-painted-2d",
  "watercolor-storybook",
  "early-90s-hand-drawn",
  "cinematic-2d",
  "cute-childrens-animation",
  "dreamy-fantasy",
];

const STYLE_BIBLE_FIELDS = [
  "medium",
  "line_style",
  "color_palette",
  "lighting",
  "texture",
  "character_rendering",
  "background_rendering",
  "animation_characteristics",
  "camera_language",
] as const;

// Lowercased studio/franchise/living-artist proper nouns that must never
// appear anywhere in a preset's concatenated seed text (docs/original-brief.md §9).
const FORBIDDEN_SIGNATURE_TERMS = [
  "disney",
  "pixar",
  "ghibli",
  "miyazaki",
  "dreamworks",
  "cartoon network",
  "nickelodeon",
  "warner bros",
  "looney tunes",
  "sanrio",
  "hanna-barbera",
  "aardman",
  "laika",
  "illumination entertainment",
  "studio ghibli",
];

function concatenatedSeedText(preset: StylePreset): string {
  return Object.values(preset.styleBibleSeed).join(" ").toLowerCase();
}

test("STYLE_PRESETS has exactly six entries and their keys match the six named ids", () => {
  const keys = Object.keys(STYLE_PRESETS).sort();
  assert.deepEqual(keys, [...EXPECTED_STYLE_IDS].sort());
  assert.equal(keys.length, 6);
});

test("every preset's id equals its key in the record", () => {
  for (const [key, preset] of Object.entries(STYLE_PRESETS)) {
    assert.equal(preset.id, key, `preset keyed "${key}" has id "${preset.id}"`);
  }
});

test("every preset has a non-empty label and all nine styleBibleSeed fields present and non-empty after trimming", () => {
  for (const [key, preset] of Object.entries(STYLE_PRESETS)) {
    assert.ok(preset.label.trim().length > 0, `preset "${key}" has an empty label`);
    for (const field of STYLE_BIBLE_FIELDS) {
      const value = preset.styleBibleSeed[field];
      assert.equal(typeof value, "string", `preset "${key}" field "${field}" is not a string`);
      assert.ok(value.trim().length > 0, `preset "${key}" field "${field}" is empty after trimming`);
    }
  }
});

test("no preset's concatenated seed text contains a forbidden studio/franchise/artist signature term", () => {
  for (const [key, preset] of Object.entries(STYLE_PRESETS)) {
    const text = concatenatedSeedText(preset);
    for (const term of FORBIDDEN_SIGNATURE_TERMS) {
      assert.ok(!text.includes(term), `preset "${key}" seed text contains forbidden term "${term}"`);
    }
  }
});

test("MOOD_OPTIONS is non-empty and every entry is a non-empty string", () => {
  assert.ok(MOOD_OPTIONS.length > 0);
  for (const mood of MOOD_OPTIONS) {
    assert.equal(typeof mood, "string");
    assert.ok(mood.trim().length > 0);
  }
});
