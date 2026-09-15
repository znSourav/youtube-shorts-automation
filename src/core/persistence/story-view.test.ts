import { test } from "node:test";
import assert from "node:assert/strict";

import { toLoadedStory, computeLibraryStatus, toLibraryRow, type LibrarySceneSummary } from "./story-view.ts";
import type { StoryWithScenes, LibraryStorySource } from "./story-repository.ts";

const MAX_ATTEMPTS = 3;

function sceneSummary(overrides: Partial<LibrarySceneSummary> = {}): LibrarySceneSummary {
  return {
    imageStatus: "READY",
    videoStatus: "WAITING",
    videoAttempts: 0,
    ...overrides,
  };
}

// Hand-built row fixtures only -- no database, no filesystem (story-view.ts
// is a pure mapper).
function fixtureRow(overrides: Partial<StoryWithScenes> = {}): StoryWithScenes {
  return {
    id: "story-view-test",
    title: "Test Story",
    premise: "a fixture premise",
    fullStory: "a fixture story body",
    theme: "a fixture theme",
    emotionalArc: "a fixture arc",
    ending: "a fixture ending",
    protagonistWant: "a character wants something",
    centralObstacle: "an obstacle stands in the way",
    endingShape: "quiet satisfaction",
    characterBible: {
      name: "Tester",
      appearance: "plain",
      hair: "short",
      clothing: "lab coat",
      distinguishing_features: "none",
    },
    styleBible: {
      medium: "2D animation",
      color_palette: "pastel",
      character_rendering: "flat cel shading",
    },
    uniquenessStatus: "ACCEPTED" as StoryWithScenes["uniquenessStatus"],
    regenerationAttempt: 0,
    imagesApprovedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    scenes: [
      {
        id: "scene-1",
        sceneNumber: 1,
        storyPurpose: "one",
        imagePrompt: "p1",
        motionPrompt: "m1",
        durationSeconds: 4,
        imagePath: null,
        imageStatus: "WAITING",
        videoPath: null,
        videoStatus: "WAITING",
        imageAttempts: 0,
        videoAttempts: 0,
      },
    ],
    ...overrides,
  };
}

test("three scenes supplied out of order come back ordered 1, 2, 3", () => {
  const row = fixtureRow({
    scenes: [
      {
        id: "s3",
        sceneNumber: 3,
        storyPurpose: "three",
        imagePrompt: "p3",
        motionPrompt: "m3",
        durationSeconds: 8,
        imagePath: null,
        imageStatus: "WAITING",
        videoPath: null,
        videoStatus: "WAITING",
        imageAttempts: 0,
        videoAttempts: 0,
      },
      {
        id: "s1",
        sceneNumber: 1,
        storyPurpose: "one",
        imagePrompt: "p1",
        motionPrompt: "m1",
        durationSeconds: 4,
        imagePath: null,
        imageStatus: "WAITING",
        videoPath: null,
        videoStatus: "WAITING",
        imageAttempts: 0,
        videoAttempts: 0,
      },
      {
        id: "s2",
        sceneNumber: 2,
        storyPurpose: "two",
        imagePrompt: "p2",
        motionPrompt: "m2",
        durationSeconds: 6,
        imagePath: null,
        imageStatus: "WAITING",
        videoPath: null,
        videoStatus: "WAITING",
        imageAttempts: 0,
        videoAttempts: 0,
      },
    ],
  });

  const loaded = toLoadedStory(row);

  assert.deepEqual(
    loaded.scenes.map((s) => s.sceneNumber),
    [1, 2, 3],
  );
  assert.deepEqual(
    loaded.data.scenes.map((s) => s.scene_number),
    [1, 2, 3],
  );
});

test("the fully serialised payload contains no occurrence of the storage root directory name", () => {
  const row = fixtureRow({
    scenes: [
      {
        id: "s1",
        sceneNumber: 1,
        storyPurpose: "one",
        imagePrompt: "p1",
        motionPrompt: "m1",
        durationSeconds: 4,
        imagePath: "storage/stories/story-view-test/scenes/01/image.jpg",
        imageStatus: "READY",
        videoPath: "storage/stories/story-view-test/scenes/01/video.mp4",
        videoStatus: "READY",
        imageAttempts: 0,
        videoAttempts: 0,
      },
    ],
  });

  const loaded = toLoadedStory(row);
  const serialized = JSON.stringify(loaded);

  assert.ok(
    !serialized.includes("storage/stories"),
    "the serialised restore payload must never contain the storage root directory name",
  );
});

test("a ready image status maps to ready and a failed one maps to failed", () => {
  const row = fixtureRow({
    scenes: [
      {
        id: "s1",
        sceneNumber: 1,
        storyPurpose: "one",
        imagePrompt: "p1",
        motionPrompt: "m1",
        durationSeconds: 4,
        imagePath: "x",
        imageStatus: "READY",
        videoPath: null,
        videoStatus: "WAITING",
        imageAttempts: 0,
        videoAttempts: 0,
      },
      {
        id: "s2",
        sceneNumber: 2,
        storyPurpose: "two",
        imagePrompt: "p2",
        motionPrompt: "m2",
        durationSeconds: 4,
        imagePath: null,
        imageStatus: "FAILED",
        videoPath: null,
        videoStatus: "WAITING",
        imageAttempts: 0,
        videoAttempts: 0,
      },
    ],
  });

  const loaded = toLoadedStory(row);
  assert.equal(loaded.scenes.find((s) => s.sceneNumber === 1)?.imageStatus, "READY");
  assert.equal(loaded.scenes.find((s) => s.sceneNumber === 2)?.imageStatus, "FAILED");
});

test("the character and style bibles round-trip out of their Json columns into the shape the review screen consumes", () => {
  const row = fixtureRow();
  const loaded = toLoadedStory(row);
  assert.deepEqual(loaded.data.character_bible, row.characterBible);
  assert.deepEqual(loaded.data.style_bible, row.styleBible);
  assert.equal(loaded.data.story.title, row.title);
  assert.equal(loaded.storyId, row.id);
});

// --- computeLibraryStatus (LIBRARY-01) -------------------------------------

test("all videos ready gives Complete", () => {
  const scenes = [sceneSummary({ videoStatus: "READY" }), sceneSummary({ videoStatus: "READY" })];
  assert.equal(computeLibraryStatus(new Date(), scenes, MAX_ATTEMPTS), "Complete");
});

test("one scene failed at the cap with a second scene generating gives Generating Videos, not Needs Attention", () => {
  const scenes = [
    sceneSummary({ videoStatus: "FAILED", videoAttempts: MAX_ATTEMPTS }),
    sceneSummary({ videoStatus: "GENERATING" }),
  ];
  assert.equal(computeLibraryStatus(new Date(), scenes, MAX_ATTEMPTS), "Generating Videos");
});

test("one scene failed at the cap with nothing generating gives Needs Attention", () => {
  const scenes = [
    sceneSummary({ videoStatus: "FAILED", videoAttempts: MAX_ATTEMPTS }),
    sceneSummary({ videoStatus: "READY" }),
  ];
  assert.equal(computeLibraryStatus(new Date(), scenes, MAX_ATTEMPTS), "Needs Attention");
});

test("one scene failed but below the cap with approval set gives Generating Videos", () => {
  const scenes = [
    sceneSummary({ videoStatus: "FAILED", videoAttempts: MAX_ATTEMPTS - 1 }),
    sceneSummary({ videoStatus: "WAITING" }),
  ];
  assert.equal(computeLibraryStatus(new Date(), scenes, MAX_ATTEMPTS), "Generating Videos");
});

test("approval set with every scene waiting gives Generating Videos", () => {
  const scenes = [sceneSummary({ videoStatus: "WAITING" }), sceneSummary({ videoStatus: "WAITING" })];
  assert.equal(computeLibraryStatus(new Date(), scenes, MAX_ATTEMPTS), "Generating Videos");
});

test("approval null with every image ready gives Ready to Approve", () => {
  const scenes = [sceneSummary({ imageStatus: "READY" }), sceneSummary({ imageStatus: "READY" })];
  assert.equal(computeLibraryStatus(null, scenes, MAX_ATTEMPTS), "Ready to Approve");
});

test("approval null with one image waiting gives Draft", () => {
  const scenes = [sceneSummary({ imageStatus: "READY" }), sceneSummary({ imageStatus: "WAITING" })];
  assert.equal(computeLibraryStatus(null, scenes, MAX_ATTEMPTS), "Draft");
});

test("an empty scene array gives Draft", () => {
  assert.equal(computeLibraryStatus(null, [], MAX_ATTEMPTS), "Draft");
});

// --- toLibraryRow -----------------------------------------------------------

function librarySourceFixture(overrides: Partial<LibraryStorySource> = {}): LibraryStorySource {
  return {
    id: "story-library-test",
    title: "Library Test Story",
    createdAt: new Date("2026-02-01T00:00:00Z"),
    imagesApprovedAt: null,
    scenes: [sceneSummary(), sceneSummary()],
    ...overrides,
  };
}

test("toLibraryRow's sceneCount equals the scenes array length", () => {
  const row = librarySourceFixture({ scenes: [sceneSummary(), sceneSummary(), sceneSummary()] });
  const result = toLibraryRow(row, MAX_ATTEMPTS);
  assert.equal(result.sceneCount, 3);
});

test("toLibraryRow's createdAt is a string that round-trips through new Date(...) to the original instant", () => {
  const original = new Date("2026-02-01T12:34:56Z");
  const row = librarySourceFixture({ createdAt: original });
  const result = toLibraryRow(row, MAX_ATTEMPTS);
  assert.equal(typeof result.createdAt, "string");
  assert.equal(new Date(result.createdAt).getTime(), original.getTime());
});

test("toLibraryRow's returned object carries no key name that matches /path/i", () => {
  const row = librarySourceFixture();
  const result = toLibraryRow(row, MAX_ATTEMPTS);
  for (const key of Object.keys(result)) {
    assert.ok(!/path/i.test(key), `key "${key}" should not match /path/i`);
  }
});
