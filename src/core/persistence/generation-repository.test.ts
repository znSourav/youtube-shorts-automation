import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

import { createPrismaClient } from "../../lib/db.ts";
import { saveStoryWithScenes, findStoryWithScenes, UniquenessStatus } from "./story-repository.ts";
import {
  recordGeneration,
  recordGenerations,
  updateSceneImage,
  updateSceneVideo,
  GenerationType,
  SceneAssetStatus,
  type PendingGenerationRecord,
} from "./generation-repository.ts";
import type { StoryDirectorOutput } from "../story/schema.ts";

// Duplicated from src/lib/db.test.ts (plan 03-01) rather than extracted into
// a shared module -- db.test.ts is outside this plan's declared
// files_modified list, and this project has no existing shared-test-helper
// convention to extend into. See 03-03-SUMMARY.md for the tradeoff.
function findMigrationSql(): string {
  const migrationsDir = join(process.cwd(), "prisma", "migrations");
  const entries = readdirSync(migrationsDir, { withFileTypes: true });
  const migrationDir = entries.find((entry) => entry.isDirectory());
  if (!migrationDir) {
    throw new Error(`No migration directory found under ${migrationsDir}`);
  }
  const sqlPath = join(migrationsDir, migrationDir.name, "migration.sql");
  if (!existsSync(sqlPath)) {
    throw new Error(`No migration.sql found at ${sqlPath}`);
  }
  return readFileSync(sqlPath, "utf8");
}

function tmpDatabaseUrl(): string {
  const dir = mkdtempSync(join(tmpdir(), "prisma-test-"));
  const dbPath = join(dir, "test.db");
  const db = new Database(dbPath);
  db.exec(findMigrationSql());
  db.close();
  return `file:${dbPath}`;
}

function fixtureOutput(): StoryDirectorOutput {
  return {
    story: {
      title: "Generation Repository Test Story",
      premise: "p",
      story: "s",
      theme: "t",
      emotional_arc: "e",
      ending: "end",
      protagonist_want: "w",
      central_obstacle: "o",
      ending_shape: "es",
    },
    character_bible: {
      name: "Tester",
      appearance: "plain",
      hair: "short",
      clothing: "lab coat",
      distinguishing_features: "none",
    },
    style_bible: {
      medium: "2D animation",
      color_palette: "grayscale",
      character_rendering: "flat",
    },
    scenes: [
      { scene_number: 1, duration: 4, story_purpose: "one", image_prompt: "p1", motion_prompt: "m1" },
      { scene_number: 2, duration: 6, story_purpose: "two", image_prompt: "p2", motion_prompt: "m2" },
      { scene_number: 3, duration: 8, story_purpose: "three", image_prompt: "p3", motion_prompt: "m3" },
    ],
  };
}

async function seedStory(storyId: string, url: string): Promise<void> {
  const client = createPrismaClient(url);
  try {
    await saveStoryWithScenes(storyId, fixtureOutput(), UniquenessStatus.ACCEPTED, 0, client);
  } finally {
    await client.$disconnect();
  }
}

/** Counts console.error calls made during `fn`, without printing them. */
async function countConsoleErrors(fn: () => Promise<void>): Promise<number> {
  const original = console.error;
  let count = 0;
  console.error = (() => {
    count += 1;
  }) as typeof console.error;
  try {
    await fn();
  } finally {
    console.error = original;
  }
  return count;
}

test("updateSceneImage sets the path and the ready status, readable by a second independently-constructed client", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-genrepo-image";
  await seedStory(storyId, url);

  const writer = createPrismaClient(url);
  try {
    await updateSceneImage(
      storyId,
      1,
      "storage/stories/story-genrepo-image/scenes/01/image.jpg",
      SceneAssetStatus.READY,
      writer,
    );
  } finally {
    await writer.$disconnect();
  }

  const reader = createPrismaClient(url);
  try {
    const story = await findStoryWithScenes(storyId, reader);
    const scene1 = story!.scenes.find((s) => s.sceneNumber === 1)!;
    assert.equal(scene1.imagePath, "storage/stories/story-genrepo-image/scenes/01/image.jpg");
    assert.equal(scene1.imageStatus, "READY");
    // Other scenes untouched.
    const scene2 = story!.scenes.find((s) => s.sceneNumber === 2)!;
    assert.equal(scene2.imagePath, null);
    assert.equal(scene2.imageStatus, "WAITING");
  } finally {
    await reader.$disconnect();
  }
});

test("recordGeneration creates a row whose estimated cost is non-null and equal to what was passed (IMAGE-03)", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-genrepo-cost";
  await seedStory(storyId, url);

  const client = createPrismaClient(url);
  try {
    const record: PendingGenerationRecord = {
      generationType: GenerationType.IMAGE,
      model: "gemini-3.1-flash-image",
      estimatedUsd: 0.067,
      actualUsd: null,
      billed: true,
      ok: true,
      message: "Image generated.",
    };
    await recordGeneration(storyId, record, 1, client);

    const rows = await client.generationRecord.findMany({ where: { storyId } });
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].estimatedUsd, null);
    assert.equal(rows[0].estimatedUsd, 0.067);
    assert.equal(rows[0].generationType, "IMAGE");
    assert.equal(rows[0].sceneId !== null, true, "expected the scene number to have resolved to a real sceneId");
  } finally {
    await client.$disconnect();
  }
});

test("recordGenerations attaches every flushed record to the given story id", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-genrepo-flush";
  await seedStory(storyId, url);

  const client = createPrismaClient(url);
  try {
    const records: PendingGenerationRecord[] = [
      {
        generationType: GenerationType.STORY,
        model: "gemini-3.1-pro-preview",
        estimatedUsd: 0.05,
        actualUsd: null,
        billed: true,
        ok: true,
        message: "Story generated.",
      },
      {
        generationType: GenerationType.UNIQUENESS_CHECK,
        model: "gemini-3.8-flash",
        estimatedUsd: 0.01,
        actualUsd: null,
        billed: true,
        ok: true,
        message: "Uniqueness comparison completed.",
      },
    ];
    await recordGenerations(storyId, records, client);

    const rows = await client.generationRecord.findMany({ where: { storyId } });
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((r) => r.generationType).sort(),
      ["STORY", "UNIQUENESS_CHECK"],
    );
    assert.ok(rows.every((r) => r.sceneId === null), "story-level records must carry no sceneId");
  } finally {
    await client.$disconnect();
  }
});

test("a scene number with no row logs exactly once and returns without throwing, leaving the other scenes untouched", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-genrepo-missing-scene";
  await seedStory(storyId, url);

  const client = createPrismaClient(url);
  try {
    const errorCount = await countConsoleErrors(() =>
      updateSceneImage(
        storyId,
        99,
        "storage/stories/story-genrepo-missing-scene/scenes/99/image.jpg",
        SceneAssetStatus.READY,
        client,
      ),
    );
    assert.equal(errorCount, 1, "expected exactly one log line");

    const story = await findStoryWithScenes(storyId, client);
    for (const scene of story!.scenes) {
      assert.equal(scene.imageStatus, "WAITING");
      assert.equal(scene.imagePath, null);
    }
  } finally {
    await client.$disconnect();
  }
});

test("recordGeneration against a nonexistent story logs exactly once and returns without throwing", async () => {
  const url = tmpDatabaseUrl();
  const client = createPrismaClient(url);
  try {
    const record: PendingGenerationRecord = {
      generationType: GenerationType.STORY,
      model: "gemini-3.1-pro-preview",
      estimatedUsd: 0.05,
      actualUsd: null,
      billed: true,
      ok: true,
      message: "Story generated.",
    };
    const errorCount = await countConsoleErrors(() =>
      recordGeneration("story-does-not-exist", record, undefined, client),
    );
    assert.equal(errorCount, 1);
  } finally {
    await client.$disconnect();
  }
});

test("updateSceneVideo followed by a fresh client read returns the video status and path (VIDEO-03's database half)", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-genrepo-video";
  await seedStory(storyId, url);

  const writer = createPrismaClient(url);
  try {
    await updateSceneVideo(
      storyId,
      1,
      "storage/stories/story-genrepo-video/scenes/01/video.mp4",
      SceneAssetStatus.READY,
      writer,
    );
  } finally {
    await writer.$disconnect();
  }

  const reader = createPrismaClient(url);
  try {
    const story = await findStoryWithScenes(storyId, reader);
    const scene1 = story!.scenes.find((s) => s.sceneNumber === 1)!;
    assert.equal(scene1.videoStatus, "READY");
    assert.equal(scene1.videoPath, "storage/stories/story-genrepo-video/scenes/01/video.mp4");
  } finally {
    await reader.$disconnect();
  }
});
