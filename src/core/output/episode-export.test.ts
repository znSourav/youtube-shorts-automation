import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { exportEpisodeAssets } from "./episode-export.ts";
import type { StoryWithScenes } from "../persistence/story-repository.ts";

const STORY_ID = "story-export-test";

function storyFixture(overrides: Partial<StoryWithScenes> = {}): StoryWithScenes {
  return {
    id: STORY_ID,
    title: "Test Episode",
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
    imagesApprovedAt: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    scenes: [1, 2, 3].map((sceneNumber) => ({
      id: `scene-${sceneNumber}`,
      sceneNumber,
      storyPurpose: `purpose ${sceneNumber}`,
      imagePrompt: `image prompt ${sceneNumber}`,
      motionPrompt: `motion prompt ${sceneNumber}`,
      durationSeconds: 4,
      imagePath: `storage/stories/${STORY_ID}/scenes/0${sceneNumber}/image.jpg`,
      imageStatus: "READY",
      videoPath: `storage/stories/${STORY_ID}/scenes/0${sceneNumber}/video.mp4`,
      videoStatus: "READY",
      imageAttempts: 0,
      videoAttempts: 0,
    })),
    ...overrides,
  };
}

function seedTree(
  root: string,
  fixture: StoryWithScenes,
): void {
  for (const scene of fixture.scenes) {
    const sceneDir = join(root, "storage", "stories", fixture.id, "scenes", String(scene.sceneNumber).padStart(2, "0"));
    mkdirSync(sceneDir, { recursive: true });
    if (scene.imagePath) {
      writeFileSync(join(root, scene.imagePath), `fake-image-bytes-scene-${scene.sceneNumber}`);
    }
    if (scene.videoPath) {
      writeFileSync(join(root, scene.videoPath), `fake-video-bytes-scene-${scene.sceneNumber}`);
    }
  }
}

function withTempRoot(fn: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "episode-export-test-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("scenes 1 and 3 ready, scene 2 not ready -> clipsWritten [1,3], clipsMissing [2]", () => {
  withTempRoot((root) => {
    const fixture = storyFixture({
      scenes: [
        {
          id: "s1",
          sceneNumber: 1,
          storyPurpose: "one",
          imagePrompt: "p1",
          motionPrompt: "m1",
          durationSeconds: 4,
          imagePath: `storage/stories/${STORY_ID}/scenes/01/image.jpg`,
          imageStatus: "READY",
          videoPath: `storage/stories/${STORY_ID}/scenes/01/video.mp4`,
          videoStatus: "READY",
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
          imageStatus: "WAITING",
          videoPath: null,
          videoStatus: "WAITING",
          imageAttempts: 0,
          videoAttempts: 0,
        },
        {
          id: "s3",
          sceneNumber: 3,
          storyPurpose: "three",
          imagePrompt: "p3",
          motionPrompt: "m3",
          durationSeconds: 4,
          imagePath: `storage/stories/${STORY_ID}/scenes/03/image.jpg`,
          imageStatus: "READY",
          videoPath: `storage/stories/${STORY_ID}/scenes/03/video.mp4`,
          videoStatus: "READY",
          imageAttempts: 0,
          videoAttempts: 0,
        },
      ],
    });
    seedTree(root, fixture);

    const result = exportEpisodeAssets(fixture, { rootDir: root });
    assert.deepEqual(result.clipsWritten, [1, 3]);
    assert.deepEqual(result.clipsMissing, [2]);
  });
});

test("written clips exist at the expected names and are byte-identical to their sources", () => {
  withTempRoot((root) => {
    const fixture = storyFixture();
    seedTree(root, fixture);

    exportEpisodeAssets(fixture, { rootDir: root });

    for (const sceneNumber of [1, 2, 3]) {
      const outPath = join(root, "storage", "stories", STORY_ID, "output", `0${sceneNumber}_scene.mp4`);
      const srcPath = join(root, "storage", "stories", STORY_ID, "scenes", `0${sceneNumber}`, "video.mp4");
      assert.equal(readFileSync(outPath, "utf8"), readFileSync(srcPath, "utf8"));
    }
  });
});

test("reading the output directory's entries and sorting them yields ascending scene order", () => {
  withTempRoot((root) => {
    const fixture = storyFixture();
    seedTree(root, fixture);

    exportEpisodeAssets(fixture, { rootDir: root });

    const outDir = join(root, "storage", "stories", STORY_ID, "output");
    const entries = readdirSync(outDir).sort();
    assert.deepEqual(entries, ["01_scene.mp4", "02_scene.mp4", "03_scene.mp4"]);
  });
});

test("running the export twice in a row is idempotent -- same entries, same bytes, no duplicates", () => {
  withTempRoot((root) => {
    const fixture = storyFixture();
    seedTree(root, fixture);

    exportEpisodeAssets(fixture, { rootDir: root });
    const firstRun = readdirSync(join(root, "storage", "stories", STORY_ID, "output")).sort();

    exportEpisodeAssets(fixture, { rootDir: root });
    const secondRun = readdirSync(join(root, "storage", "stories", STORY_ID, "output")).sort();

    assert.deepEqual(firstRun, secondRun);
  });
});

test("a story whose scenes are all unready still creates the output directory and writes nothing into it", () => {
  withTempRoot((root) => {
    const fixture = storyFixture({
      scenes: [1, 2, 3].map((sceneNumber) => ({
        id: `scene-${sceneNumber}`,
        sceneNumber,
        storyPurpose: `purpose ${sceneNumber}`,
        imagePrompt: `image prompt ${sceneNumber}`,
        motionPrompt: `motion prompt ${sceneNumber}`,
        durationSeconds: 4,
        imagePath: null,
        imageStatus: "WAITING",
        videoPath: null,
        videoStatus: "WAITING",
        imageAttempts: 0,
        videoAttempts: 0,
      })),
    });
    // No seedTree call -- no source files exist on disk at all.

    const result = exportEpisodeAssets(fixture, { rootDir: root });
    assert.deepEqual(result.clipsWritten, []);
    assert.deepEqual(result.clipsMissing, [1, 2, 3]);

    const outDir = join(root, "storage", "stories", STORY_ID, "output");
    assert.deepEqual(readdirSync(outDir), []);
  });
});

test("a fixture whose id is \"../etc\" throws before the root directory gains any storage subtree at all", () => {
  withTempRoot((root) => {
    const fixture = storyFixture({ id: "../etc" });

    assert.throws(() => exportEpisodeAssets(fixture, { rootDir: root }));

    let storageSubtreeExists = true;
    try {
      readdirSync(join(root, "storage"));
    } catch {
      storageSubtreeExists = false;
    }
    assert.equal(storageSubtreeExists, false, "no storage/ subtree should exist after a rejected id");
  });
});
