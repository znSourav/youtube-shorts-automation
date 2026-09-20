import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { exportEpisodeAssets, buildStoryJson, buildStoryText } from "./episode-export.ts";
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
      videoGeneratingSince: null,
      videoSaveCorrupted: false,
      imageSaveCorrupted: false,
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
          videoGeneratingSince: null,
          videoSaveCorrupted: false,
          imageSaveCorrupted: false,
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
          videoGeneratingSince: null,
          videoSaveCorrupted: false,
          imageSaveCorrupted: false,
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
          videoGeneratingSince: null,
          videoSaveCorrupted: false,
          imageSaveCorrupted: false,
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
        videoGeneratingSince: null,
        videoSaveCorrupted: false,
        imageSaveCorrupted: false,
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

test("a story that already recorded a real video path but whose directory is gone reports folderMissing and writes nothing", () => {
  withTempRoot((root) => {
    const fixture = storyFixture();
    // Deliberately no seedTree call -- the story's own directory (and every
    // scene subdirectory under it) never exists in this temp root, matching
    // a folder renamed or moved away outside the app.

    const result = exportEpisodeAssets(fixture, { rootDir: root });

    assert.equal(result.folderMissing, true);
    assert.deepEqual(result.clipsWritten, []);
    assert.deepEqual(result.clipsMissing, []);
    assert.deepEqual(result.documentsWritten, []);

    let storageSubtreeExists = true;
    try {
      readdirSync(join(root, "storage"));
    } catch {
      storageSubtreeExists = false;
    }
    assert.equal(storageSubtreeExists, false, "nothing should be created when the folder is missing");
  });
});

test("a story with no recorded asset path yet still creates its directory when it doesn't exist (first export, not a lost folder)", () => {
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
        videoGeneratingSince: null,
        videoSaveCorrupted: false,
        imageSaveCorrupted: false,
      })),
    });
    // No seedTree call, same as "a story whose scenes are all unready" above
    // -- this must still succeed, since nothing has ever been recorded to lose.

    const result = exportEpisodeAssets(fixture, { rootDir: root });
    assert.equal(result.folderMissing, false);
    assert.deepEqual(result.documentsWritten.sort(), ["story.json", "story.txt"]);
  });
});

// --- Task 2: story.json, story.txt, character reference, stale-clip hygiene

test("buildStoryJson parses as JSON, carries the title, exposes scenes in ascending order, and carries the created date as a string", () => {
  const fixture = storyFixture({
    scenes: [3, 1, 2].map((sceneNumber) => ({
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
      videoGeneratingSince: null,
      videoSaveCorrupted: false,
      imageSaveCorrupted: false,
    })),
  });

  const json = buildStoryJson(fixture);
  const parsed = JSON.parse(json);

  assert.equal(parsed.title, "Test Episode");
  assert.deepEqual(
    parsed.scenes.map((s: { scene_number: number }) => s.scene_number),
    [1, 2, 3],
  );
  assert.equal(typeof parsed.created_at, "string");
});

test("buildStoryText contains the title and the full story text", () => {
  const fixture = storyFixture();
  const text = buildStoryText(fixture);

  assert.ok(text.includes("Test Episode"));
  assert.ok(text.includes("a fixture story body"));
});

test("the export writes story.json, story.txt, and character-reference.jpg, and documentsWritten names all three", () => {
  withTempRoot((root) => {
    const fixture = storyFixture();
    seedTree(root, fixture);

    const result = exportEpisodeAssets(fixture, { rootDir: root });

    assert.ok(result.documentsWritten.includes("story.json"));
    assert.ok(result.documentsWritten.includes("story.txt"));
    assert.ok(result.documentsWritten.includes("character-reference.jpg"));

    const storyRoot = join(root, "storage", "stories", STORY_ID);
    assert.ok(readFileSync(join(storyRoot, "story.json"), "utf8").length > 0);
    assert.ok(readFileSync(join(storyRoot, "story.txt"), "utf8").length > 0);
    assert.ok(readFileSync(join(storyRoot, "character-reference.jpg"), "utf8").length > 0);
  });
});

test("the character reference is byte-identical to scene 1's image", () => {
  withTempRoot((root) => {
    const fixture = storyFixture();
    seedTree(root, fixture);

    exportEpisodeAssets(fixture, { rootDir: root });

    const storyRoot = join(root, "storage", "stories", STORY_ID);
    const reference = readFileSync(join(storyRoot, "character-reference.jpg"), "utf8");
    const scene1Image = readFileSync(join(storyRoot, "scenes", "01", "image.jpg"), "utf8");
    assert.equal(reference, scene1Image);
  });
});

test("a fixture whose every scene image is unready writes no character reference and reports only the two documents", () => {
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
        videoGeneratingSince: null,
        videoSaveCorrupted: false,
        imageSaveCorrupted: false,
      })),
    });

    const result = exportEpisodeAssets(fixture, { rootDir: root });

    assert.deepEqual(result.documentsWritten.sort(), ["story.json", "story.txt"]);
  });
});

test("a scene that stops being ready loses its stale clip on the next export, and every other clip stays byte-identical", () => {
  withTempRoot((root) => {
    const readyFixture = storyFixture();
    seedTree(root, readyFixture);

    exportEpisodeAssets(readyFixture, { rootDir: root });

    const outDir = join(root, "storage", "stories", STORY_ID, "output");
    assert.deepEqual(readdirSync(outDir).sort(), ["01_scene.mp4", "02_scene.mp4", "03_scene.mp4"]);
    const bytesBefore = {
      1: readFileSync(join(outDir, "01_scene.mp4"), "utf8"),
      3: readFileSync(join(outDir, "03_scene.mp4"), "utf8"),
    };

    // Re-export with scene 2 now marked FAILED (its video is no longer ready).
    const degradedFixture = storyFixture({
      scenes: readyFixture.scenes.map((scene) =>
        scene.sceneNumber === 2 ? { ...scene, videoStatus: "FAILED", videoPath: null } : scene,
      ),
    });
    exportEpisodeAssets(degradedFixture, { rootDir: root });

    const entriesAfter = readdirSync(outDir).sort();
    assert.deepEqual(entriesAfter, ["01_scene.mp4", "03_scene.mp4"]);
    assert.equal(readFileSync(join(outDir, "01_scene.mp4"), "utf8"), bytesBefore[1]);
    assert.equal(readFileSync(join(outDir, "03_scene.mp4"), "utf8"), bytesBefore[3]);
  });
});
