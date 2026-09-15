import { test } from "node:test";
import assert from "node:assert/strict";

import {
  sceneDir,
  sceneImagePath,
  sceneVideoPath,
  storyDir,
  outputDir,
  outputClipPath,
  storyJsonPath,
  storyTextPath,
  characterReferencePath,
} from "./storage-paths.ts";

test("storyDir builds a path rooted at storage/stories for a valid slug", () => {
  assert.equal(storyDir("my-story-1"), "storage/stories/my-story-1");
});

test("sceneDir zero-pads scene 1 to 01", () => {
  assert.equal(sceneDir("my-story", 1), "storage/stories/my-story/scenes/01");
});

test("sceneDir zero-pads scene 9 to 09", () => {
  assert.equal(sceneDir("my-story", 9), "storage/stories/my-story/scenes/09");
});

test("sceneDir does not zero-pad scene 10 -- stays 10", () => {
  assert.equal(sceneDir("my-story", 10), "storage/stories/my-story/scenes/10");
});

for (const bad of [0, -1, -5, 1.5, 2.25, Number("not-a-number")]) {
  test(`sceneDir throws for an invalid scene number: ${bad}`, () => {
    assert.throws(() => sceneDir("my-story", bad));
  });
}

for (const badId of ["../escape", "a/b", "a\\b", "UPPERCASE", "has space", "trailing.dot", "", "..", "."]) {
  test(`storyDir throws for an invalid story id: ${JSON.stringify(badId)}`, () => {
    assert.throws(() => storyDir(badId));
  });
}

test("sceneDir also validates the story id before the scene number", () => {
  assert.throws(() => sceneDir("../escape", 1));
});

test("sceneImagePath uses the extension it is given (jpg)", () => {
  assert.equal(sceneImagePath("my-story", 2, "jpg"), "storage/stories/my-story/scenes/02/image.jpg");
});

test("sceneImagePath uses the extension it is given (webp)", () => {
  assert.equal(sceneImagePath("my-story", 3, "webp"), "storage/stories/my-story/scenes/03/image.webp");
});

test("sceneImagePath strips a leading dot from the given extension", () => {
  assert.equal(sceneImagePath("my-story", 1, ".png"), "storage/stories/my-story/scenes/01/image.png");
});

test("sceneVideoPath always ends in .mp4", () => {
  assert.equal(sceneVideoPath("my-story", 4), "storage/stories/my-story/scenes/04/video.mp4");
});

test("sceneImagePath throws for an invalid scene number", () => {
  assert.throws(() => sceneImagePath("my-story", 0, "png"));
});

test("sceneVideoPath throws for a story id containing a path separator", () => {
  assert.throws(() => sceneVideoPath("a/b", 1));
});

// --- §23 output layout (OUTPUT-01, OUTPUT-03) -----------------------------

test("outputClipPath zero-pads scene 1 to 01_scene.mp4", () => {
  assert.equal(outputClipPath("my-story", 1), "storage/stories/my-story/output/01_scene.mp4");
});

test("outputClipPath does not zero-pad scene 12 -- stays 12_scene.mp4", () => {
  assert.equal(outputClipPath("my-story", 12), "storage/stories/my-story/output/12_scene.mp4");
});

for (const bad of [0, -1, 1.5, Number("not-a-number")]) {
  test(`outputClipPath throws for an invalid scene number: ${bad}`, () => {
    assert.throws(() => outputClipPath("my-story", bad));
  });
}

for (const badId of ["../etc", "Story_A"]) {
  test(`outputDir throws for an invalid story id: ${JSON.stringify(badId)}`, () => {
    assert.throws(() => outputDir(badId));
  });

  test(`storyJsonPath throws for an invalid story id: ${JSON.stringify(badId)}`, () => {
    assert.throws(() => storyJsonPath(badId));
  });

  test(`storyTextPath throws for an invalid story id: ${JSON.stringify(badId)}`, () => {
    assert.throws(() => storyTextPath(badId));
  });
}

test("outputDir builds a path rooted at the story's own directory", () => {
  assert.equal(outputDir("my-story"), "storage/stories/my-story/output");
});

test("storyJsonPath builds story.json at the story's own root", () => {
  assert.equal(storyJsonPath("my-story"), "storage/stories/my-story/story.json");
});

test("storyTextPath builds story.txt at the story's own root", () => {
  assert.equal(storyTextPath("my-story"), "storage/stories/my-story/story.txt");
});

test("characterReferencePath accepts an extension with no leading dot", () => {
  assert.equal(characterReferencePath("my-story", "jpg"), "storage/stories/my-story/character-reference.jpg");
});

test("characterReferencePath accepts an extension with a leading dot identically", () => {
  assert.equal(characterReferencePath("my-story", ".jpg"), "storage/stories/my-story/character-reference.jpg");
});

test("characterReferencePath throws for an extension containing a path separator", () => {
  assert.throws(() => characterReferencePath("my-story", "j/pg"));
});

test("a lexicographic sort of clip names for scenes 1-12 equals ascending scene order (OUTPUT-03's mechanical proof)", () => {
  const sceneNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const ascendingNames = sceneNumbers.map((n) => outputClipPath("sort-story", n));

  const shuffled = [12, 3, 7, 1, 9, 2, 11, 4, 10, 6, 8, 5];
  const shuffledNames = shuffled.map((n) => outputClipPath("sort-story", n));

  const sorted = [...shuffledNames].sort();
  assert.deepEqual(sorted, ascendingNames);
});
