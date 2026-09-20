import { test } from "node:test";
import assert from "node:assert/strict";

import { createPrismaClient } from "../../lib/db.ts";
import { saveStoryWithScenes, findStoryWithScenes, markImagesApproved, UniquenessStatus } from "./story-repository.ts";
import {
  recordGeneration,
  recordGenerations,
  recordGenerationAtDispatch,
  attachGenerationRecordsToStory,
  updateSceneImage,
  updateSceneVideo,
  incrementImageAttempt,
  incrementVideoAttempt,
  setVideoSaveCorrupted,
  clearVideoSaveCorrupted,
  setImageSaveCorrupted,
  clearImageSaveCorrupted,
  GenerationType,
  SceneAssetStatus,
  type PendingGenerationRecord,
} from "./generation-repository.ts";
import type { StoryDirectorOutput } from "../story/schema.ts";
import { tmpDatabaseUrl } from "../../lib/test-db.ts";

// tmpDatabaseUrl() (src/lib/test-db.ts, plan 04-01 Task 2) supersedes this
// file's former private findMigrationSql()/tmpDatabaseUrl() duplicate of
// db.test.ts's own helper (03-03-SUMMARY.md's recorded tradeoff) -- it
// applies EVERY migration directory, not just the first, which matters now
// that migration count is no longer one.

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

test("incrementVideoAttempt called twice against scene 1 leaves scene 1 at videoAttempts=2 while other scenes/imageAttempts stay untouched", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-genrepo-video-attempts";
  await seedStory(storyId, url);

  const client = createPrismaClient(url);
  try {
    await incrementVideoAttempt(storyId, 1, client);
    await incrementVideoAttempt(storyId, 1, client);

    const story = await findStoryWithScenes(storyId, client);
    const scene1 = story!.scenes.find((s) => s.sceneNumber === 1)!;
    assert.equal(scene1.videoAttempts, 2);
    assert.equal(scene1.imageAttempts, 0);

    const scene2 = story!.scenes.find((s) => s.sceneNumber === 2)!;
    const scene3 = story!.scenes.find((s) => s.sceneNumber === 3)!;
    assert.equal(scene2.videoAttempts, 0);
    assert.equal(scene3.videoAttempts, 0);
    for (const scene of story!.scenes) {
      assert.equal(scene.imageAttempts, 0);
    }
  } finally {
    await client.$disconnect();
  }
});

test("incrementImageAttempt against scene 2 leaves only scene 2's imageAttempts at 1 and touches no imagePath/imageStatus/videoPath/videoStatus", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-genrepo-image-attempts";
  await seedStory(storyId, url);

  const client = createPrismaClient(url);
  try {
    await incrementImageAttempt(storyId, 2, client);

    const story = await findStoryWithScenes(storyId, client);
    const scene2 = story!.scenes.find((s) => s.sceneNumber === 2)!;
    assert.equal(scene2.imageAttempts, 1);
    assert.equal(scene2.imagePath, null);
    assert.equal(scene2.imageStatus, "WAITING");
    assert.equal(scene2.videoPath, null);
    assert.equal(scene2.videoStatus, "WAITING");

    const scene1 = story!.scenes.find((s) => s.sceneNumber === 1)!;
    const scene3 = story!.scenes.find((s) => s.sceneNumber === 3)!;
    assert.equal(scene1.imageAttempts, 0);
    assert.equal(scene3.imageAttempts, 0);
  } finally {
    await client.$disconnect();
  }
});

// -- Phase 5 (plan 05-03): recordGenerationAtDispatch / attachGenerationRecordsToStory --

test("recordGenerationAtDispatch with a null story id creates a row with a null storyId and returns its id as a non-empty string", async () => {
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
    const id = await recordGenerationAtDispatch(record, null, undefined, client);
    assert.equal(typeof id, "string");
    assert.ok(id !== null && id.length > 0);

    const rows = await client.generationRecord.findMany({ where: { id: id as string } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].storyId, null);
  } finally {
    await client.$disconnect();
  }
});

test("recordGenerationAtDispatch with a real story id creates a row linked to that story", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-genrepo-dispatch-linked";
  await seedStory(storyId, url);

  const client = createPrismaClient(url);
  try {
    const record: PendingGenerationRecord = {
      generationType: GenerationType.UNIQUENESS_CHECK,
      model: "gemini-3.8-flash",
      estimatedUsd: 0.01,
      actualUsd: null,
      billed: true,
      ok: true,
      message: "Uniqueness comparison completed.",
    };
    const id = await recordGenerationAtDispatch(record, storyId, undefined, client);
    assert.ok(id !== null);

    const rows = await client.generationRecord.findMany({ where: { storyId } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, id);
  } finally {
    await client.$disconnect();
  }
});

test("recordGenerationAtDispatch returns null and logs exactly one console error when the write fails", async () => {
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
    let id: string | null = "not-yet-set";
    const errorCount = await countConsoleErrors(async () => {
      id = await recordGenerationAtDispatch(record, "story-does-not-exist", 1, client);
    });
    assert.equal(errorCount, 1, "expected exactly one log line");
    assert.equal(id, null);
  } finally {
    await client.$disconnect();
  }
});

test("attachGenerationRecordsToStory sets storyId on exactly the ids it is given and leaves other rows untouched", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-genrepo-attach";
  await seedStory(storyId, url);

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
    const idToLink = await recordGenerationAtDispatch(record, null, undefined, client);
    const idToLeaveAlone = await recordGenerationAtDispatch(record, null, undefined, client);
    assert.ok(idToLink !== null && idToLeaveAlone !== null);

    await attachGenerationRecordsToStory(storyId, [idToLink as string], client);

    const linkedRows = await client.generationRecord.findMany({ where: { id: idToLink as string } });
    assert.equal(linkedRows[0].storyId, storyId);

    const untouchedRows = await client.generationRecord.findMany({ where: { id: idToLeaveAlone as string } });
    assert.equal(untouchedRows[0].storyId, null);
  } finally {
    await client.$disconnect();
  }
});

test("attachGenerationRecordsToStory with an empty id array performs no write and does not throw", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-genrepo-attach-empty";
  await seedStory(storyId, url);

  const client = createPrismaClient(url);
  try {
    await attachGenerationRecordsToStory(storyId, [], client);
    const rows = await client.generationRecord.findMany({ where: { storyId } });
    assert.equal(rows.length, 0);
  } finally {
    await client.$disconnect();
  }
});

test("markImagesApproved sets a non-null imagesApprovedAt readable by a second independently-constructed client; a freshly seeded story reads null (regression guard for the first-migration-only bug)", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-genrepo-approved";
  await seedStory(storyId, url);

  const preApproval = createPrismaClient(url);
  try {
    const story = await findStoryWithScenes(storyId, preApproval);
    assert.equal(story!.imagesApprovedAt, null);
  } finally {
    await preApproval.$disconnect();
  }

  const writer = createPrismaClient(url);
  try {
    await markImagesApproved(storyId, writer);
  } finally {
    await writer.$disconnect();
  }

  const reader = createPrismaClient(url);
  try {
    const story = await findStoryWithScenes(storyId, reader);
    assert.notEqual(story!.imagesApprovedAt, null);
    assert.ok(story!.imagesApprovedAt instanceof Date);
  } finally {
    await reader.$disconnect();
  }
});

// -- Phase 6 (plan 06-03): videoGeneratingSince / videoSaveCorrupted / imageSaveCorrupted --

test("a freshly seeded scene defaults videoGeneratingSince to null and both corruption flags to false", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-genrepo-defaults";
  await seedStory(storyId, url);

  const client = createPrismaClient(url);
  try {
    const story = await findStoryWithScenes(storyId, client);
    for (const scene of story!.scenes) {
      assert.equal(scene.videoGeneratingSince, null);
      assert.equal(scene.videoSaveCorrupted, false);
      assert.equal(scene.imageSaveCorrupted, false);
    }
  } finally {
    await client.$disconnect();
  }
});

test("updateSceneVideo to GENERATING sets videoGeneratingSince to a non-null Date within a few seconds of now", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-genrepo-generating-since";
  await seedStory(storyId, url);

  const client = createPrismaClient(url);
  try {
    const before = Date.now();
    await updateSceneVideo(storyId, 1, null, SceneAssetStatus.GENERATING, client);
    const after = Date.now();

    const story = await findStoryWithScenes(storyId, client);
    const scene1 = story!.scenes.find((s) => s.sceneNumber === 1)!;
    assert.ok(scene1.videoGeneratingSince instanceof Date);
    const ts = scene1.videoGeneratingSince!.getTime();
    assert.ok(ts >= before - 1000 && ts <= after + 1000, "expected the timestamp to be close to now");
  } finally {
    await client.$disconnect();
  }
});

test("updateSceneVideo to READY clears videoGeneratingSince back to null", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-genrepo-generating-ready";
  await seedStory(storyId, url);

  const client = createPrismaClient(url);
  try {
    await updateSceneVideo(storyId, 1, null, SceneAssetStatus.GENERATING, client);
    await updateSceneVideo(
      storyId,
      1,
      "storage/stories/story-genrepo-generating-ready/scenes/01/video.mp4",
      SceneAssetStatus.READY,
      client,
    );

    const story = await findStoryWithScenes(storyId, client);
    const scene1 = story!.scenes.find((s) => s.sceneNumber === 1)!;
    assert.equal(scene1.videoGeneratingSince, null);
    assert.equal(scene1.videoStatus, "READY");
  } finally {
    await client.$disconnect();
  }
});

test("updateSceneVideo to FAILED clears videoGeneratingSince back to null", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-genrepo-generating-failed";
  await seedStory(storyId, url);

  const client = createPrismaClient(url);
  try {
    await updateSceneVideo(storyId, 1, null, SceneAssetStatus.GENERATING, client);
    await updateSceneVideo(storyId, 1, null, SceneAssetStatus.FAILED, client);

    const story = await findStoryWithScenes(storyId, client);
    const scene1 = story!.scenes.find((s) => s.sceneNumber === 1)!;
    assert.equal(scene1.videoGeneratingSince, null);
    assert.equal(scene1.videoStatus, "FAILED");
  } finally {
    await client.$disconnect();
  }
});

test("setVideoSaveCorrupted sets the flag true for exactly the targeted scene and false for every sibling", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-genrepo-video-corrupted";
  await seedStory(storyId, url);

  const client = createPrismaClient(url);
  try {
    await setVideoSaveCorrupted(storyId, 1, client);

    const story = await findStoryWithScenes(storyId, client);
    const scene1 = story!.scenes.find((s) => s.sceneNumber === 1)!;
    assert.equal(scene1.videoSaveCorrupted, true);
    for (const scene of story!.scenes) {
      if (scene.sceneNumber === 1) continue;
      assert.equal(scene.videoSaveCorrupted, false);
    }
  } finally {
    await client.$disconnect();
  }
});

test("clearVideoSaveCorrupted returns the flag to false", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-genrepo-video-corrupted-clear";
  await seedStory(storyId, url);

  const client = createPrismaClient(url);
  try {
    await setVideoSaveCorrupted(storyId, 1, client);
    await clearVideoSaveCorrupted(storyId, 1, client);

    const story = await findStoryWithScenes(storyId, client);
    const scene1 = story!.scenes.find((s) => s.sceneNumber === 1)!;
    assert.equal(scene1.videoSaveCorrupted, false);
  } finally {
    await client.$disconnect();
  }
});

test("setImageSaveCorrupted / clearImageSaveCorrupted behave identically on the image flag and never touch the video flag", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-genrepo-image-corrupted";
  await seedStory(storyId, url);

  const client = createPrismaClient(url);
  try {
    await setVideoSaveCorrupted(storyId, 1, client);
    await setImageSaveCorrupted(storyId, 1, client);

    let story = await findStoryWithScenes(storyId, client);
    let scene1 = story!.scenes.find((s) => s.sceneNumber === 1)!;
    assert.equal(scene1.imageSaveCorrupted, true);
    assert.equal(scene1.videoSaveCorrupted, true, "setImageSaveCorrupted must not touch the video flag");

    await clearImageSaveCorrupted(storyId, 1, client);

    story = await findStoryWithScenes(storyId, client);
    scene1 = story!.scenes.find((s) => s.sceneNumber === 1)!;
    assert.equal(scene1.imageSaveCorrupted, false);
    assert.equal(scene1.videoSaveCorrupted, true, "clearImageSaveCorrupted must not touch the video flag");
  } finally {
    await client.$disconnect();
  }
});

test("calling any of the four new writers for a scene number that does not exist logs once and returns normally without throwing", async () => {
  const url = tmpDatabaseUrl();
  const storyId = "story-genrepo-corrupted-missing-scene";
  await seedStory(storyId, url);

  const client = createPrismaClient(url);
  try {
    const writers = [setVideoSaveCorrupted, clearVideoSaveCorrupted, setImageSaveCorrupted, clearImageSaveCorrupted];
    for (const writer of writers) {
      const errorCount = await countConsoleErrors(() => writer(storyId, 99, client));
      assert.equal(errorCount, 1, `expected exactly one log line from ${writer.name}`);
    }

    const story = await findStoryWithScenes(storyId, client);
    for (const scene of story!.scenes) {
      assert.equal(scene.videoSaveCorrupted, false);
      assert.equal(scene.imageSaveCorrupted, false);
    }
  } finally {
    await client.$disconnect();
  }
});
