import { test } from "node:test";
import assert from "node:assert/strict";

import { sceneDir, sceneImagePath, sceneVideoPath, storyDir } from "./storage-paths.ts";

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
